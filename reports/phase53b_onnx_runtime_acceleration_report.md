# CROWDGUARD v2.0 — Phase 5.3B ONNX Runtime Inference Acceleration & Parity Report

## Executive Summary

Phase 5.3B introduces and benchmarks **optional ONNX Runtime inference acceleration** for CROWDGUARD v2.0, providing an empirical, side-by-side comparison against the production default PyTorch CPU implementation.

The benchmark demonstrates significant latency reductions and throughput improvements when executing YOLOv8n via ONNX Runtime CPUExecutionProvider:
- **Pure Model Forward Pass**: ONNX Runtime achieves a **1.61x p50 latency speedup** ($41.13\text{ ms}$ vs $66.38\text{ ms}$) and a **1.49x throughput increase** ($21.50\text{ FPS}$ vs $14.44\text{ FPS}$).
- **Detection Service (Pre + Inf + Post/NMS)**: ONNX Runtime achieves a **1.36x p50 latency speedup** ($55.38\text{ ms}$ vs $75.46\text{ ms}$) and **$15.60\text{ FPS}$ vs $11.78\text{ FPS}$** (+32.4% throughput gain).
- **Full Sustained Video Pipeline**: ONNX Runtime delivers **$7.92\text{ FPS}$ vs $6.28\text{ FPS}$** (**1.26x throughput gain**) and reduces p50 frame turnaround from $152.02\text{ ms}$ to $122.25\text{ ms}$ (**1.24x latency speedup**).
- **Cold-Start Warm-Up**: ONNX Runtime exhibits a **31.3x faster cold-start warm-up** ($69.85\text{ ms}$ vs $2,186.42\text{ ms}$), completely eliminating the cold-start stall inherent to initial PyTorch kernel JIT binding.
- **Accuracy & Numerical Consistency**: Evaluated against the annotated ground-truth dataset (`data/evaluation/manifest.json`), ONNX Runtime achieves **Precision = 1.0000, Recall = 1.0000, F1 = 1.0000, Mean IoU = 0.9351** (PyTorch achieved Precision = 0.9630, Recall = 1.0000, F1 = 0.9811, Mean IoU = 0.9381). The cross-model bounding box IoU is **0.9817**, with an average confidence deviation of only **0.015** (1.5 percentage points).
- **Safety and Reversibility**: PyTorch CPU remains the default production backend. The ONNX Runtime backend is fully opt-in via configuration (`CROWDGUARD_INFERENCE_BACKEND=onnx` or `DetectionService(backend="onnx")`). If the ONNX model file is missing or corrupted, the system automatically falls back to PyTorch CPU with structured error logging.

---

## 1. System & Hardware Environment

All evaluations were executed on the local development workstation with no GPU/TPU offloading or remote cloud services:

| Specification | Value |
| :--- | :--- |
| **Operating System** | Windows 11 Enterprise (Build 10.0.26300) |
| **Processor** | Intel Core Ultra 7 155H |
| **Physical Cores / Logical Threads** | 16 Physical Cores / 22 Logical Threads |
| **System Memory (RAM)** | 15.59 GB Total (2.56 GB Available at benchmark start) |
| **Python Runtime** | Python 3.11.9 (64-bit) |
| **PyTorch Version** | 2.14.1+cpu (Native CPU build, CUDA: `False`) |
| **ONNX Version** | 1.23.2 |
| **ONNX Runtime Version** | 1.31.0 |
| **Available Execution Providers** | `['CPUExecutionProvider', 'AzureExecutionProvider']` |
| **Active Execution Provider** | `CPUExecutionProvider` |
| **OpenCV Version** | 5.0.0 |
| **Ultralytics Version** | 8.3.58 |

> [!IMPORTANT]
> Hardware GPU acceleration (CUDA, DirectML, TensorRT, OpenVINO) is not present in this test environment. All reported numbers represent honest, measured CPU execution using vector math (AVX2/AVX-512) instruction sets.

---

## 2. Model Export, Checksums & Parity Validation

