import numpy as np
import torch
import onnxruntime as ort
from ultralytics import YOLO

def test_parity():
    yolo = YOLO('yolov8n.pt')
    pt_m = yolo.model.float().eval()
    sess = ort.InferenceSession('yolov8n.onnx', providers=['CPUExecutionProvider'])
    
    np.random.seed(42)
    dummy_np = np.random.uniform(0.0, 1.0, (1, 3, 640, 640)).astype(np.float32)
    dummy_pt = torch.from_numpy(dummy_np)
    
    with torch.inference_mode():
        pt_out = pt_m(dummy_pt)
        if isinstance(pt_out, tuple):
            pt_out = pt_out[0]
        pt_np = pt_out.cpu().numpy()
        
    ort_out = sess.run(None, {'images': dummy_np})[0]
    
    diff = np.abs(pt_np - ort_out)
    print("PT shape:", pt_np.shape, "ORT shape:", ort_out.shape)
    print("Max absolute difference:", float(np.max(diff)))
    print("Mean absolute difference:", float(np.mean(diff)))
    print("99th percentile diff:", float(np.percentile(diff, 99)))
    assert np.allclose(pt_np, ort_out, atol=1e-3, rtol=1e-3), "Models do not match within tolerance!"
    print("Numerical parity check passed!")

if __name__ == "__main__":
    test_parity()
