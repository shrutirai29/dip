import os
import pytest
import numpy as np
from app.services.detection_service import DetectionService
from app.core.config import settings

def test_default_backend_is_pytorch():
    service = DetectionService()
    assert service.backend == "pytorch"
    assert service.fallback_occurred is False
    assert service.fallback_reason is None

def test_explicit_onnx_backend_initialization():
    onnx_file = getattr(settings, "ONNX_MODEL_PATH", "yolov8n.onnx")
    if not os.path.exists(onnx_file):
        pytest.skip("yolov8n.onnx not found for ONNX backend test")
    service = DetectionService(backend="onnx", onnx_path=onnx_file)
    assert service.backend == "onnx"
    assert service.fallback_occurred is False
    assert service.fallback_reason is None

def test_onnx_backend_fallback_on_missing_model():
    service = DetectionService(backend="onnx", onnx_path="completely_bogus_model_path_12345.onnx")
    assert service.backend == "pytorch"
    assert service.fallback_occurred is True
    assert "not found" in service.fallback_reason.lower()

def test_warmup_both_backends():
    onnx_file = getattr(settings, "ONNX_MODEL_PATH", "yolov8n.onnx")
    service_pt = DetectionService(backend="pytorch")
    warm_pt = service_pt.warmup(imgsz=640)
    assert isinstance(warm_pt, float)
    assert warm_pt > 0

    if os.path.exists(onnx_file):
        service_onnx = DetectionService(backend="onnx", onnx_path=onnx_file)
        warm_onnx = service_onnx.warmup(imgsz=640)
        assert isinstance(warm_onnx, float)
        assert warm_onnx > 0

def test_parity_and_diagnostics_structure():
    dummy = np.zeros((480, 640, 3), dtype=np.uint8)
    onnx_file = getattr(settings, "ONNX_MODEL_PATH", "yolov8n.onnx")

    service_pt = DetectionService(backend="pytorch")
    dets_pt, diag_pt = service_pt.detect_persons_with_diagnostics(dummy)
    assert diag_pt["backend"] == "pytorch"
    assert diag_pt["fallback_occurred"] is False
    assert isinstance(dets_pt, list)

    if os.path.exists(onnx_file):
        service_onnx = DetectionService(backend="onnx", onnx_path=onnx_file)
        dets_onnx, diag_onnx = service_onnx.detect_persons_with_diagnostics(dummy)
        assert diag_onnx["backend"] == "onnx"
        assert diag_onnx["fallback_occurred"] is False
        assert isinstance(dets_onnx, list)
        assert len(dets_pt) == len(dets_onnx)