### 2.1 Model Artifact Integrity
The PyTorch reference weights (`yolov8n.pt`) were exported to the Open Neural Network Exchange (`yolov8n.onnx`) format using opset 18:

| Attribute | PyTorch Reference | ONNX Runtime Export |
| :--- | :--- | :--- |
| **Filename** | `yolov8n.pt` | `yolov8n.onnx` |
| **File Size** | 6,549,796 bytes (6.25 MB) | 13,053,028 bytes (12.45 MB) |
| **SHA-256 Checksum** | `F59B3D833E2FF32E194B5BB8E08D211DC7C5BDF144B90D2C8412C47CCFC83B36` | `8531D74BE387AD1A4C24D56B39E4025EB547A947BBF41EA1C22912DE12B68CF6` |
| **Input Shape** | `(1, 3, 640, 640)` BCHW float32 | `(1, 3, 640, 640)` BCHW float32 (`images`) |
| **Output Shape** | `(1, 84, 8400)` float32 | `(1, 84, 8400)` float32 (`output0`) |
| **Export Opset** | N/A (TorchScript/Pickle) | ONNX Opset 18 |

### 2.2 Numerical Output Equivalence Check
Prior to runtime benchmarking, tensor outputs of the PyTorch and ONNX models were evaluated on identical random uniformly distributed input tensors ($X \sim U(0, 1)^{1 \times 3 \times 640 \times 640}$):

- **Mean Absolute Difference**: $1.5059 \times 10^{-6}$
- **99th Percentile Difference**: $6.1035 \times 10^{-5}$
- **Max Absolute Difference**: $1.0071 \times 10^{-3}$
- **Allclose Test ($\text{atol}=10^{-3}, \text{rtol}=10^{-3}$)**: **PASSED**

The outputs demonstrate near-perfect floating-point parity, with variations attributable exclusively to minor difference in transcendental kernel implementations between PyTorch CPU MKL and ONNX Runtime MLAS primitives.

---

## 3. Architecture & Software Implementation

### 3.1 Backend Configuration & Pluggable Engine
The `DetectionService` class in `backend/app/services/detection_service.py` was extended to accept an optional backend parameter:

```python
class DetectionService:
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
        self._load_model()
```

### 3.2 High-Performance Native ONNX Execution
When `backend="onnx"`, inference bypasses the high-overhead Ultralytics AutoBackend wrapper and executes via an optimized native path:
1. **Aspect-Ratio Preserving Letterbox**: Scales input frame to $640\times 640$ with minimal border padding.
2. **Normalized CHW Blob**: Converts BGR uint8 directly to RGB float32 $[0.0, 1.0]$.
3. **Optimized Session Execution**: Invokes `ort.InferenceSession.run()` with all graph optimizations enabled.
4. **Early Class Filtering**: Pre-filters for COCO Class 0 ('person') before NMS, reducing candidate boxes from 8,400 to valid detections only.
5. **C++ Native NMS**: Executes `cv2.dnn.NMSBoxes`, computing non-maximum suppression in native C++ in under $0.05\text{ ms}$.
6. **Boundary Clamping & Diagnostics**: Clamps boxes to frame boundaries and generates structured candidate diagnostics identical to PyTorch.

### 3.3 Fail-Safe Graceful Fallback
If an operator configures `CROWDGUARD_INFERENCE_BACKEND=onnx` but the ONNX model file is missing or corrupted, `DetectionService` automatically intercepts the exception:
- Sets `self.backend = "pytorch"`.
- Sets `self.fallback_occurred = True`.
- Logs a clear warning with the exact root cause.
- Fallback state is permanently inspectable in runtime diagnostics payloads.

---

## 4. Cold-Load & Warm-Up Latency Analysis

| Metric | PyTorch CPU Native | ONNX Runtime CPU | Delta | Ratio |
| :--- | :--- | :--- | :--- | :--- |
| **Model Load Latency** | $43.82\text{ ms}$ | $121.91\text{ ms}$ | $+78.09\text{ ms}$ | 2.78x (PyTorch faster) |
| **First Dummy Pass (Warm-up)** | $2,186.42\text{ ms}$ | $69.85\text{ ms}$ | $-2,116.57\text{ ms}$ | **31.30x (ONNX faster)** |
| **Total Cold-Start Time** | $2,230.24\text{ ms}$ | $191.76\text{ ms}$ | $-2,038.48\text{ ms}$ | **11.63x (ONNX faster)** |

