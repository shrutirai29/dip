# CROWDGUARD Phase 4.7 — Adaptive Inference & Crowd-Monitoring Reliability Report

**Project:** CROWDGUARD — AI-Powered Crowd Monitoring & Disaster-Risk Assessment  
**Branch:** `feat/crowdguard-adaptive-inference`  
**Repository:** https://github.com/shrutirai29/dip  
**Report Date:** October 23, 2026  
**Status:** **VERIFIED & OPERATIONAL**  

---

## 1. Executive Summary

Phase 4.7 delivers comprehensive empirical verification, bottleneck profiling, adaptive risk-weighted inference scheduling, and explicit frame-freshness guarantees for the CROWDGUARD multi-camera platform.

### Key Milestones Achieved
1. **Resolved Reported Mean-IoU Discrepancy:** Proved empirically that YOLOv8n detector localization accuracy is **93.81% (macro-mean IoU)** and **93.08% (micro-mean IoU)** with **100.0% recall** and **96.30% precision** across the ground-truth dataset (26 individuals). Confirmed through commit history and regression logs that the **78.4%** figure reported in Phase 4.6.2 was a documentation transcription typo. Implemented a 10-test deterministic IoU test suite (`test_iou_deterministic.py`) that passes 100%.
2. **Empirical Pipeline Bottleneck Profiling:** Quantified every component stage on Intel Core Ultra (PyTorch CPU mode). Revealed that post-inference heatmap density splatting/blending (47.79 ms) and YOLO forward pass (43.80 ms) dominate per-frame computation, accounting for 75.5% of total pipeline latency (~121 ms total per frame).
3. **Adaptive Fair Inference Scheduling:** Implemented dual scheduling policies (`round_robin` and `adaptive_risk`) in `FairInferenceScheduler`. High-risk cameras receive up to $3\times$ higher dispatch priority, while low-risk cameras are strictly protected from starvation via an aging-based dispatch guarantee ($\le 2 \times N_{\text{cams}}$).
4. **Explicit Frame Freshness & Staleness Contract:** Added nanosecond-monotonic and wall-clock timestamps across capture, inference, publication, and detection. Cameras exceeding `staleness_threshold_sec` (2.0s) render prominent amber `[STALE X.Xs]` badges and label crowd metrics as `(PRESERVED)`. Frames lingering in pending queues longer than `max_pending_age_sec` (2.5s) are safely dropped to conserve CPU.
5. **Quality Gates Cleared:** All 121 backend unit/integration tests passed (1 skipped), frontend production build succeeded, and frontend lint completed with 0 errors.

---

## 2. Investigation & Mathematical Resolution of Mean-IoU Discrepancy

### 2.1 Context of the Discrepancy
Earlier project documentation reported a mean bounding box Intersection-over-Union (IoU) of **93.8%**, whereas the Phase 4.6.2 sustained validation report noted **78.4%**. Prior to performing further performance tuning, a mandatory audit was conducted to establish whether this represented true algorithmic degradation or an artifact of calculation or documentation.

### 2.2 Empirical Audit & Root Cause Analysis
An isolated diagnostic script (`backend/scripts/diagnose_iou.py`) was executed across all 15 ground-truth evaluation frames containing 26 annotated individuals using YOLOv8n at default thresholds (`conf_threshold=0.30`, `iou_threshold=0.50`, `imgsz=640`).

#### Ground-Truth Evaluation Matrix
| Metric | Value | Formulation / Notes |
| :--- | :--- | :--- |
| **Ground-Truth Persons** | 26 | Across 7 occupied frames (8 negative empty frames) |
| **True Positives (TP)** | 26 | IoU $\ge 0.50$ greedy bipartite match |
| **False Positives (FP)** | 1 | 1 false detection on frame `real_f145` (reflection/texture) |
| **False Negatives (FN)** | 0 | Zero missed persons across the dataset |
| **Precision** | **96.30%** | $\frac{TP}{TP + FP} = \frac{26}{27}$ |
| **Recall** | **100.0%** | $\frac{TP}{TP + FN} = \frac{26}{26}$ |
| **F1-Score** | **0.9811** | $2 \cdot \frac{P \cdot R}{P + R}$ |
| **Macro-Mean IoU** | **93.81% (0.9381)** | Mean of frame-level mean IoUs across frames with detections ($N=7$) |
| **Micro-Mean IoU** | **93.08% (0.9308)** | Global pooled average over all 26 matched bounding boxes |
| **Min Matched IoU** | 66.12% (0.6612) | Small background person on frame `real_f045` |
| **Median Matched IoU** | 96.94% (0.9694) | Median box localization accuracy |
| **Max Matched IoU** | 100.00% (1.0000) | Perfect overlap on multiple frames |

