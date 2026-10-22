import sys
import os
import cv2
import numpy as np

sys.path.insert(0, os.path.abspath("backend"))

from app.services.evaluation_service import evaluation_service

print("Testing various evaluation conditions:")

# Test 1: different imgsz
for sz in [320, 480, 640]:
    acc = evaluation_service.evaluate_detection_accuracy(imgsz=sz, conf_threshold=0.30)
    print(f"imgsz={sz}: mIoU={acc['overall_metrics']['mean_iou']:.4f}, Prec={acc['overall_metrics']['precision']:.3f}, Rec={acc['overall_metrics']['recall']:.3f}")

# Test 2: different iou_threshold
for iou_th in [0.5, 0.6, 0.7, 0.75, 0.8]:
    acc = evaluation_service.evaluate_detection_accuracy(imgsz=640, conf_threshold=0.30, iou_threshold=iou_th)
    print(f"iou_threshold={iou_th}: mIoU={acc['overall_metrics']['mean_iou']:.4f}, Prec={acc['overall_metrics']['precision']:.3f}, Rec={acc['overall_metrics']['recall']:.3f}")

print("\nSearching for exact 0.784 combinations:")
for n in range(1, 100):
    for d in range(n, 100):
        if round(n/d, 3) == 0.784:
            print(f"Ratio {n}/{d} = {n/d:.4f}")
