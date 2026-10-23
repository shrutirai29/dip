import time
import logging
import threading
from collections import deque
from typing import Dict, Any, Optional, Tuple, List, Callable
import numpy as np

logger = logging.getLogger("crowdguard.scheduler")

class ScheduledInferenceRequest:
    """Represents a bounded single-frame inference request for one camera."""
    __slots__ = (
        "camera_id",
        "frame_id",
        "capture_wallclock",
        "capture_monotonic",
        "enqueued_monotonic",
        "frame",
        "imgsz",
        "conf_threshold",
        "callback",
        "is_obsolete",
    )

    def __init__(
        self,
        camera_id: str,
        frame_id: int,
        capture_timestamp: float,
        frame: np.ndarray,
        imgsz: int = 640,
        conf_threshold: Optional[float] = None,
        callback: Optional[Callable[[List[Dict[str, Any]], Dict[str, Any]], None]] = None,
        capture_monotonic: Optional[float] = None,
    ):
        self.camera_id = camera_id
        self.frame_id = frame_id
        self.capture_wallclock = float(capture_timestamp)
        self.capture_monotonic = capture_monotonic if capture_monotonic is not None else time.perf_counter()
        self.enqueued_monotonic = time.perf_counter()
        self.frame = frame
        self.imgsz = imgsz
        self.conf_threshold = conf_threshold
        self.callback = callback
        self.is_obsolete = False

    @property
    def capture_timestamp(self) -> float:
        """Backward-compatibility property returning wallclock capture time."""
        return self.capture_wallclock

    @property
    def enqueued_timestamp(self) -> float:
        """Backward-compatibility property returning monotonic enqueue timestamp."""
        return self.enqueued_monotonic


