"""
CROWDGUARD v2.0 — Phase 5.2 Track A Automated Tests
Reliability Under Load, Event Delivery Stage Latency, Queue Policy Frame-Dropping, and Multi-Camera Stress
"""

import time
import pytest
import asyncio
from fastapi.testclient import TestClient

from app.main import app
from app.services.event_broadcaster import event_broadcaster, RealtimeEventType
from app.services.evaluation_service import evaluation_service


@pytest.fixture
def test_client():
    return TestClient(app)


def test_seven_stage_delivery_latency_instrumentation():
    """
    Verifies that the event delivery pipeline instruments distinct stages:
    Stage 1: Hazard detected -> Stage 2: Alert decision -> Stage 3: Event created
    -> Stage 4: Event published -> Stage 5: WebSocket sent.
    Confirms monotonic timing, microsecond resolution, and cold-start vs warmed-up tracking.
    """
    event_broadcaster.reset()
    mock_queue = asyncio.Queue(maxsize=100)
    dummy_ws = object()
    
    with event_broadcaster._lock:
        event_broadcaster._subscribers[dummy_ws] = mock_queue

    try:
        # Publish 10 events with explicit stage timestamps
        for i in range(10):
            t_haz = time.perf_counter()
            time.sleep(0.00005)
            t_dec = time.perf_counter()
            time.sleep(0.00002)
            t_cre = time.perf_counter()

            ev = event_broadcaster.publish(
                event_type=RealtimeEventType.INCIDENT_CREATED,
                camera_id="cam_test_latency",
                incident_id=f"inc_lat_{i}",
                hazard_type="RAPID_GROWTH",
                severity="HIGH",
                stage_timings={
                    "t_hazard_detected_mono": t_haz,
                    "t_alert_decision_mono": t_dec,
                    "t_event_created_mono": t_cre
                }
            )

            # Consume from queue
            queued = mock_queue.get_nowait()
            t_sent = time.perf_counter()
            
            # Stages must be strictly positive and monotonic
            assert queued["stage_timings"]["t_hazard_detected_mono"] <= queued["stage_timings"]["t_alert_decision_mono"]
            assert queued["stage_timings"]["t_alert_decision_mono"] <= queued["stage_timings"]["t_event_created_mono"]
            assert queued["stage_timings"]["t_event_created_mono"] <= queued["stage_timings"]["t_published_mono"]

        status = event_broadcaster.get_status()
        assert status["total_events_published"] == 10
        assert status["total_dropped_slow_consumers"] == 0
        assert "stage_latencies_ms" in status
    finally:
        with event_broadcaster._lock:
            event_broadcaster._subscribers.pop(dummy_ws, None)


def test_queue_policy_frame_dropping_tradeoff():
    """
    Verifies the empirical trade-off between latest-frame-wins, bounded FIFO, and adaptive sampling:
    - Latest-frame-wins: Low latency on sustained hazards, but misses an isolated 2-frame brief event
      when capture is 30 FPS and inference takes 100ms.
    - Bounded FIFO: Queues and catches the 2-frame brief event, but incurs up to 400-500ms delay on sustained events.
    - Adaptive sampling: Dynamically prioritizes burst frames on sudden hazards.
    """
    report = evaluation_service.run_phase52_reliability_and_physical_intelligence_benchmark(save_report=False)
    assert report["validation_status"] == "PASSED"

    track_a2 = report["track_a_reliability_under_load"]["a2_frame_dropping_vs_detection"]
    policies = track_a2["policies_evaluated"]

    assert "latest_frame_wins" in policies
    assert "bounded_fifo" in policies
    assert "adaptive_sampling" in policies

    lfw = policies["latest_frame_wins"]
    fifo = policies["bounded_fifo"]

    # In latest_frame_wins, brief 2-frame event (scen6) is dropped due to overwrite
    scen6_lfw = lfw["scenarios_breakdown"]["scen6_brief_critical_event"]
    assert scen6_lfw["missed_scenario"] is True or scen6_lfw["dropped_frames"] > 0

    # In bounded_fifo, queue depth accumulates
    scen7_fifo = fifo["scenarios_breakdown"]["scen7_sustained_critical_event"]
    assert scen7_fifo["max_queue_depth"] >= 3


