import os
import torch
import numpy as np
from ultralytics import YOLO
from app.core.config import settings

class DetectionService:
    """
    Person detection service using pretrained Ultralytics YOLO models (YOLOv8n).
    Strictly filters for COCO Class 0 ('person').
    Extracts high-precision bounding boxes [x1, y1, x2, y2] and confidence scores.
    """

    def __init__(self, model_name: str = None, conf_threshold: float = 0.25):
        self.model_name = model_name or settings.YOLO_MODEL_NAME
        self.conf_threshold = conf_threshold
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._load_model()

    def _load_model(self):
        try:
            print(f"[DetectionService] Loading YOLO model {self.model_name} on {self.device}...")
            # Automatically downloads weights (6MB for yolov8n) if not present locally
            self.model = YOLO(self.model_name)
            self.model.to(self.device)
            print(f"[DetectionService] YOLO successfully initialized on {self.device}.")
        except Exception as e:
            print(f"[DetectionService] Error initializing YOLO model: {e}")
            raise e

    def detect_persons(self, frame: np.ndarray, imgsz: int = 640) -> list[dict]:
        """
        Runs person detection inference on an RGB/BGR numpy image frame.
        Returns a list of dicts: [{'bbox': [x1, y1, x2, y2], 'confidence': float, 'class_id': 0, 'class_name': 'person'}]
        """
        results = self.model(
            frame,
            classes=[0],  # Class 0 is 'person' in COCO dataset
            conf=self.conf_threshold,
            imgsz=imgsz,
            verbose=False
        )

        detections = []
        if not results or len(results) == 0:
            return detections

        boxes = results[0].boxes
        if boxes is None or len(boxes) == 0:
            return detections

        for box in boxes:
            xyxy = box.xyxy[0].cpu().numpy().tolist()
            conf = float(box.conf[0].cpu().numpy())
            cls_id = int(box.cls[0].cpu().numpy())

            detections.append({
                "bbox": [int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3])],
                "confidence": round(conf, 4),
                "class_id": cls_id,
                "class_name": "person"
            })

        return detections