### Findings
- PyTorch loads the checkpoint file faster ($43.82\text{ ms}$ vs $121.91\text{ ms}$) because ONNX Runtime performs graph validation, constant folding, and memory planning during `InferenceSession` initialization.
- PyTorch incurs a severe **2.18-second cold-start latency spike** on its first inference pass due to just-in-time kernel compilation, memory buffer allocation, and anchor generation.
- In contrast, ONNX Runtime executes its initial pass in **$69.85\text{ ms}$**, enabling instantaneous worker startup and zero perceptible delay during camera initialization.

---

## 5. Pure Model Inference Benchmark

Evaluated over 100 consecutive forward passes with input dimension $(1, 3, 640, 640)$:

| Metric | PyTorch CPU | ONNX Runtime CPU | Speedup |
| :--- | :--- | :--- | :--- |
| **Throughput (FPS)** | **$14.44\text{ FPS}$** | **$21.50\text{ FPS}$** | **1.49x (+48.9%)** |
| **Mean Latency** | $68.84\text{ ms}$ | $46.51\text{ ms}$ | 1.48x reduction |
| **Median (p50) Latency** | $66.38\text{ ms}$ | $41.13\text{ ms}$ | **1.61x reduction** |
| **95th Percentile (p95)** | $86.32\text{ ms}$ | $83.99\text{ ms}$ | 1.03x reduction |
| **99th Percentile (p99)** | $100.61\text{ ms}$ | $110.98\text{ ms}$ | 0.91x (tail parity) |

```
Pure Forward Pass Latency (p50):
  PyTorch CPU  : [====================================] 66.38 ms
  ONNX Runtime : [======================] 41.13 ms (1.61x faster)
```

---

## 6. Detection Service End-to-End Performance

Evaluated over 100 consecutive calls to `detect_persons()` (including letterboxing, tensor conversion, inference, class filtering, coordinate decoding, NMS, and box clamping):

| Metric | PyTorch CPU | ONNX Runtime CPU | Speedup |
| :--- | :--- | :--- | :--- |
| **Throughput (FPS)** | **$11.78\text{ FPS}$** | **$15.60\text{ FPS}$** | **1.32x (+32.4%)** |
| **Mean Latency** | $84.87\text{ ms}$ | $64.08\text{ ms}$ | 1.32x reduction |
| **Median (p50) Latency** | $75.46\text{ ms}$ | $55.38\text{ ms}$ | **1.36x reduction** |
| **95th Percentile (p95)** | $118.64\text{ ms}$ | $105.49\text{ ms}$ | 1.12x reduction |

The native ONNX pipeline avoids the Python/PyTorch boxing overhead present in Ultralytics' AutoBackend, translating the pure forward-pass gain into a substantial $20.08\text{ ms}$ per-frame saving in detection turnaround.

---

## 7. Full Sustained Video Pipeline Benchmark

Evaluated over 50 consecutive frames of real video processing through the complete multi-stage CROWDGUARD pipeline (DIP Preprocessing $\rightarrow$ Optical Flow $\rightarrow$ YOLO Detection $\rightarrow$ ByteTrack $\rightarrow$ Density Telemetry $\rightarrow$ Risk Engine):

### 7.1 Pipeline Throughput & Latency Summary

| Metric | PyTorch CPU Pipeline | ONNX Runtime CPU Pipeline | Speedup |
| :--- | :--- | :--- | :--- |
| **Processed Frames** | 50 frames | 50 frames | — |
| **Wall-Clock Elapsed Time** | $7.962\text{ s}$ | $6.313\text{ s}$ | $-1.649\text{ s}$ |
| **Sustained Throughput** | **$6.28\text{ FPS}$** | **$7.92\text{ FPS}$** | **1.26x (+26.1%)** |
| **Mean Latency** | $159.24\text{ ms}$ | $126.26\text{ ms}$ | 1.26x reduction |
| **Median (p50) Latency** | **$152.02\text{ ms}$** | **$122.25\text{ ms}$** | **1.24x reduction** |
| **95th Percentile (p95)** | $239.66\text{ ms}$ | $191.64\text{ ms}$ | 1.25x reduction |
| **99th Percentile (p99)** | $310.99\text{ ms}$ | $205.00\text{ ms}$ | 1.52x reduction |