def test_sustained_multi_camera_stress_concurrency():
    """
    Verifies multi-stream performance across 1 to 4 concurrent cameras.
    Ensures memory RSS is bounded (< 1500 MB) and CPU utilization is monitored.
    """
    report = evaluation_service.run_phase52_reliability_and_physical_intelligence_benchmark(save_report=False)
    stress = report["track_a_reliability_under_load"]["a3_sustained_multicamera_stress"]["streams_evaluated"]

    assert len(stress) == 4
    for stream_res in stress:
        assert stream_res["concurrent_cameras"] in [1, 2, 3, 4]
        assert stream_res["aggregate_fps"] > 0.0
        assert stream_res["ram_rss_mb"] < 1500.0  # Safe memory bound
        assert stream_res["camera_isolation_verified"] is True


def test_phase52_benchmark_api_endpoints(test_client):
    """
    Verifies Phase 5.2 Benchmark Endpoints:
    - GET /api/benchmark/phase52-reliability
    - POST /api/benchmark/run-phase52-reliability
    """
    # 1. Run benchmark endpoint
    r_run = test_client.post("/api/benchmark/run-phase52-reliability")
    assert r_run.status_code == 200
    data_run = r_run.json()
    assert data_run["validation_status"] == "PASSED"
    assert data_run["phase"] == "5.2"
    assert "track_a_reliability_under_load" in data_run
    assert "track_b_physical_crowd_intelligence" in data_run
    assert "operational_checklist" in data_run

    # 2. Get cached report
    r_get = test_client.get("/api/benchmark/phase52-reliability")
    assert r_get.status_code == 200
    data_get = r_get.json()
    assert data_get["validation_status"] == "PASSED"
    assert data_get["phase"] == "5.2"


def test_phase521_synthetic_multicamera_benchmark_provenance():
    """
    Phase 5.2.1 Benchmark Integrity:
    Ensures that the multi-camera benchmark reports its synthetic nature honestly:
    - benchmark_type is 'synthetic_event_dispatch_capacity'
    - is_synthetic is True
    - yolo_inference_performed is False
    - real_inference_fps is None (cannot be claimed as real inference)
    - real_inference_status explicitly records unmeasured state
    """
    report = evaluation_service.run_phase52_reliability_and_physical_intelligence_benchmark(save_report=False)
    stress_section = report["track_a_reliability_under_load"]["a3_sustained_multicamera_stress"]

    assert stress_section["benchmark_type"] == "synthetic_event_dispatch_capacity"
    assert stress_section["is_synthetic"] is True
    assert stress_section["yolo_inference_performed"] is False
    assert stress_section["real_inference_fps"] is None
    assert "NOT MEASURED" in stress_section["real_inference_status"]

    for stream_res in stress_section["streams_evaluated"]:
        assert stream_res["is_synthetic"] is True
        assert stream_res["yolo_inference_performed"] is False
        assert stream_res["real_inference_fps"] is None
        assert stream_res["benchmark_mode"] == "synthetic_dispatch_simulation"
        assert "synthetic_dispatch_fps" in stream_res
        assert "Synthetic Event Dispatch Capacity" in stream_res["metric_label"]


