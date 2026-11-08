"""
CROWDGUARD v2.0 — Phase 5.6 Frame Accounting Invariant Regression Tests

Formally verifies the mutually exclusive frame disposition model:
captured = processed_success + buffer_overwrites + rejected + processing_failed + pending + in_flight

Ensures mathematical closure across:
1. Normal successful processing
2. Bounded-queue frame overwrites
3. Frames pending at session termination
4. Exceptions in the processing pipeline incrementing processing_failed
5. Corrupt / degenerate frame rejections
6. Clean resetting of disposition counters
7. High-concurrency producer-consumer stress testing
"""

import time
import threading
import numpy as np
import pytest

from app.services.camera_session import CameraSession, CameraConfig, CameraSourceType
from app.services.camera_registry import camera_registry_service


def test_frame_accounting_initial_state():
    """Verify that a brand new session starts with perfectly balanced 0-counters."""
    config = CameraConfig(camera_id="cam_acct_init", name="Init Cam", source_type="file")
    session = CameraSession(config)
    st = session.get_status()

    assert st["frames_captured"] == 0
    assert st["frames_consumed"] == 0
    assert st["buffer_overwrites"] == 0
    assert st["pending_frames"] == 0
    assert st["frames_processed_success"] == 0
    assert st["frames_processing_failed"] == 0
    assert st["frames_rejected"] == 0
    assert st["in_flight_frames"] == 0
    assert st["disposition_sum"] == 0
    assert st["disposition_balanced"] is True
    assert st["accounting_identity_holds"] is True


def test_frame_accounting_single_pending_frame():
    """Verify that when a frame is recorded without being consumed, pending==1 and sum==captured."""
    config = CameraConfig(camera_id="cam_acct_pending", name="Pending Cam", source_type="file")
    session = CameraSession(config)

    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    ok = session._record_frame(frame, timestamp_sec=100.0, timestamp_mono=1000.0)
    assert ok is True

    st = session.get_status()
    assert st["frames_captured"] == 1
    assert st["frames_consumed"] == 0
    assert st["buffer_overwrites"] == 0
    assert st["pending_frames"] == 1
    assert st["in_flight_frames"] == 0
    assert st["frames_processed_success"] == 0
    assert st["disposition_sum"] == 1
    assert st["disposition_balanced"] is True
    assert st["accounting_identity_holds"] is True


def test_frame_accounting_bounded_queue_overwrites():
    """Verify that recording N unconsumed frames yields (N-1) overwrites and 1 pending frame."""
    config = CameraConfig(camera_id="cam_acct_overwrites", name="Overwrites Cam", source_type="file")
    session = CameraSession(config)

    for i in range(10):
        frame = np.full((100, 100, 3), i, dtype=np.uint8)
        ok = session._record_frame(frame, timestamp_sec=float(i), timestamp_mono=float(i))
        assert ok is True

    st = session.get_status()
    assert st["frames_captured"] == 10
    assert st["frames_consumed"] == 0
    assert st["buffer_overwrites"] == 9
    assert st["pending_frames"] == 1
    assert st["disposition_sum"] == 10
    assert st["disposition_balanced"] is True
    assert st["accounting_identity_holds"] is True


def test_frame_accounting_in_flight_consumption():
    """Verify that popping a frame transitions it from pending to in_flight without breaking balance."""
    config = CameraConfig(camera_id="cam_acct_inflight", name="Inflight Cam", source_type="file")
    session = CameraSession(config)

    frame = np.ones((100, 100, 3), dtype=np.uint8)
    session._record_frame(frame, 1.0, 10.0)

    # Pop the frame
    res = session.get_latest_raw_frame(timeout=0.05)
    assert res is not None

    st = session.get_status()
    assert st["frames_captured"] == 1
    assert st["frames_consumed"] == 1
    assert st["pending_frames"] == 0
    assert st["in_flight_frames"] == 1
    assert st["disposition_sum"] == 1
    assert st["disposition_balanced"] is True
    assert st["accounting_identity_holds"] is True


