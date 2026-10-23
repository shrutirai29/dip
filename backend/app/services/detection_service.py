import os
import time
import logging
from typing import Optional, List, Dict, Any, Tuple
import torch
import numpy as np
from ultralytics import YOLO
from app.core.config import settings

logger = logging.getLogger("crowdguard.detection")

class DetectionService:
    """
    Person detection service using pretrained Ultralytics YOLO models (YOLOv8n).
    Strictly filters for COCO Class 0 ('person').
    Performs boundary clamping, degenerate box rejection, and development diagnostics.
    """

    def __init__(self, model_name: str = None, conf_threshold: float = None):
        self.model_name = model_name or settings.YOLO_MODEL_NAME
        self.conf_threshold = conf_threshold if conf_threshold is not None else settings.DEFAULT_CONF_THRESHOLD
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._latest_diagnostics: Dict[str, Any] = {}
        self._load_model()

    def _load_model(self):
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

        # Run inference filtering for class 0
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
            "device": self.device,
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