#### Forensic Commit & Test Audit
- In Phase 4.6.2, `backend/tests/test_sustained_stability.py` executed:
  ```python
  metrics = evaluation_service.evaluate_detection_accuracy(imgsz=640, conf_threshold=0.30)
  assert metrics["mean_iou"] >= 0.90
  ```
  This assertion executed against the real detector and returned `0.9381`.
- The `78.4%` figure in `phase_4_6_2_sustained_validation_report.md` was an assistant manual transcription error during markdown report authoring.
- **Verdict:** There is **zero detection accuracy degradation**. The platform maintains 93.81% macro-mean IoU and 93.08% micro-mean IoU.

### 2.3 Mathematical Clarity & Reporting Standards
To prevent future ambiguity between macro and micro aggregation:
1. **Macro-mean IoU:**
   $$\text{IoU}_{\text{macro}} = \frac{1}{|F_{\text{occupied}}|} \sum_{f \in F_{\text{occupied}}} \left( \frac{1}{|M_f|} \sum_{(g, p) \in M_f} \text{IoU}(g, p) \right) = 93.81\%$$
   Excludes empty frames ($|M_f| = 0$) where IoU is undefined ($0/0$).
2. **Micro-mean IoU:**
   $$\text{IoU}_{\text{micro}} = \frac{1}{\sum_f |M_f|} \sum_{f} \sum_{(g, p) \in M_f} \text{IoU}(g, p) = \frac{24.2008}{26} = 93.08\%$$
Both formulations are now explicitly published in `EvaluationService.evaluate_detection_accuracy()`, the `/api/benchmark/accuracy` endpoint, and the dashboard UI.

### 2.4 Deterministic Unit Test Suite
A dedicated 10-test test suite was established in `backend/tests/test_iou_deterministic.py`:
- `test_iou_identical_boxes`: Exact 1.0.
- `test_iou_disjoint_boxes`: Exact 0.0.
- `test_iou_known_geometry_partial_overlap`: Confirms intersection / union math on synthetic coordinates.
- `test_iou_empty_ground_truth`: Handles empty scenes safely without division by zero.
- `test_iou_empty_predictions`: Handles missed scenes cleanly (FN = len(gt)).
- `test_iou_duplicate_predictions_greedy_assignment`: Prevents multiple predictions from claiming the same ground truth box.
- `test_iou_multiple_people_greedy_assignment`: Verifies optimal bipartite matching across multi-person arrays.
- `test_iou_invalid_coordinates_and_clamping`: Ensures robustness against inverted ($x_2 < x_1$) or negative bounding box inputs.
- `test_iou_scaling_invariance`: Confirms scale invariance under spatial upscaling.
- `test_iou_micro_vs_macro_mean_formulation`: Verifies mathematical agreement between macro and micro aggregations.

All 10 tests pass deterministically in under 3 seconds.

---

## 3. Profiling Multi-Camera Bottlenecks Across Pipeline Stages

Stage-level benchmarking was performed on the active hardware environment (Intel Core Ultra, 16 physical / 22 logical cores, PyTorch CPU mode) using `backend/scripts/profile_stages.py` and `backend/scripts/profile_multi_cam.py`.

### 3.1 Component Latency Breakdown
| Stage | Component | Latency (ms) | Pipeline % | Processing Capacity |
| :--- | :--- | :--- | :--- | :--- |
| **DIP Post-Processing** | Heatmap Splatting & Blending | **47.79 ms** | **39.4%** | ~20.9 FPS |
| **Deep Learning** | YOLOv8n CPU Forward Pass (640px) | **43.80 ms** | **36.1%** | ~22.8 FPS |
| **DIP Motion Dynamics** | Farneback Optical Flow (320x240) | **18.75 ms** | **15.4%** | ~53.3 FPS |
| **Visualization** | HUD Overlay & Annotations | **6.09 ms** | **5.0%** | ~164 FPS |
| **Encoding** | cv2.imencode JPEG Quality 80 | **4.02 ms** | **3.3%** | ~248 FPS |
| **Analytics & Decision** | ByteTrack, Grid, Risk Engine, Forecast | **0.88 ms** | **0.8%** | >1000 FPS |
| **Total Full-Pipeline** | Single-Threaded Full Frame | **121.33 ms** | **100.0%** | **~8.2 FPS** |

### 3.2 Multi-Camera Empirical Scaling
| Cameras | Capture FPS / Cam | Inference FPS / Cam | Aggregate Inference FPS | Scheduler Wait p95 | Capture-to-Published p95 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1 Camera** | 24.2 FPS | 10.20 FPS | 10.20 FPS | 0.1 ms | 182.7 ms |
| **2 Cameras**| 23.6 FPS | 6.90 FPS | 13.80 FPS | 26.7 ms | 188.5 ms |
| **4 Cameras**| 24.2 FPS | 2.95 FPS | 11.80 FPS | 249.2 ms | 315.4 ms |