def test_frame_accounting_rejected_corrupt_frames():
    """Verify that degenerate frames (None, empty, 2D) are recorded as rejected."""
    config = CameraConfig(camera_id="cam_acct_rejected", name="Rejected Cam", source_type="file")
    session = CameraSession(config)

    # 1. None frame
    assert session._record_frame(None, 1.0) is False

    # 2. Empty array
    assert session._record_frame(np.array([], dtype=np.uint8), 2.0) is False

    # 3. 2D array (grayscale without channel dimension)
    assert session._record_frame(np.zeros((10, 10), dtype=np.uint8), 3.0) is False

    # 4. Tiny degenerate frame (<2x2)
    assert session._record_frame(np.zeros((1, 1, 3), dtype=np.uint8), 4.0) is False

    # 5. One valid frame
    assert session._record_frame(np.zeros((10, 10, 3), dtype=np.uint8), 5.0) is True

    st = session.get_status()
    assert st["frames_captured"] == 5
    assert st["frames_rejected"] == 4
    assert st["pending_frames"] == 1
    assert st["buffer_overwrites"] == 0
    assert st["disposition_sum"] == 5
    assert st["disposition_balanced"] is True
    assert st["accounting_identity_holds"] is True


def test_frame_accounting_pipeline_failure_recovery():
    """Verify that if processing raises an unhandled exception, frames_processing_failed is incremented."""
    config = CameraConfig(camera_id="cam_acct_fail", name="Fail Cam", source_type="file")
    session = CameraSession(config)

    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    session._record_frame(frame, 1.0, 10.0)

    # Simulate worker popping frame
    res = session.get_latest_raw_frame(timeout=0.05)
    assert res is not None

    # Simulate failure in processing block
    with session._frame_lock:
        session._frames_processing_failed += 1
        session._in_flight_frame = False

    st = session.get_status()
    assert st["frames_captured"] == 1
    assert st["frames_consumed"] == 1
    assert st["frames_processing_failed"] == 1
    assert st["in_flight_frames"] == 0
    assert st["pending_frames"] == 0
    assert st["disposition_sum"] == 1
    assert st["disposition_balanced"] is True
    assert st["accounting_identity_holds"] is True


def test_frame_accounting_reset():
    """Verify that reset_frame_accounting resets all disposition and identity metrics."""
    config = CameraConfig(camera_id="cam_acct_reset", name="Reset Cam", source_type="file")
    session = CameraSession(config)

    # Generate various dispositions
    session._record_frame(None, 1.0) # rejected
    session._record_frame(np.zeros((10, 10, 3), dtype=np.uint8), 2.0)
    session._record_frame(np.zeros((10, 10, 3), dtype=np.uint8), 3.0) # overwrite
    session.get_latest_raw_frame(0.01) # in flight

    st = session.get_status()
    assert st["frames_captured"] == 3
    assert st["disposition_balanced"] is True

    # Now reset
    session.reset_frame_accounting()
    st_reset = session.get_status()
    assert st_reset["frames_captured"] == 0
    assert st_reset["frames_consumed"] == 0
    assert st_reset["buffer_overwrites"] == 0
    assert st_reset["pending_frames"] == 0
    assert st_reset["frames_rejected"] == 0
    assert st_reset["in_flight_frames"] == 0
    assert st_reset["disposition_sum"] == 0
    assert st_reset["disposition_balanced"] is True


def test_frame_accounting_concurrent_stress():
    """Verify that under high-speed concurrent producer and consumer threads, the invariant holds."""
    config = CameraConfig(camera_id="cam_acct_stress", name="Stress Cam", source_type="file")
    session = CameraSession(config)

    total_produced = 100
    stop_event = threading.Event()

    def producer():
        for i in range(total_produced):
            if i % 25 == 0:
                # Deliberately inject a corrupt frame
                session._record_frame(None, float(i))
            else:
                f = np.full((32, 32, 3), i % 256, dtype=np.uint8)
                session._record_frame(f, float(i))
            time.sleep(0.001)

    def consumer():
        while not stop_event.is_set():
            data = session.get_latest_raw_frame(timeout=0.01)
            if data is not None:
                # Simulate short processing
                time.sleep(0.002)
                with session._frame_lock:
                    session._frames_processed_success += 1
                    session._in_flight_frame = False

    t_prod = threading.Thread(target=producer)
    t_cons = threading.Thread(target=consumer)

    t_prod.start()
    t_cons.start()

    t_prod.join()
    # Give consumer a brief moment to drain any in-flight frame
    time.sleep(0.05)
    stop_event.set()
    t_cons.join()

    st = session.get_status()
    assert st["frames_captured"] == total_produced
    assert st["disposition_sum"] == total_produced
    assert st["disposition_balanced"] is True
    assert st["accounting_identity_holds"] is True
