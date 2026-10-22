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
        "capture_timestamp",
        "enqueued_timestamp",
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
    ):
        self.camera_id = camera_id
        self.frame_id = frame_id
        self.capture_timestamp = capture_timestamp
        self.enqueued_timestamp = time.perf_counter()
        self.frame = frame
        self.imgsz = imgsz
        self.conf_threshold = conf_threshold
        self.callback = callback
        self.is_obsolete = False


class FairInferenceScheduler:
    """
    Fair, bounded-buffer shared YOLO inference scheduler for multi-camera streams.
    
    Guarantees:
    1. Bounded queue: Exactly ONE pending frame slot per camera (buffer size = 1).
    2. Zero starvation: Strict round-robin dispatch among cameras with pending work.
    3. Freshness: Newer frames replace un-started older frames, eliminating queue lag.
    4. CPU stability: Serialized inference execution prevents PyTorch OpenMP thread thrashing.
    5. Isolation: Exceptions in one camera do not affect other active streams.
    6. Performance Telemetry: Measures queue wait times, inference durations, and dropped frames.
    """

    def __init__(self, shared_detector=None):
        self._detector = shared_detector
        self._lock = threading.Lock()
        self._work_available = threading.Condition(self._lock)
        
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
            logger.info("FairInferenceScheduler started successfully.")

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
                self._telemetry[camera_id] = {
                    "total_scheduled": 0,
                    "total_executed": 0,
                    "total_replaced_obsolete": 0,
                    "last_wait_ms": 0.0,
                    "last_duration_ms": 0.0,
                    "mean_wait_ms": 0.0,
                    "mean_duration_ms": 0.0,
                }
                logger.debug(f"Registered camera {camera_id} in inference scheduler.")

    def unregister_camera(self, camera_id: str):
        with self._lock:
            if camera_id in self._registered_cameras:
                self._registered_cameras.remove(camera_id)
            if camera_id in self._camera_order:
                # Remove from deque
                self._camera_order = deque([c for c in self._camera_order if c != camera_id])
            if camera_id in self._pending_slots:
                req = self._pending_slots.pop(camera_id)
                req.is_obsolete = True
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
            callback=callback
        )

        with self._lock:
            if camera_id not in self._registered_cameras:
                self._registered_cameras.append(camera_id)
                self._camera_order.append(camera_id)
                self._telemetry[camera_id] = {
                    "total_scheduled": 0,
                    "total_executed": 0,
                    "total_replaced_obsolete": 0,
                    "last_wait_ms": 0.0,
                    "last_duration_ms": 0.0,
                    "mean_wait_ms": 0.0,
                    "mean_duration_ms": 0.0,
                }

            telem = self._telemetry[camera_id]
            telem["total_scheduled"] += 1

            # Bounded buffer replacement
            if camera_id in self._pending_slots:
                prev_req = self._pending_slots[camera_id]
                prev_req.is_obsolete = True
                telem["total_replaced_obsolete"] += 1

            self._pending_slots[camera_id] = req
            self._work_available.notify()
            return True

    def execute_sync(
        self,
        camera_id: str,
        frame_id: int,
        capture_timestamp: float,
        frame: np.ndarray,
        imgsz: int = 640,
        conf_threshold: Optional[float] = None,
        timeout: float = 1.0,
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Synchronous scheduling helper: enqueues the request and blocks until
        completed or timeout occurs. Useful for synchronous camera loops.
        """
        result_holder: List[Any] = [None, None]
        done_event = threading.Event()

        def _on_complete(detections, meta):
            result_holder[0] = detections
            result_holder[1] = meta
            done_event.set()

        enqueued = self.schedule_inference(
            camera_id=camera_id,
            frame_id=frame_id,
            capture_timestamp=capture_timestamp,
            frame=frame,
            imgsz=imgsz,
            conf_threshold=conf_threshold,
            callback=_on_complete
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
                return dict(telem)
            return {
                "total_scheduled": 0,
                "total_executed": 0,
                "total_replaced_obsolete": 0,
                "last_wait_ms": 0.0,
                "last_duration_ms": 0.0,
                "mean_wait_ms": 0.0,
                "mean_duration_ms": 0.0,
            }

    def _worker_loop(self):
        """Worker thread executing round-robin dispatch among active camera slots."""
        while not self._stop_event.is_set():
            target_req: Optional[ScheduledInferenceRequest] = None
            wait_ms: float = 0.0

            with self._lock:
                # Find next camera with a pending frame in round-robin order
                attempts = len(self._camera_order)
                while attempts > 0:
                    cand_id = self._camera_order[0]
                    self._camera_order.rotate(-1)  # Move head to tail for fair rotation
                    attempts -= 1

                    if cand_id in self._pending_slots:
                        req = self._pending_slots.pop(cand_id)
                        if not req.is_obsolete:
                            target_req = req
                            wait_ms = (time.perf_counter() - req.enqueued_timestamp) * 1000.0
                            break

                if target_req is None:
                    # No pending work; wait for signal
                    self._work_available.wait(timeout=0.05)
                    continue

            # Execute inference outside the lock
            exec_t0 = time.perf_counter()
            detections: List[Dict[str, Any]] = []
            diag: Dict[str, Any] = {}

            try:
                if self._detector is not None and target_req.frame is not None:
                    detections, diag = self._detector.detect_persons_with_diagnostics(
                        frame=target_req.frame,
                        imgsz=target_req.imgsz,
                        conf_threshold=target_req.conf_threshold
                    )
            except Exception as e:
                logger.warning(f"Inference exception on camera {target_req.camera_id}: {e}")
                diag = {"error": str(e), "timestamp": time.time()}

            duration_ms = (time.perf_counter() - exec_t0) * 1000.0

            # Update telemetry
            with self._lock:
                c_telem = self._telemetry.get(target_req.camera_id)
                if c_telem:
                    c_telem["total_executed"] += 1
                    c_telem["last_wait_ms"] = round(wait_ms, 2)
                    c_telem["last_duration_ms"] = round(duration_ms, 2)
                    # Exponential moving average for stability
                    alpha = 0.15
                    c_telem["mean_wait_ms"] = round(
                        c_telem["mean_wait_ms"] * (1 - alpha) + wait_ms * alpha, 2
                    )
                    c_telem["mean_duration_ms"] = round(
                        c_telem["mean_duration_ms"] * (1 - alpha) + duration_ms * alpha, 2
                    )

            diag["scheduler_wait_ms"] = round(wait_ms, 2)
            diag["scheduler_duration_ms"] = round(duration_ms, 2)
            diag["scheduler_frame_id"] = target_req.frame_id
            diag["capture_age_ms"] = round((time.time() - target_req.capture_timestamp) * 1000.0, 2)

            # Fire callback if requested
            if target_req.callback and not target_req.is_obsolete:
                try:
                    target_req.callback(detections, diag)
                except Exception as cb_err:
                    logger.debug(f"Scheduler callback exception on {target_req.camera_id}: {cb_err}")


# Global scheduler instance
fair_inference_scheduler = FairInferenceScheduler()