### 3.3 Core Insights
1. **CPU Forward-Pass Saturation:** Ultralytics YOLOv8n forward passes on CPU require ~44 ms. Therefore, aggregate physical inference throughput is bounded at $\frac{1000}{44} \approx 22.7$ inferences per second under 100% core utilization, and practically settles around 12–14 FPS when accounting for memory bandwidth and optical flow.
2. **PyTorch OpenMP Thread Contention:** Attempting to run inference concurrently across multiple threads causes severe OpenMP thread contention, driving latency per frame from ~44 ms up to >400 ms. Serializing forward passes via `FairInferenceScheduler` maintains steady per-frame inference duration (~44 ms) and eliminates CPU thrashing.
3. **Heatmap Generation Bottleneck:** The largest non-neural overhead is generating float32 Gaussian heatmap splats and blending them into the surveillance feed (47.79 ms). Bypassing heatmap splatting on empty frames and vectorizing alpha blending provides substantial latency relief.

---

## 4. Adaptive & Fair Inference Scheduling Architecture

### 4.1 Scheduling Policies
In `FairInferenceScheduler` (`backend/app/services/inference_scheduler.py`), two swappable scheduling policies are now supported:

1. **`round_robin` (Default):**
   - Cameras are served in strict turn-taking sequence ($1:1:1:1$).
   - Guarantees absolute fairness, minimal variance in inter-frame intervals, and zero starvation.
2. **`adaptive_risk`:**
   - Dynamically weights cameras according to real-time heuristic crowd risk and motion anomaly scores:
     $$W_i = 1.0 + \min\left(2.0, \frac{\text{Risk}_i}{50.0} + \frac{\text{Anomaly}_i}{20.0}\right) \in [1.0, 3.0]$$
   - Cameras with critical crowd risk (e.g. Risk = 85) receive up to $3\times$ higher dispatch priority than idle corridors.

### 4.2 Starvation Prevention Theorem & Implementation
Under `adaptive_risk`, an active high-risk camera could theoretically monopolize the inference worker. To prevent stream starvation:
- Each camera tracks `dispatches_since_last_run`.
- A hard starvation limit is enforced:
  $$\text{Starvation Limit} = \max(2, 2 \times N_{\text{registered\_cameras}})$$
- If any pending camera has waited $\ge \text{Starvation Limit}$ dispatches, it is immediately selected next with `priority_reason = "starvation_prevention"`, resetting its counter.
- **Guarantee:** No active camera feed will ever wait longer than $2 \times N_{\text{cams}}$ dispatches without receiving inference service.

### 4.3 Stale Pending Frame Rejection
When a camera captures frames at 25 FPS but inference is dispatched at 3 FPS:
- Bounded single-slot buffers ensure new frames overwrite un-started pending frames.
- If a frame remains in the pending slot longer than `max_pending_age_sec` (default 2.5s), it is marked obsolete and dropped with callback reason `"stale_frame_dropped"`. Compute is never wasted processing obsolete frames.

### 4.4 Test Verification
Suite `backend/tests/test_adaptive_scheduler.py` verifies all requirements:
- Policy toggle and parameter bounds validation.
- Strict round-robin dispatch fairness.
- Adaptive risk weight calculation.
- Starvation prevention under flood conditions.
- Stale pending frame drop accounting.
- CameraSession timestamp and staleness contract.

All 6 tests passed (100%).

---

## 5. Frame Freshness & Staleness Contract

To ensure surveillance operators never mistake outdated detections for real-time crowd dynamics, explicit freshness telemetry and visual staleness alerts were engineered end-to-end.

### 5.1 Explicit Timestamp Hierarchy
Every camera frame records:
- `latest_captured_timestamp` (UTC wall-clock Unix time)
- `latest_captured_monotonic` (nanosecond-resolution monotonic time)
- `latest_inference_start_monotonic` / `latest_inference_end_monotonic`
- `latest_published_timestamp` / `latest_published_monotonic`
- `latest_detection_timestamp` / `latest_detection_monotonic`

### 5.2 Freshness Lifecycle & Visual Alerting
```
    Frame Age: 0.0s -----------> 1.2s -----------> 2.0s -----------------> >2.0s
    Status:       [ FRESH ]           [ AGING ]             [ STALE ALERT ]
    HUD:          Normal Green/Cyan   Normal                Amber [STALE X.Xs] Badge
    Telemetry:    is_stale: false     is_stale: false       is_stale: true
    Label:        CROWD: N            CROWD: N              CROWD: N (PRESERVED)
```

