import os
import time
import pytest

requests = pytest.importorskip("requests")

pytestmark = pytest.mark.skipif(
    os.getenv("CROWDGUARD_RUN_E2E") != "1",
    reason="Set CROWDGUARD_RUN_E2E=1 and start the API server to run this integration test."
)

def test_pipeline():
    base_url = "http://127.0.0.1:8000/api"
    video_path = "data/sample_videos/crowd_bottleneck_demo.mp4"
    
    print("[1] Uploading video...")
    with open(video_path, "rb") as f:
        res = requests.post(f"{base_url}/videos/upload", files={"file": ("crowd_bottleneck_demo.mp4", f, "video/mp4")})
    assert res.status_code == 200, f"Upload failed: {res.text}"
    vid = res.json()
    video_id = vid["id"]
    print(f" -> Uploaded: {video_id}, {vid['duration_seconds']}s, {vid['frame_count']} frames, {vid['fps']} fps")

    print("[2] Creating analysis job with DIP perspective & privacy...")
    payload = {
        "video_id": video_id,
        "conf_threshold": 0.25,
        "frame_stride": 2,
        "inference_size": 640,
        "weight_density": 0.35,
        "weight_growth": 0.20,
        "weight_motion_anomaly": 0.25,
        "weight_congestion": 0.20,
        "perspective_weight": 1.2,
        "privacy_mode": "none"
    }
    res = requests.post(f"{base_url}/analyses", json=payload)
    assert res.status_code == 200, f"Analysis creation failed: {res.text}"
    analysis = res.json()
    analysis_id = analysis["id"]
    print(f" -> Analysis created: {analysis_id}, status: {analysis['status']}")

    print("[3] Polling progress until completed...")
    for _ in range(60):
        time.sleep(1.0)
        res = requests.get(f"{base_url}/analyses/{analysis_id}")
        anl = res.json()
        print(f" -> Progress: {anl['progress_percent']}% | Frame: {anl['current_frame']}/{anl['total_frames']} | Status: {anl['status']} | FPS: {anl['processing_fps']}")
        if anl["status"] in ["completed", "failed", "cancelled"]:
            break

    assert anl["status"] == "completed", f"Job failed or cancelled: {anl.get('error_message')}"
    print(f" -> Job Completed! Peak Count: {anl['peak_count']}, Avg Risk: {anl['avg_risk_score']}, Dominant Pattern: {anl['dominant_pattern']}")
    
    # Verify annotated video exists and has non-zero size
    ann_rel = anl.get("annotated_video_path", "").lstrip("/")
    ann_full = os.path.join(".", ann_rel)
    assert os.path.exists(ann_full), f"Annotated video missing on disk: {ann_full}"
    assert os.path.getsize(ann_full) > 10000, f"Annotated video is too small or empty: {os.path.getsize(ann_full)} bytes"
    print(f" -> Verified playable annotated video on disk: {ann_full} ({os.path.getsize(ann_full)} bytes)")

    print("[4] Fetching frame-by-frame telemetry...")
    res = requests.get(f"{base_url}/analyses/{analysis_id}/results")
    assert res.status_code == 200
    frames = res.json()
    print(f" -> Received {len(frames)} recorded frame telemetry objects.")
    if frames:
        sample = frames[-1]
        print(f"    Sample t={sample['timestamp_sec']}s: Count={sample['person_count']}, CurrentRisk={sample['smoothed_risk_score']}, Forecast+10s={sample['forecast_risk_10s']} ({sample['forecast_trend']}), Pattern={sample['detected_pattern']}, Entropy={sample['directional_entropy']}")
        assert sample["forecast_risk_10s"] >= 0.0
        assert len(sample["grid_density"]) == 9

    print("[5] Fetching incidents...")
    res = requests.get(f"{base_url}/incidents")
    assert res.status_code == 200
    incidents = res.json()
    session_inc = [i for i in incidents if i["analysis_id"] == analysis_id]
    print(f" -> Found {len(session_inc)} sustained incidents generated for session.")
    if session_inc:
        inc = session_inc[0]
        print(f"    Incident: {inc['id']} | Type: {inc['incident_type']} | Severity: {inc['severity']} | Score: {inc['risk_score']} | Rec: {inc['recommended_action']}")

    print("[6] Testing CSV export...")
    res = requests.get(f"{base_url}/analyses/{analysis_id}/export")
    assert res.status_code == 200
    csv_text = res.text
    assert "CROWDGUARD" in csv_text
    assert "Forecast +10s" in csv_text
    print(" -> CSV export verified successfully!")

    print("\nALL 6 PIPELINE INTEGRATION STEPS PASSED PERFECTLY!")

if __name__ == "__main__":
    test_pipeline()
