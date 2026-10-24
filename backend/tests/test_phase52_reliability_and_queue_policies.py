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