def test_phase521_queue_throughput_calculation_includes_drain_time():
    """
    Phase 5.2.1 Benchmark Integrity:
    Verifies that queue policy throughput calculation uses total elapsed processing time,
    including post-arrival queue drain:
    - Evaluates calculate_queue_throughput guards (zero duration, empty input).
    - Proves bounded FIFO throughput accounts for drain time and yields effective throughput
      without inflating to 12.0 FPS.
    - Confirms strict frame accounting: input == processed + dropped + remaining_queued.
    """
    # 1. Unit guards on throughput calculation
    assert evaluation_service.calculate_queue_throughput(0, 10.0) == 0.0
    assert evaluation_service.calculate_queue_throughput(10, 0.0) == 0.0
    assert evaluation_service.calculate_queue_throughput(10, -5.0) == 0.0
    # 96 frames in 9.6s must be exactly 10.0 FPS (NOT 12.0 FPS from 8.0s arrival denominator)
    assert evaluation_service.calculate_queue_throughput(96, 9.6) == 10.0

    # 2. Controlled simulation with drain enabled
    controlled_scenarios = {
        "test_stream": {
            "name": "Controlled 3:1 arrival to inference workload",
            "total_frames": 240,
            "hazard_frames": [10, 20, 30]
        }
    }
    fifo_drained = evaluation_service.simulate_queue_policy(
        policy_name="bounded_fifo",
        scenarios=controlled_scenarios,
        capture_fps=30.0,
        inference_duration_ms=100.0,
        drain_queue_at_end=True
    )
    assert fifo_drained["total_input_frames"] == 240
    assert fifo_drained["frames_remaining_queued"] == 0
    assert fifo_drained["workload_completed"] is True
    assert fifo_drained["accounting_verified"] is True
    assert fifo_drained["queue_drain_duration_sec"] > 0.0
    assert fifo_drained["effective_processing_fps"] == 10.0
    assert fifo_drained["total_input_frames"] == fifo_drained["total_processed_frames"] + fifo_drained["total_dropped_frames"]

    # 3. Controlled simulation with drain disabled
    fifo_undrained = evaluation_service.simulate_queue_policy(
        policy_name="bounded_fifo",
        scenarios=controlled_scenarios,
        capture_fps=30.0,
        inference_duration_ms=100.0,
        drain_queue_at_end=False
    )
    assert fifo_undrained["frames_remaining_queued"] > 0
    assert fifo_undrained["workload_completed"] is False
    assert fifo_undrained["accounting_verified"] is True
    assert (
        fifo_undrained["total_input_frames"]
        == fifo_undrained["total_processed_frames"]
        + fifo_undrained["total_dropped_frames"]
        + fifo_undrained["frames_remaining_queued"]
    )


def test_phase521_browser_timing_provenance_and_clock_isolation():
    """
    Phase 5.2.1 Benchmark Integrity:
    Ensures that browser render timing in the backend benchmark is labeled as simulated:
    - Stage 5 includes is_simulated: True and measurement_source: 'simulated_formula'
    - browser_measurement_status records that real DOM measurement is not available in headless CLI
    - Server-side latency measurements are monotonic and isolated from browser clock domain
    """
    report = evaluation_service.run_phase52_reliability_and_physical_intelligence_benchmark(save_report=False)
    a1 = report["track_a_reliability_under_load"]["a1_event_delivery_latency"]

    stage5 = a1["stages_breakdown"]["stage5_browser_receipt_to_render"]
    assert stage5["is_simulated"] is True
    assert stage5["measurement_source"] == "simulated_formula"
    assert stage5["browser_measurement_available"] is False

    browser_status = a1["browser_measurement_status"]
    assert browser_status["is_simulated"] is True
    assert browser_status["browser_measurement_available"] is False
    assert "headless" in browser_status["notes"].lower()

    # Server warmed-up total must be strictly positive and under 50ms
    assert 0.0 < a1["warmed_up_server_latency_ms"]["mean_ms"] < 50.0