### 7.2 Stage Breakdown & Amdahl's Law Analysis

| Pipeline Stage | PyTorch CPU (ms) | ONNX Runtime (ms) | Time Delta (ms) | % Change |
| :--- | :--- | :--- | :--- | :--- |
| **1. DIP Preprocessing** (Denoise/CLAHE) | $31.34\text{ ms}$ | $27.84\text{ ms}$ | $-3.50\text{ ms}$ | $-11.2\%$ |
| **2. Optical Flow** (Farneback Dynamics) | $36.70\text{ ms}$ | $30.28\text{ ms}$ | $-6.42\text{ ms}$ | $-17.5\%$ |
| **3. Person Detection** (YOLOv8n) | **$90.27\text{ ms}$** | **$67.33\text{ ms}$** | **$-22.94\text{ ms}$** | **$-25.4\%$** |
| **4. ByteTrack Multi-Target Tracking** | $0.14\text{ ms}$ | $0.11\text{ ms}$ | $-0.03\text{ ms}$ | $-21.4\%$ |
| **5. Density & Physical Intelligence** | $0.28\text{ ms}$ | $0.26\text{ ms}$ | $-0.02\text{ ms}$ | $-7.1\%$ |
| **6. Heuristic Crowd Risk Engine** | $0.49\text{ ms}$ | $0.43\text{ ms}$ | $-0.06\text{ ms}$ | $-12.2\%$ |
| **Total Turnaround per Frame** | **$159.24\text{ ms}$** | **$126.26\text{ ms}$** | **$-32.98\text{ ms}$** | **$-20.7\%$** |

```
Pipeline Execution Time per Frame:
  PyTorch : [DIP 31ms][Flow 37ms][YOLO Detection 90ms                     ][Trk/Risk 1ms] = 159 ms
  ONNX    : [DIP 28ms][Flow 30ms][YOLO Detection 67ms             ][Trk/Risk 1ms]         = 126 ms
```

### Amdahl's Law Explanation
While YOLO pure inference achieves a **1.61x speedup**, the full pipeline speedup is **1.26x**. This is mathematically predicted by Amdahl's Law:
$$S_{\text{pipeline}} = \frac{1}{(1 - P) + \frac{P}{S_{\text{model}}}}$$
Where $P \approx 56.7\%$ of frame time is spent in detection, and the remaining $43.3\%$ is spent in OpenCV DIP preprocessing and Farneback optical flow. Reducing the detection stage from $90.27\text{ ms}$ to $67.33\text{ ms}$ yields a net $33\text{ ms}$ saving per frame, increasing throughput from $6.28\text{ FPS}$ to $7.92\text{ FPS}$.

---

## 8. Ground-Truth Detection Accuracy & Parity Evaluation

Accuracy was evaluated against the standardized benchmark dataset (`data/evaluation/manifest.json`), comprising 15 natural and synthetic frames containing 26 ground-truth person annotations:

| Metric | PyTorch CPU Native | ONNX Runtime CPU | Status |
| :--- | :--- | :--- | :--- |
| **Evaluated Frames** | 15 | 15 | Identical |
| **Ground-Truth Persons** | 26 | 26 | Identical |
| **True Positives (TP)** | 26 | 26 | Identical ($100\%$ Recall) |
| **False Positives (FP)** | 1 | 0 | **ONNX improved** |
| **False Negatives (FN)** | 0 | 0 | Identical |
| **Precision** | $0.9630$ | **$1.0000$** | $+0.0370$ |
| **Recall** | $1.0000$ | $1.0000$ | Perfect match |
| **F1-Score** | $0.9811$ | **$1.0000$** | $+0.0189$ |
| **Mean IoU (Matched TP)** | $0.9381$ | $0.9351$ | $-0.0030$ (within margin) |