1. **Fresh (`det_age < 1.2s`):** Real-time detections actively refreshed.
2. **Aging (`1.2s <= det_age <= 2.0s`):** Normal multi-stream queuing.
3. **Stale (`det_age > 2.0s`):**
   - The HUD overlay draws an amber warning badge: `[STALE X.Xs]`.
   - The telemetry crowd count is explicitly annotated as `(PRESERVED)` to indicate that bounding boxes represent retained historical state rather than current presence.
   - Status API reports `is_stale = true` and `staleness_status = "stale"`.

---

## 6. API Endpoints & Frontend Dashboard Updates

### 6.1 Backend API Endpoints
- `GET /api/benchmark/adaptive-policy`: Returns current policy (`round_robin` / `adaptive_risk`), `max_pending_age_sec`, and scheduler telemetry.
- `POST /api/benchmark/adaptive-policy`: Updates policy and/or max pending age dynamically with schema validation (`AdaptivePolicyUpdate`).
- `GET /api/benchmark/adaptive-report`: Delivers the complete Phase 4.7 report payload, including IoU resolution, bottleneck profiling, and fairness metrics.
- `GET /api/benchmark/export`: Exports complete audit JSON updated to v4.7.0.

### 6.2 Frontend `/benchmarks` Dashboard
A dedicated **Adaptive Inference & Reliability (Phase 4.7)** tab was added to the `/benchmarks` page:
1. **IoU Discrepancy Resolution Card:** Displays side-by-side macro (93.81%) vs micro (93.08%) metrics, audit findings on the 78.4% typo, and the 10/10 passing deterministic test suite.
2. **Bottleneck Profiling Breakdown:** Renders a component latency waterfall showing ms per stage and % of pipeline.
3. **Interactive Policy Controls:** Allows operators to toggle between Round-Robin and Adaptive Risk modes and adjust the max pending frame age with instant backend synchronization.
4. **Freshness & Staleness Indicators:** Illustrates the operator safety alert system, showing how stale detections are clearly distinguished from live telemetry.

---

## 7. Verification & Quality Gates

### 7.1 Backend Test Results
```
============================= test session starts =============================
platform win32 -- Python 3.11.9, pytest-8.3.4, pluggy-1.6.0
rootdir: C:\Users\shrut\Documents\antigravity\modest-pascal
configfile: pytest.ini
plugins: anyio-4.15.1
collected 122 items

backend\tests\test_adaptive_scheduler.py ......                          [  4%]
backend\tests\test_api.py ........                                       [ 11%]
backend\tests\test_camera_integration.py .........                       [ 18%]
backend\tests\test_camera_service.py .......                             [ 24%]
backend\tests\test_detection_quality.py .........                        [ 31%]
backend\tests\test_e2e_integration.py s                                  [ 32%]
backend\tests\test_evaluation_benchmark.py ......................        [ 50%]
backend\tests\test_inference_scheduler.py .......                        [ 56%]
backend\tests\test_iou_deterministic.py ..........                       [ 64%]
backend\tests\test_multi_camera.py .......                               [ 70%]
backend\tests\test_recorded_video_playback.py ......                     [ 75%]
backend\tests\test_rtsp_camera.py ..........                             [ 83%]
backend\tests\test_services.py ...............                           [ 95%]
backend\tests\test_sustained_stability.py .....                          [100%]

============ 121 passed, 1 skipped, 5 warnings in 67.61s (0:01:07) ============
```

### 7.2 Frontend Build & Lint
- `npm --prefix frontend run build`: **PASSED** (0 TypeScript / compilation errors).
- `npm --prefix frontend run lint`: **PASSED** (0 errors, 35 pre-existing warnings).

---

## 8. Commit Summary

All work has been performed cleanly on feature branch `feat/crowdguard-adaptive-inference`:
- `backend/app/services/evaluation_service.py`: Added `macro_mean_iou`, `micro_mean_iou`, and `get_adaptive_inference_report()`.
- `backend/app/services/inference_scheduler.py`: Implemented adaptive risk queueing, aging-based starvation prevention, stale frame dropping, and status APIs.
- `backend/app/services/camera_session.py`: Added explicit timestamps, sub-second staleness thresholds, dynamic HUD amber staleness badges, and preserved count indicators.
- `backend/app/api/benchmark_endpoints.py`: Added policy query/update endpoints and adaptive report retrieval.
- `backend/tests/test_iou_deterministic.py`: Added 10 deterministic IoU unit tests.
- `backend/tests/test_adaptive_scheduler.py`: Added 6 unit/integration tests for policy switching, fairness, and staleness.
- `frontend/src/services/api.ts`: Added adaptive benchmark API bindings.
- `frontend/src/pages/Benchmarks.tsx`: Built Phase 4.7 interactive Adaptive Inference dashboard tab.
- `data/reports/iou_diagnostic_breakdown.json`: Saved raw ground-truth IoU evaluation artifacts.
- `data/reports/phase_4_7_adaptive_inference_report.md`: Complete human-readable engineering milestone report.
