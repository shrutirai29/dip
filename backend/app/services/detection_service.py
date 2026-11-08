import os
import re
import time
import logging
from typing import Optional, List, Dict, Any, Tuple
import cv2
import torch
import numpy as np
from ultralytics import YOLO
from app.core.config import settings

logger = logging.getLogger("crowdguard.detection")

def sanitize_fallback_reason(reason: Optional[str]) -> Optional[str]:
    """Sanitizes backend fallback errors to avoid leaking user directories or embedded credentials."""
    if not reason:
        return reason
    cleaned = re.sub(r'[A-Za-z]:\\[Uu]sers\\[^\\]+\\', lambda m: '...\\', str(reason))
    cleaned = re.sub(r'/home/[^/]+/', lambda m: '.../', cleaned)
    cleaned = re.sub(r'://[^:@\s]+:[^@\s]+@', lambda m: '://***:***@', cleaned)
    return cleaned

class DetectionService:
    """
    Person detection service supporting PyTorch CPU (default) and ONNX Runtime CPU.
    Strictly filters for COCO Class 0 ('person').
    Performs boundary clamping, degenerate box rejection, and development diagnostics.
    """

    def __init__(
        self,
        model_name: Optional[str] = None,
        conf_threshold: Optional[float] = None,
        backend: Optional[str] = None,
        onnx_path: Optional[str] = None
    ):
        self.model_name = model_name or settings.YOLO_MODEL_NAME
        self.conf_threshold = conf_threshold if conf_threshold is not None else settings.DEFAULT_CONF_THRESHOLD
        self.requested_backend = (backend or getattr(settings, "INFERENCE_BACKEND", "pytorch")).lower()
        self.backend = self.requested_backend
        self.onnx_path = onnx_path or getattr(settings, "ONNX_MODEL_PATH", "yolov8n.onnx")
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.fallback_occurred = False
        self.fallback_reason: Optional[str] = None
        self._latest_diagnostics: Dict[str, Any] = {}
        self._load_model()

    def _load_model(self):
        if self.backend == "onnx":
            try:
                candidate_path = self.onnx_path
                if not os.path.isabs(candidate_path):
                    if not os.path.exists(candidate_path):
                        alt = os.path.join(getattr(settings, "BASE_DIR", "."), candidate_path)
                        if os.path.exists(alt):
                            candidate_path = alt

                if not os.path.exists(candidate_path):
                    raise FileNotFoundError(f"ONNX model file not found at '{candidate_path}'")

                import onnxruntime as ort

                session_options = ort.SessionOptions()
                session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
                self.ort_session = ort.InferenceSession(
                    candidate_path,
                    sess_options=session_options,
                    providers=["CPUExecutionProvider"]
                )
                self.onnx_path = candidate_path
                self.input_name = self.ort_session.get_inputs()[0].name
                logger.info(f"ONNX Runtime model successfully initialized from '{candidate_path}' via CPUExecutionProvider.")
                return
            except Exception as e:
                logger.warning(
                    f"Failed to initialize ONNX Runtime backend ({e}). "
                    f"Falling back safely to PyTorch CPU backend."
                )
                self.backend = "pytorch"
                self.fallback_occurred = True
                self.fallback_reason = sanitize_fallback_reason(str(e))

        try:
            logger.info(f"Loading YOLO model {self.model_name} on {self.device}...")
            self.model = YOLO(self.model_name)
            self.model.to(self.device)

            # Strict verification of COCO Class 0 semantics
            class_0_name = self.model.names.get(0, None)
            if class_0_name != "person":
                error_msg = f"Fatal model configuration error: Class 0 is '{class_0_name}', expected 'person'."
                logger.error(error_msg)
                raise ValueError(error_msg)

            logger.info(f"YOLO successfully initialized on {self.device}. Verified Class 0 = '{class_0_name}'.")
        except Exception as e:
            logger.exception(f"Error initializing YOLO model: {e}")
            raise e

    def warmup(self, imgsz: int = 640) -> float:
        """
        Executes a dummy inference pass to compile kernels, allocate anchor buffers,
        and absorb the initial cold-start latency spike. Returns warmup duration in ms.
        """
        t0 = time.perf_counter()
        dummy = np.zeros((480, 640, 3), dtype=np.uint8)
        self.detect_persons(dummy, imgsz=imgsz)
        duration_ms = (time.perf_counter() - t0) * 1000.0
        logger.info(f"DetectionService warmed up in {duration_ms:.1f}ms.")
        return duration_ms

    def detect_persons(
        self,
        frame: np.ndarray,
        imgsz: int = 640,
        conf_threshold: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """
        Runs person detection inference on an RGB/BGR numpy image frame.
        Filters strictly for validated COCO Class 0 ('person') bounding boxes.
        Returns a list of dicts: [{'bbox': [x1, y1, x2, y2], 'confidence': float, 'class_id': 0, 'class_name': 'person'}]
        """
        detections, _ = self.detect_persons_with_diagnostics(
            frame=frame,
            imgsz=imgsz,
            conf_threshold=conf_threshold
        )
        return detections

    def detect_persons_with_diagnostics(
        self,
        frame: np.ndarray,
        imgsz: int = 640,
        conf_threshold: Optional[float] = None
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Performs person detection while recording detailed development-only diagnostics:
        - Class ID and class name
        - Confidence score
        - Bounding-box coordinates
        - Model input dimensions vs original-frame dimensions
        - Whether the detection survives filtering and tracking rejection reason
        """
        if frame is None or frame.size == 0:
            return [], {"error": "empty_frame", "timestamp": time.time()}

        frame_h, frame_w = frame.shape[:2]
        effective_conf = float(conf_threshold) if conf_threshold is not None else float(self.conf_threshold)
        effective_conf = max(0.05, min(1.0, effective_conf))

        if self.backend == "onnx" and hasattr(self, "ort_session"):
            return self._detect_onnx_with_diagnostics(frame, imgsz=imgsz, effective_conf=effective_conf)

        # Run inference filtering for class 0
        with torch.inference_mode():
            results = self.model(
                frame,
                classes=[0],
                conf=effective_conf,
                imgsz=imgsz,
                verbose=False
            )

        detections: List[Dict[str, Any]] = []
        raw_candidates: List[Dict[str, Any]] = []

        if results and len(results) > 0 and results[0].boxes is not None:
            boxes = results[0].boxes
            for box in boxes:
                xyxy = box.xyxy[0].cpu().numpy().tolist()
                conf = float(box.conf[0].cpu().numpy())
                cls_id = int(box.cls[0].cpu().numpy())
                cls_name = self.model.names.get(cls_id, f"class_{cls_id}")

                # Raw coordinates
                rx1, ry1, rx2, ry2 = xyxy

                # 1. Class filter validation
                if cls_id != 0:
                    raw_candidates.append({
                        "class_id": cls_id,
                        "class_name": cls_name,
                        "confidence": round(conf, 4),
                        "raw_bbox": [rx1, ry1, rx2, ry2],
                        "survives_filter": False,
                        "rejection_reason": f"non_person_class_{cls_name}"
                    })
                    continue

                # 2. Confidence filter validation
                if conf < effective_conf:
                    raw_candidates.append({
                        "class_id": cls_id,
                        "class_name": cls_name,
                        "confidence": round(conf, 4),
                        "raw_bbox": [rx1, ry1, rx2, ry2],
                        "survives_filter": False,
                        "rejection_reason": f"low_confidence_{conf:.4f}_below_{effective_conf:.4f}"
                    })
                    continue

                # 3. Coordinate clamping to frame boundaries
                x1 = max(0, min(frame_w - 1, int(round(rx1))))
                y1 = max(0, min(frame_h - 1, int(round(ry1))))
                x2 = max(0, min(frame_w, int(round(rx2))))
                y2 = max(0, min(frame_h, int(round(ry2))))

                # 4. Degenerate box validation
                w = x2 - x1
                h = y2 - y1
                if w <= 2 or h <= 2:
                    raw_candidates.append({
                        "class_id": cls_id,
                        "class_name": cls_name,
                        "confidence": round(conf, 4),
                        "raw_bbox": [rx1, ry1, rx2, ry2],
                        "clamped_bbox": [x1, y1, x2, y2],
                        "survives_filter": False,
                        "rejection_reason": "degenerate_dimensions_too_small"
                    })
                    continue

                det_record = {
                    "bbox": [x1, y1, x2, y2],
                    "confidence": round(conf, 4),
                    "class_id": 0,
                    "class_name": "person"
                }
                detections.append(det_record)
                raw_candidates.append({
                    "class_id": 0,
                    "class_name": "person",
                    "confidence": round(conf, 4),
                    "bbox": [x1, y1, x2, y2],
                    "survives_filter": True,
                    "rejection_reason": None
                })

        diagnostics = {
            "timestamp": round(time.time(), 3),
            "model_name": self.model_name,
            "device": "cpu" if self.backend == "onnx" else self.device,
            "backend": self.backend,
            "requested_backend": self.requested_backend,
            "fallback_occurred": self.fallback_occurred,
            "fallback_reason": self.fallback_reason,
            "input_imgsz": imgsz,
            "frame_dims": {"width": frame_w, "height": frame_h},
            "conf_threshold": effective_conf,
            "total_candidates": len(raw_candidates),
            "accepted_count": len(detections),
            "candidates": raw_candidates
        }
        self._latest_diagnostics = diagnostics
        return detections, diagnostics

    def get_latest_diagnostics(self) -> Dict[str, Any]:
        """Returns the most recent detection diagnostic record."""
        return dict(self._latest_diagnostics)

    def _detect_onnx_with_diagnostics(
        self,
        frame: np.ndarray,
        imgsz: int = 640,
        effective_conf: float = 0.30
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        frame_h, frame_w = frame.shape[:2]

        # 1. Aspect-ratio preserving letterbox padding
        r = min(imgsz / frame_h, imgsz / frame_w)
        new_unpad = (int(round(frame_w * r)), int(round(frame_h * r)))
        dw = (imgsz - new_unpad[0]) / 2.0
        dh = (imgsz - new_unpad[1]) / 2.0

        resized = cv2.resize(frame, new_unpad, interpolation=cv2.INTER_LINEAR)
        top = int(round(dh - 0.1))
        bottom = int(round(dh + 0.1))
        left = int(round(dw - 0.1))
        right = int(round(dw + 0.1))
        padded = cv2.copyMakeBorder(resized, top, bottom, left, right, cv2.BORDER_CONSTANT, value=(114, 114, 114))

        # 2. Preprocessing: BGR -> RGB, HWC -> CHW, normalize to [0, 1] float32
        blob = padded[:, :, ::-1].transpose(2, 0, 1)[None, :, :, :].astype(np.float32) / 255.0
        blob = np.ascontiguousarray(blob)

        # 3. ONNX Runtime execution
        outputs = self.ort_session.run(None, {self.input_name: blob})
        out = outputs[0][0]  # Shape: (84, 8400)
        preds = out.T        # Shape: (8400, 84)

        boxes_cxcywh = preds[:, :4]
        person_scores = preds[:, 4]  # COCO Class 0 ('person')

        mask = person_scores >= effective_conf
        v_boxes = boxes_cxcywh[mask]
        v_scores = person_scores[mask]

        detections: List[Dict[str, Any]] = []
        raw_candidates: List[Dict[str, Any]] = []

        if len(v_scores) > 0:
            cx = v_boxes[:, 0]
            cy = v_boxes[:, 1]
            bw = v_boxes[:, 2]
            bh = v_boxes[:, 3]
            bx = cx - bw / 2.0
            by = cy - bh / 2.0

            cv_boxes = [[float(bx[i]), float(by[i]), float(bw[i]), float(bh[i])] for i in range(len(bx))]
            iou_thresh = getattr(settings, "DEFAULT_IOU_THRESHOLD", 0.45)
            indices = cv2.dnn.NMSBoxes(cv_boxes, v_scores.tolist(), effective_conf, iou_thresh)

            if len(indices) > 0:
                for idx in indices.flatten():
                    score = float(v_scores[idx])
                    rx1 = (bx[idx] - dw) / r
                    ry1 = (by[idx] - dh) / r
                    rx2 = (bx[idx] + bw[idx] - dw) / r
                    ry2 = (by[idx] + bh[idx] - dh) / r

                    x1 = max(0, min(frame_w - 1, int(round(rx1))))
                    y1 = max(0, min(frame_h - 1, int(round(ry1))))
                    x2 = max(0, min(frame_w, int(round(rx2))))
                    y2 = max(0, min(frame_h, int(round(ry2))))

                    w_box = x2 - x1
                    h_box = y2 - y1
                    if w_box <= 2 or h_box <= 2:
                        raw_candidates.append({
                            "class_id": 0,
                            "class_name": "person",
                            "confidence": round(score, 4),
                            "raw_bbox": [rx1, ry1, rx2, ry2],
                            "clamped_bbox": [x1, y1, x2, y2],
                            "survives_filter": False,
                            "rejection_reason": "degenerate_dimensions_too_small"
                        })
                        continue

                    det_record = {
                        "bbox": [x1, y1, x2, y2],
                        "confidence": round(score, 4),
                        "class_id": 0,
                        "class_name": "person"
                    }
                    detections.append(det_record)
                    raw_candidates.append({
                        "class_id": 0,
                        "class_name": "person",
                        "confidence": round(score, 4),
                        "bbox": [x1, y1, x2, y2],
                        "survives_filter": True,
                        "rejection_reason": None
                    })

        diagnostics = {
            "timestamp": round(time.time(), 3),
            "model_name": self.onnx_path,
            "device": "cpu",
            "backend": "onnx",
            "requested_backend": self.requested_backend,
            "fallback_occurred": self.fallback_occurred,
            "fallback_reason": self.fallback_reason,
            "input_imgsz": imgsz,
            "frame_dims": {"width": frame_w, "height": frame_h},
            "conf_threshold": effective_conf,
            "total_candidates": len(raw_candidates),
            "accepted_count": len(detections),
            "candidates": raw_candidates
        }
        self._latest_diagnostics = diagnostics
        return detections, diagnostics


