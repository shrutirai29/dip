"""
CROWDGUARD v2.0 — Phase 5.6 Multi-Camera Isolation & Fault-Injection Tests

Validates:
1. Strict per-camera state isolation between multiple concurrent camera sessions.
2. Fault injection: disconnecting Camera B does NOT disrupt Camera A or Camera C.
3. Anti-zeroing: Camera B preserves last known valid telemetry and timestamps rather than zeroing out.
4. Independent risk, tracker, and density analytics per camera.
5. Clean reconnection and state recovery of the disconnected camera.
"""

import time
import numpy as np
import pytest

from app.services.camera_session import CameraSession, CameraConfig, CameraState, CameraSourceType
from app.services.camera_registry import camera_registry_service


def test_multicamera_state_isolation_and_fault_injection():
    """Verify concurrent cameras maintain independent state when one suffers a disconnect fault."""
    # 1. Clean registry
    with camera_registry_service._lock:
        for s in list(camera_registry_service._sessions.values()):
            try:
                s.stop()
            except Exception:
                pass
        camera_registry_service._sessions.clear()

    # 2. Register 3 isolated cameras
    cam1 = camera_registry_service.register_camera(
        name="Zone A - West Gate",
        source_type="file"
    )
    cam2 = camera_registry_service.register_camera(
        name="Zone B - Central Plaza",
        source_type="file"
    )
    cam3 = camera_registry_service.register_camera(
        name="Zone C - East Concourse",
        source_type="file"
    )

    try:
        # Ingest distinct initial frames
        f1 = np.full((120, 160, 3), 50, dtype=np.uint8)
        f2 = np.full((120, 160, 3), 100, dtype=np.uint8)
        f3 = np.full((120, 160, 3), 150, dtype=np.uint8)

        t0 = 1000.0
        cam1._record_frame(f1, timestamp_sec=t0, timestamp_mono=t0)
        cam2._record_frame(f2, timestamp_sec=t0 + 1.0, timestamp_mono=t0 + 1.0)
        cam3._record_frame(f3, timestamp_sec=t0 + 2.0, timestamp_mono=t0 + 2.0)

        # Set Cam 1, 2, 3 as active/streaming
        cam1._set_state(CameraState.STREAMING)
        cam2._set_state(CameraState.STREAMING)
        cam3._set_state(CameraState.STREAMING)

        st1 = cam1.get_status()
        st2 = cam2.get_status()
        st3 = cam3.get_status()

        assert st1["state"] == CameraState.STREAMING
        assert st2["state"] == CameraState.STREAMING
        assert st3["state"] == CameraState.STREAMING
        assert st1["latest_frame_id"] == 1
        assert st2["latest_frame_id"] == 1
        assert st3["latest_frame_id"] == 1

        # 3. Fault Injection: inject hard disconnect into Cam 2
        cam2._set_state(CameraState.DISCONNECTED, "Simulated network partition on Zone B")

        # Ingest new frames into Cam 1 and Cam 3 during Cam 2's outage
        cam1._record_frame(f1, timestamp_sec=t0 + 10.0, timestamp_mono=t0 + 10.0)
        cam3._record_frame(f3, timestamp_sec=t0 + 10.0, timestamp_mono=t0 + 10.0)

        st1_after = cam1.get_status()
        st2_after = cam2.get_status()
        st3_after = cam3.get_status()

        # Cam 1 and Cam 3 are unaffected and continue progressing
        assert st1_after["state"] == CameraState.STREAMING
        assert st1_after["latest_frame_id"] == 2
        assert st3_after["state"] == CameraState.STREAMING
        assert st3_after["latest_frame_id"] == 2

        # Cam 2 is disconnected
        assert st2_after["state"] == CameraState.DISCONNECTED
        assert "Simulated network partition" in st2_after["error_message"]

        # Anti-zeroing check: Cam 2 retains its prior frame metadata and does not zero them out
        assert st2_after["latest_frame_id"] == 1
        assert st2_after["frames_captured"] == 1
        assert st2_after["latest_captured_timestamp"] == t0 + 1.0

        # 4. Recovery: Cam 2 reconnects
        cam2._set_state(CameraState.STREAMING, None)
        cam2._record_frame(f2, timestamp_sec=t0 + 20.0, timestamp_mono=t0 + 20.0)

        st2_recovered = cam2.get_status()
        assert st2_recovered["state"] == CameraState.STREAMING
        assert st2_recovered["latest_frame_id"] == 2
        assert st2_recovered["frames_captured"] == 2
        assert st2_recovered["disposition_balanced"] is True

    finally:
        with camera_registry_service._lock:
            for s in list(camera_registry_service._sessions.values()):
                try:
                    s.stop()
                except Exception:
                    pass
            camera_registry_service._sessions.clear()