class FairInferenceScheduler:
    """
    Fair, bounded-buffer shared YOLO inference scheduler for multi-camera streams.
    
    Guarantees:
    1. Bounded queue: Exactly ONE pending frame slot per camera (buffer size = 1).
    2. Zero starvation: Strict round-robin dispatch among cameras with pending work.
    3. Freshness: Newer frames replace un-started older frames, eliminating queue lag.
    4. CPU stability: Serialized inference execution prevents PyTorch OpenMP thread thrashing.
    5. Isolation: Exceptions in one camera do not affect other active streams.
    6. Performance Telemetry: Unambiguous separate metrics for wait times, inference durations,
       capture-to-result latencies, and pending-frame replacement accounting.
    """

    def __init__(self, shared_detector=None):
        self._detector = shared_detector
        self._lock = threading.Lock()
        self._work_available = threading.Condition(self._lock)
        
        # Policy & Adaptive Prioritization
        self._policy: str = "round_robin"  # "round_robin" or "adaptive_risk"
        self._max_pending_age_sec: float = 2.5
        self._priority_weights: Dict[str, float] = {}
        self._dispatches_since_last_run: Dict[str, int] = {}
        self._starvation_multiplier: int = 2
        self._dropped_stale_total: int = 0
        self._last_priority_reasons: Dict[str, str] = {}

        # Camera registration and round-robin order
        self._registered_cameras: List[str] = []
        self._camera_order: deque = deque()
        
        # Single-slot per camera: camera_id -> ScheduledInferenceRequest
        self._pending_slots: Dict[str, ScheduledInferenceRequest] = {}
        
        # Telemetry per camera
        self._telemetry: Dict[str, Dict[str, Any]] = {}
        
        # Worker thread
        self._worker_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._running = False

    def set_detector(self, detector):
        with self._lock:
            self._detector = detector

    def set_policy(self, policy: str):
        with self._lock:
            if policy not in ("round_robin", "adaptive_risk"):
                raise ValueError(f"Invalid policy '{policy}'. Must be 'round_robin' or 'adaptive_risk'.")
            self._policy = policy
            logger.info(f"FairInferenceScheduler policy set to '{policy}'.")

    def get_policy(self) -> str:
        with self._lock:
            return self._policy

    def set_max_pending_age(self, age_sec: float):
        with self._lock:
            self._max_pending_age_sec = max(0.01, float(age_sec))

    def get_max_pending_age(self) -> float:
        with self._lock:
            return self._max_pending_age_sec

    def update_camera_risk(self, camera_id: str, risk_score: float, motion_anomaly: float = 0.0):
        """
        Dynamically updates camera scheduling priority based on risk and motion indicators.
        Normalizes weight into bounded engineering range [1.0, 3.0].
        """
        with self._lock:
            weight = 1.0 + min(2.0, max(0.0, (float(risk_score) / 50.0) + (float(motion_anomaly) / 20.0)))
            self._priority_weights[camera_id] = round(weight, 3)

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "running": self._running,
                "policy": self._policy,
                "max_pending_age_sec": self._max_pending_age_sec,
                "registered_cameras_count": len(self._registered_cameras),
                "pending_slots_count": len(self._pending_slots),
                "total_dropped_stale": self._dropped_stale_total,
                "camera_order": list(self._camera_order),
                "priority_weights": dict(self._priority_weights),
                "dispatches_since_last_run": dict(self._dispatches_since_last_run),
                "last_priority_reasons": dict(self._last_priority_reasons),
            }

    def start(self):
        with self._lock:
            if self._running:
                return
            self._stop_event.clear()
            self._running = True
            self._worker_thread = threading.Thread(
                target=self._worker_loop,
                name="FairInferenceScheduler-Worker",
                daemon=True
            )
            self._worker_thread.start()
            logger.info(f"FairInferenceScheduler started successfully with policy='{self._policy}'.")

    def stop(self, timeout: float = 2.0):
        with self._lock:
            if not self._running:
                return
            self._running = False
            self._stop_event.set()
            self._work_available.notify_all()

        if self._worker_thread and self._worker_thread.is_alive():
            self._worker_thread.join(timeout=timeout)
            self._worker_thread = None
        logger.info("FairInferenceScheduler stopped.")

    def register_camera(self, camera_id: str):
        with self._lock:
            if camera_id not in self._registered_cameras:
                self._registered_cameras.append(camera_id)
                self._camera_order.append(camera_id)
                self._priority_weights[camera_id] = 1.0
                self._dispatches_since_last_run[camera_id] = 0
                self._last_priority_reasons[camera_id] = "registered"
                self._telemetry[camera_id] = {
                    "total_submitted": 0,
                    "total_dispatched": 0,
                    "total_completed": 0,
                    "total_failed": 0,
                    "total_replaced_pending": 0,
                    "total_dropped_stale": 0,
                    "last_wait_ms": 0.0,
                    "last_duration_ms": 0.0,
                    "last_capture_to_result_ms": 0.0,
                    "last_capture_to_infer_ms": 0.0,
                    "mean_wait_ms": 0.0,
                    "mean_duration_ms": 0.0,
                    "mean_capture_to_result_ms": 0.0,
                }
                logger.debug(f"Registered camera {camera_id} in inference scheduler.")

    def unregister_camera(self, camera_id: str):
        with self._lock:
            if camera_id in self._registered_cameras:
                self._registered_cameras.remove(camera_id)
            if camera_id in self._camera_order:
                self._camera_order = deque([c for c in self._camera_order if c != camera_id])
            if camera_id in self._pending_slots:
                req = self._pending_slots.pop(camera_id)
                req.is_obsolete = True
            self._priority_weights.pop(camera_id, None)
            self._dispatches_since_last_run.pop(camera_id, None)
            self._last_priority_reasons.pop(camera_id, None)
            logger.debug(f"Unregistered camera {camera_id} from inference scheduler.")

    def schedule_inference(
        self,
        camera_id: str,
        frame_id: int,
        capture_timestamp: float,
        frame: np.ndarray,
        imgsz: int = 640,
        conf_threshold: Optional[float] = None,
        callback: Optional[Callable[[List[Dict[str, Any]], Dict[str, Any]], None]] = None,
        capture_monotonic: Optional[float] = None,
    ) -> bool:
        """
        Enqueues a frame for inference. If a frame for this camera is already
        pending, the older frame is replaced immediately (marked obsolete).
        This guarantees bounded O(1) buffer and lowest possible latency.
        """
        if not self._running or self._stop_event.is_set():
            return False

        req = ScheduledInferenceRequest(
            camera_id=camera_id,
            frame_id=frame_id,
            capture_timestamp=capture_timestamp,
            frame=frame,
            imgsz=imgsz,
            conf_threshold=conf_threshold,
            callback=callback,
            capture_monotonic=capture_monotonic,
        )

        with self._lock:
            if camera_id not in self._registered_cameras:
                self._registered_cameras.append(camera_id)
                self._camera_order.append(camera_id)
                self._telemetry[camera_id] = {
                    "total_submitted": 0,
                    "total_dispatched": 0,
                    "total_completed": 0,
                    "total_failed": 0,
                    "total_replaced_pending": 0,
                    "last_wait_ms": 0.0,
                    "last_duration_ms": 0.0,
                    "last_capture_to_result_ms": 0.0,
                    "mean_wait_ms": 0.0,
                    "mean_duration_ms": 0.0,
                    "mean_capture_to_result_ms": 0.0,
                }

            telem = self._telemetry[camera_id]
            telem["total_submitted"] += 1

            # Bounded buffer replacement: un-started pending frame is replaced
            if camera_id in self._pending_slots:
                prev_req = self._pending_slots[camera_id]
                prev_req.is_obsolete = True
                telem["total_replaced_pending"] += 1

            self._pending_slots[camera_id] = req
            self._work_available.notify()
            return True

    def execute_sync(
        self,
        camera_id: str,
        frame_id: int,
        capture_wallclock: Optional[float] = None,
        frame: Optional[np.ndarray] = None,
        imgsz: int = 640,
        conf_threshold: Optional[float] = None,
        timeout: float = 1.0,
        capture_monotonic: Optional[float] = None,
        capture_timestamp: Optional[float] = None,
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Synchronous scheduling helper: enqueues the request and blocks until
        completed or timeout occurs. Useful for synchronous camera loops.
        """
        effective_wallclock = capture_wallclock if capture_wallclock is not None else (capture_timestamp or time.time())
        if frame is None:
            return [], {"error": "empty_or_none_frame"}
        result_holder: List[Any] = [None, None]
        done_event = threading.Event()

        def _on_complete(detections, meta):
            result_holder[0] = detections
            result_holder[1] = meta
            done_event.set()

        enqueued = self.schedule_inference(
            camera_id=camera_id,
            frame_id=frame_id,
            capture_timestamp=effective_wallclock,
            frame=frame,
            imgsz=imgsz,
            conf_threshold=conf_threshold,
            callback=_on_complete,
            capture_monotonic=capture_monotonic,
        )

        if not enqueued:
            return [], {"error": "scheduler_not_running"}

        signaled = done_event.wait(timeout=timeout)
        if not signaled:
            return [], {"error": "scheduler_timeout"}

        return result_holder[0] or [], result_holder[1] or {}

    def get_telemetry(self, camera_id: str) -> Dict[str, Any]:
        with self._lock:
            telem = self._telemetry.get(camera_id)
            if telem:
                submitted = max(1, telem.get("total_submitted", 0))
                dispatched = max(1, telem.get("total_dispatched", 0))
                replaced = telem.get("total_replaced_pending", 0)
                stale_dropped = telem.get("total_dropped_stale", 0)
                failed = telem.get("total_failed", 0)
                res = dict(telem)
                res["pending_replacement_rate"] = round(replaced / submitted, 4)
                res["inference_failure_rate"] = round(failed / dispatched, 4)
                res["stale_drop_rate"] = round(stale_dropped / submitted, 4)
                res["priority_weight"] = self._priority_weights.get(camera_id, 1.0)
                res["dispatches_since_last_run"] = self._dispatches_since_last_run.get(camera_id, 0)
                res["last_priority_reason"] = self._last_priority_reasons.get(camera_id, "none")
                res["active_policy"] = self._policy
                # Backward-compatibility aliases
                res["total_replaced_obsolete"] = replaced
                res["total_scheduled"] = telem.get("total_submitted", 0)
                res["total_executed"] = telem.get("total_completed", 0)
                return res
            return {
                "total_submitted": 0,
                "total_dispatched": 0,
                "total_completed": 0,
                "total_failed": 0,
                "total_replaced_pending": 0,
                "total_dropped_stale": 0,
                "total_scheduled": 0,
                "total_executed": 0,
                "total_replaced_obsolete": 0,
                "pending_replacement_rate": 0.0,
                "inference_failure_rate": 0.0,
                "stale_drop_rate": 0.0,
                "priority_weight": self._priority_weights.get(camera_id, 1.0),
                "dispatches_since_last_run": self._dispatches_since_last_run.get(camera_id, 0),
                "last_priority_reason": self._last_priority_reasons.get(camera_id, "none"),
                "active_policy": self._policy,
                "last_wait_ms": 0.0,
                "last_duration_ms": 0.0,
                "last_capture_to_result_ms": 0.0,
                "last_capture_to_infer_ms": 0.0,
                "mean_wait_ms": 0.0,
                "mean_duration_ms": 0.0,
                "mean_capture_to_result_ms": 0.0,
            }

    def _select_next_request_locked(self) -> Tuple[Optional[ScheduledInferenceRequest], str]:
        """
        Selects next request implementing starvation prevention, adaptive priority, and stale frame rejection.
        Must be called with self._lock held.
        """
        while self._pending_slots and not self._stop_event.is_set():
            active_cams = [c for c in self._registered_cameras if c in self._pending_slots]
            if not active_cams:
                return None, "none"

            starvation_limit = max(2, self._starvation_multiplier * len(self._registered_cameras))
            target_cid = None
            reason = "round_robin_turn"

            # 1. Starvation prevention: any pending camera with dispatches >= starvation_limit
            starved = [c for c in active_cams if self._dispatches_since_last_run.get(c, 0) >= starvation_limit]
            if starved:
                starved.sort(key=lambda c: self._dispatches_since_last_run.get(c, 0), reverse=True)
                target_cid = starved[0]
                reason = "starvation_prevention"
            elif self._policy == "adaptive_risk":
                # 2. Adaptive risk prioritization with aging weight:
                scored = []
                for c in active_cams:
                    w = self._priority_weights.get(c, 1.0)
                    wait_count = self._dispatches_since_last_run.get(c, 0)
                    score = w * (1.0 + 0.25 * wait_count)
                    scored.append((score, c, w))
                scored.sort(key=lambda x: x[0], reverse=True)
                target_cid = scored[0][1]
                top_weight = scored[0][2]
                reason = "elevated_risk" if top_weight > 1.2 else "standard_priority"
            else:
                # 3. Round-robin turn
                attempts = len(self._camera_order)
                while attempts > 0:
                    cand = self._camera_order[0]
                    self._camera_order.rotate(-1)
                    attempts -= 1
                    if cand in self._pending_slots:
                        target_cid = cand
                        reason = "round_robin_turn"
                        break

            if target_cid is None or target_cid not in self._pending_slots:
                return None, "none"

            req = self._pending_slots.pop(target_cid)
            if req.is_obsolete:
                continue

            # Check if frame is too stale (> max_pending_age_sec)
            now_mono = time.perf_counter()
            frame_age = now_mono - req.capture_monotonic
            if frame_age > self._max_pending_age_sec:
                req.is_obsolete = True
                self._dropped_stale_total += 1
                if target_cid in self._telemetry:
                    self._telemetry[target_cid]["total_dropped_stale"] = (
                        self._telemetry[target_cid].get("total_dropped_stale", 0) + 1
                    )
                if req.callback:
                    try:
                        req.callback([], {"error": "stale_frame_dropped", "age_sec": round(frame_age, 3)})
                    except Exception:
                        pass
                continue

            # Update starvation counters
            self._dispatches_since_last_run[target_cid] = 0
            for oc in self._registered_cameras:
                if oc != target_cid:
                    self._dispatches_since_last_run[oc] = self._dispatches_since_last_run.get(oc, 0) + 1

            self._last_priority_reasons[target_cid] = reason
            return req, reason

        return None, "none"

    def _worker_loop(self):
        """Worker thread executing adaptive/round-robin dispatch among active camera slots."""
        while not self._stop_event.is_set():
            target_req: Optional[ScheduledInferenceRequest] = None
            dispatch_reason: str = "none"

            with self._lock:
                target_req, dispatch_reason = self._select_next_request_locked()
                if target_req is None:
                    self._work_available.wait(timeout=0.05)
                    continue

            # Record exact monotonic start boundary
            infer_start_monotonic = time.perf_counter()
            wait_ms = (infer_start_monotonic - target_req.enqueued_monotonic) * 1000.0
            capture_to_infer_ms = (infer_start_monotonic - target_req.capture_monotonic) * 1000.0

            detections: List[Dict[str, Any]] = []
            diag: Dict[str, Any] = {}
            is_success = False

            try:
                if self._detector is not None and target_req.frame is not None:
                    detections, diag = self._detector.detect_persons_with_diagnostics(
                        frame=target_req.frame,
                        imgsz=target_req.imgsz,
                        conf_threshold=target_req.conf_threshold
                    )
                    is_success = True
            except Exception as e:
                logger.warning(f"Inference exception on camera {target_req.camera_id}: {e}")
                diag = {"error": str(e), "timestamp": time.time()}

            infer_end_monotonic = time.perf_counter()
            duration_ms = (infer_end_monotonic - infer_start_monotonic) * 1000.0
            capture_to_result_ms = (infer_end_monotonic - target_req.capture_monotonic) * 1000.0

            # Update telemetry with distinct metrics
            with self._lock:
                c_telem = self._telemetry.get(target_req.camera_id)
                if c_telem:
                    c_telem["total_dispatched"] += 1
                    if is_success:
                        c_telem["total_completed"] += 1
                    else:
                        c_telem["total_failed"] += 1

                    c_telem["last_wait_ms"] = round(wait_ms, 2)
                    c_telem["last_duration_ms"] = round(duration_ms, 2)
                    c_telem["last_capture_to_result_ms"] = round(capture_to_result_ms, 2)
                    c_telem["last_capture_to_infer_ms"] = round(capture_to_infer_ms, 2)
                    c_telem["last_priority_reason"] = dispatch_reason

                    alpha = 0.15
                    c_telem["mean_wait_ms"] = round(
                        c_telem["mean_wait_ms"] * (1 - alpha) + wait_ms * alpha, 2
                    )
                    c_telem["mean_duration_ms"] = round(
                        c_telem["mean_duration_ms"] * (1 - alpha) + duration_ms * alpha, 2
                    )
                    c_telem["mean_capture_to_result_ms"] = round(
                        c_telem["mean_capture_to_result_ms"] * (1 - alpha) + capture_to_result_ms * alpha, 2
                    )

            # Diagnostic payload associated strictly with THIS frame
            diag["scheduler_wait_ms"] = round(wait_ms, 2)
            diag["inference_duration_ms"] = round(duration_ms, 2)
            diag["scheduler_duration_ms"] = round(duration_ms, 2) # Backward compatibility
            diag["capture_to_inference_ms"] = round(capture_to_infer_ms, 2)
            diag["capture_to_result_ms"] = round(capture_to_result_ms, 2)
            diag["priority_reason"] = dispatch_reason
            diag["active_policy"] = self._policy
            diag["scheduler_frame_id"] = target_req.frame_id
            diag["capture_wallclock"] = target_req.capture_wallclock
            diag["capture_monotonic"] = target_req.capture_monotonic
            diag["infer_start_monotonic"] = infer_start_monotonic
            diag["infer_end_monotonic"] = infer_end_monotonic

            # Fire callback if requested
            if target_req.callback and not target_req.is_obsolete:
                try:
                    target_req.callback(detections, diag)
                except Exception as cb_err:
                    logger.debug(f"Scheduler callback exception on {target_req.camera_id}: {cb_err}")


# Global scheduler instance
fair_inference_scheduler = FairInferenceScheduler()