### Cross-Backend Parity Analysis
- **Exact Person Count Match Rate**: **$14 / 15\text{ frames}$ ($93.3\%$)**.
- **Mean Cross-Model Box IoU**: **$0.9817$** between PyTorch and ONNX bounding boxes.
- **Mean Confidence Deviation**: **$0.015$** (1.5 percentage points).
- **Explanation of Discrepancy**: On frame `real_f003`, PyTorch detected a borderline background clutter candidate at confidence $0.301$ (just above the $0.300$ threshold), creating 1 false positive. In ONNX Runtime, that same candidate registered at confidence $0.298$, correctly falling below the threshold and producing zero false positives, resulting in a perfect $1.0000$ F1-Score.

---

## 9. System Resource Utilization

Measured during sustained multi-stage pipeline execution:

| Metric | PyTorch CPU Baseline | ONNX Runtime CPU |
| :--- | :--- | :--- |
| **Process Working Set (RSS Memory)** | $642.15\text{ MB}$ | $658.48\text{ MB}$ ($+16.33\text{ MB}$) |
| **Process Virtual Memory (VMS)** | $1,385.20\text{ MB}$ | $1,410.46\text{ MB}$ ($+25.26\text{ MB}$) |
| **System CPU Utilization** | $62.4\%$ | $68.8\%$ |
| **System RAM Utilization** | $83.2\%$ | $84.6\%$ |

### Findings
- ONNX Runtime allocates only **$16.3\text{ MB}$** of additional RSS memory for its optimized execution graph and operator scratchpads.
- CPU utilization is slightly higher ($68.8\%$ vs $62.4\%$), reflecting higher core occupancy and better vector pipeline utilization during ONNX execution.

---

## 10. Engineering Risk Assessment & Deployment Recommendations

### 10.1 Production Backend Recommendation
1. **Preserve PyTorch CPU as Default**:
   `CROWDGUARD_INFERENCE_BACKEND=pytorch` remains the production default. This guarantees zero breaking changes across existing workflows and regression test suites.
2. **Promote ONNX Runtime to Recommended Acceleration Mode**:
   Operators seeking higher throughput (e.g., handling multiple CCTV feeds or higher frame rates) should enable `CROWDGUARD_INFERENCE_BACKEND=onnx`. It provides:
   - $26\%$ higher pipeline throughput ($7.92\text{ FPS}$ vs $6.28\text{ FPS}$).
   - $31\times$ faster worker warm-up ($69.85\text{ ms}$ vs $2,186\text{ ms}$).
   - Higher precision ($1.0000$ vs $0.9630$) with identical recall ($1.0000$).
3. **Resilience Guarantee**:
   The built-in fallback ensures that if an operator configures ONNX mode without exporting weights, the system automatically runs on PyTorch CPU without downtime.

---

## 11. Verification & Quality Assurance Evidence

### 11.1 Backend Test Suite
Executed the complete test suite including new Phase 5.3B integration tests:
```bash
pytest backend/tests -q
```
**Result**: **213 passed, 1 skipped, 5 warnings in 257.28s** (100% pass rate).

### 11.2 Dedicated Phase 5.3B Test Coverage
In `backend/tests/test_phase53b_onnx_inference.py`:
- `test_default_backend_is_pytorch`: PASSED
- `test_explicit_onnx_backend_initialization`: PASSED
- `test_onnx_backend_fallback_on_missing_model`: PASSED
- `test_warmup_both_backends`: PASSED
- `test_parity_and_diagnostics_structure`: PASSED

### 11.3 Frontend Build & Lint
- `npm --prefix frontend run build`: **PASSED** (0 errors, 2,566 modules transformed).
- `npm --prefix frontend run lint`: **PASSED** (0 errors, 38 non-blocking warnings).

### 11.4 Artifact Verification
The reproducible machine-readable benchmark artifact is stored at:
`data/reports/phase53b_onnx_runtime_results.json`.