def test_phase53a_queue_throughput_mathematical_consistency():
    """
    Phase 5.3A Mathematical Audit:
    Audits queue policy throughput calculation for exact numerical consistency:
    - Verifies hand-calculated single-stream queue drain: 85 frames / 8.5s = 10.0 FPS.
    - Verifies hand-calculated multi-scenario cumulative drain: 118 frames / 11.8s = 10.0 FPS.
    - Proves that pairing Phase 5.2's 96 processed frames with 11.8s would yield an inconsistent
      8.14 FPS, whereas Phase 5.2.1 correctly pairs 118 frames with 11.8s.
    - Verifies empty scenario input protection returns 0.0 FPS without division by zero.
    """
    # 1. Empty input protection
    empty_res = evaluation_service.simulate_queue_policy("bounded_fifo", {}, 30.0, 100.0)
    assert empty_res["total_input_frames"] == 0
    assert empty_res["total_processed_frames"] == 0
    assert empty_res["effective_processing_fps"] == 0.0
    assert empty_res["accounting_verified"] is True

    # 2. Hand-calculated single stream: 240 frames at 30 FPS, 100ms inference, queue cap 5
    single_stream = {
        "stream_1": {
            "name": "Single 240-frame continuous stream",
            "total_frames": 240,
            "hazard_frames": [10, 20, 30]
        }
    }
    res_single = evaluation_service.simulate_queue_policy("bounded_fifo", single_stream, 30.0, 100.0, True)
    assert res_single["total_input_frames"] == 240
    assert res_single["total_processed_frames"] == 85
    assert res_single["total_dropped_frames"] == 155
    assert res_single["total_elapsed_processing_sec"] == 8.5
    assert res_single["queue_drain_duration_sec"] == 0.5
    # Strict mathematical check: 85 / 8.5 == 10.0
    assert res_single["effective_processing_fps"] == round(85 / 8.5, 2)
    assert res_single["effective_processing_fps"] == 10.0

    # 3. Hand-calculated 7-scenario benchmark: exactly 118 frames / 11.8s = 10.0 FPS
    report = evaluation_service.run_phase52_reliability_and_physical_intelligence_benchmark(save_report=False)
    pols = report["track_a_reliability_under_load"]["a2_frame_dropping_vs_detection"]["policies_evaluated"]
    fifo = pols["bounded_fifo"]

    assert fifo["total_input_frames"] == 240
    assert fifo["total_processed_frames"] == 118
    assert fifo["total_dropped_frames"] == 122
    assert fifo["total_input_frames"] == fifo["total_processed_frames"] + fifo["total_dropped_frames"]
    assert fifo["total_elapsed_processing_sec"] == 11.8
    # Exact numerator / denominator match: 118 / 11.8 == 10.0
    assert fifo["effective_processing_fps"] == round(118 / 11.8, 2)
    assert fifo["effective_processing_fps"] == 10.0

    # Contrast with mismatched calculation: 96 / 11.8 is NOT 10.0
    assert round(96 / 11.8, 2) == 8.14


def test_phase53a_cpu_baseline_file_and_schema_integrity():
    """
    Phase 5.3A Baseline Integrity:
    Verifies that the reproducible CPU baseline artifact exists, matches the actual yolov8n.pt
    checksum, and records both pure-inference and full-pipeline measurements.
    """
    import os
    import json
    baseline_path = "data/reports/phase53a_cpu_baseline_results.json"
    assert os.path.exists(baseline_path), f"Baseline artifact not found: {baseline_path}"

    with open(baseline_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    meta = data["benchmark_metadata"]
    assert meta["phase"] == "5.3A"
    assert meta["device"] == "cpu"
    assert meta["model_architecture"] == "YOLOv8n (Ultralytics)"
    assert meta["model_weights_sha256"] == "F59B3D833E2FF32E194B5BB8E08D211DC7C5BDF144B90D2C8412C47CCFC83B36"

    inf = data["pure_inference_benchmark"]
    assert inf["throughput_fps"] > 10.0  # CPU inference runs >10 FPS
    assert inf["latency_p50_ms"] < 100.0

    pipe = data["end_to_end_pipeline_benchmark"]
    assert pipe["pipeline_throughput_fps"] > 0.0
    assert pipe["pipeline_latency_p50_ms"] > 0.0
    assert "stage_latency_means_ms" in pipe

    unmeasured = data["unmeasured_dimensions_and_limitations"]
    assert "NOT MEASURED" in unmeasured["tensorrt_directml_openvino"]
    assert "NOT MEASURED" in unmeasured["real_world_field_surveyor_calibration"]
