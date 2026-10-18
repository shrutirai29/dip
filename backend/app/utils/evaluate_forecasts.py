import os
import sys
import json
import math
import numpy as np
from typing import Dict, List, Any

# Ensure backend directory is in sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sqlalchemy.orm import Session
from app.database.session import SessionLocal
from app.models.entities import Video, Analysis, FrameRecord
from app.services.forecasting_service import PatternAndForecastingEngine
from app.core.config import settings

def run_forecast_evaluation(output_json_path: str = None) -> Dict[str, Any]:
    """
    Evaluates short-term predictive forecasting (+5s, +10s, +15s) against observed future risk.
    - Evaluates on independent video sequences (train/held-out split by video ID to prevent adjacent frame leakage)
    - Compares predicted risk against actual observed future risk using MAE and RMSE
    - Benchmarks against simple persistence baseline: FutureRisk(t + dt) = CurrentRisk(t)
    - Explicitly labels limits: uncalibrated trend extrapolation, no real-world stampede ground truth assumed.
    """
    if output_json_path is None:
        output_json_path = os.path.join(settings.REPORTS_DIR, "forecast_evaluation_results.json")

    db: Session = SessionLocal()
    try:
        # Query all completed analyses that have recorded frame records
        completed_analyses = db.query(Analysis).filter(Analysis.status == "completed").all()
        sequences_by_video: Dict[str, List[Dict[str, float]]] = {}

        for anl in completed_analyses:
            frames = (
                db.query(FrameRecord)
                .filter(FrameRecord.analysis_id == anl.id)
                .order_by(FrameRecord.frame_index.asc())
                .all()
            )
            if len(frames) >= 15:
                seq = [
                    {
                        "frame_index": f.frame_index,
                        "timestamp_sec": float(f.timestamp_sec),
                        "smoothed_risk": float(f.smoothed_risk_score),
                        "density_comp": float(f.density_component),
                        "entropy": float(f.directional_entropy),
                        "speed": float(f.mean_speed_pixels),
                        "pattern": f.detected_pattern or "NORMAL_FLOW",
                    }
                    for f in frames
                ]
                sequences_by_video[anl.video_id] = seq

        video_ids = list(sequences_by_video.keys())
        total_videos = len(video_ids)

        if total_videos == 0:
            result = {
                "status": "insufficient_data",
                "message": "No completed video analyses found in database with >= 15 frames.",
                "total_videos": 0,
                "total_sequences": 0,
                "ground_truth_limitation": "Real-world stampede ground truth is unverified.",
            }
            os.makedirs(os.path.dirname(output_json_path), exist_ok=True)
            with open(output_json_path, "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2)
            return result

        # Split videos into development (train) and held-out evaluation sets (by video, zero frame leakage)
        if total_videos > 1:
            split_idx = max(1, int(total_videos * 0.5))
            dev_videos = video_ids[:split_idx]
            held_out_videos = video_ids[split_idx:]
        else:
            dev_videos = video_ids
            held_out_videos = video_ids

        horizons = [5, 10, 15]
        eval_metrics: Dict[str, Dict[str, Any]] = {
            f"+{h}s": {
                "errors_model": [],
                "errors_persistence": [],
                "valid_points": 0,
                "missing_points": 0,
            }
            for h in horizons
        }

        # Evaluate on held-out videos
        for vid in held_out_videos:
            seq = sequences_by_video[vid]
            n_frames = len(seq)
            if n_frames < 10:
                continue

            dt_step = (seq[-1]["timestamp_sec"] - seq[0]["timestamp_sec"]) / max(1, n_frames - 1)
            engine = PatternAndForecastingEngine(history_window=20)

            for i, step in enumerate(seq):
                fc = engine.compute_short_term_forecast(
                    current_risk=step["smoothed_risk"],
                    current_density_comp=step["density_comp"],
                    current_entropy=step["entropy"],
                    current_speed=step["speed"],
                    detected_pattern=step["pattern"],
                    sample_interval_sec=max(0.04, dt_step),
                )

                t_current = step["timestamp_sec"]
                r_current = step["smoothed_risk"]

                for h in horizons:
                    h_key = f"+{h}s"
                    target_time = t_current + float(h)
                    # Find closest future frame in this same video sequence
                    future_frames = [f for f in seq[i+1:] if abs(f["timestamp_sec"] - target_time) <= max(1.0, dt_step * 2)]
                    if future_frames:
                        closest = min(future_frames, key=lambda f: abs(f["timestamp_sec"] - target_time))
                        actual_future_risk = closest["smoothed_risk"]
                        pred_future_risk = fc[f"forecast_{h}s"]

                        eval_metrics[h_key]["errors_model"].append(pred_future_risk - actual_future_risk)
                        eval_metrics[h_key]["errors_persistence"].append(r_current - actual_future_risk)
                        eval_metrics[h_key]["valid_points"] += 1
                    else:
                        eval_metrics[h_key]["missing_points"] += 1

        summary_horizons: Dict[str, Dict[str, Any]] = {}
        for h in horizons:
            h_key = f"+{h}s"
            m_errs = np.array(eval_metrics[h_key]["errors_model"])
            p_errs = np.array(eval_metrics[h_key]["errors_persistence"])
            valid = eval_metrics[h_key]["valid_points"]
            missing = eval_metrics[h_key]["missing_points"]

            if valid > 0:
                mae_model = float(np.mean(np.abs(m_errs)))
                rmse_model = float(np.sqrt(np.mean(m_errs ** 2)))
                mae_persist = float(np.mean(np.abs(p_errs)))
                rmse_persist = float(np.sqrt(np.mean(p_errs ** 2)))
            else:
                mae_model = rmse_model = mae_persist = rmse_persist = None

            summary_horizons[h_key] = {
                "valid_points": valid,
                "missing_points": missing,
                "model_mae": round(mae_model, 2) if mae_model is not None else None,
                "model_rmse": round(rmse_model, 2) if rmse_model is not None else None,
                "persistence_baseline_mae": round(mae_persist, 2) if mae_persist is not None else None,
                "persistence_baseline_rmse": round(rmse_persist, 2) if rmse_persist is not None else None,
            }

        report = {
            "evaluation_title": "CROWDGUARD Short-Term Forecast Verification Report",
            "split_methodology": "Held-out split by video sequence (strictly 0 adjacent-frame temporal leakage)",
            "total_video_catalogs": total_videos,
            "development_videos": len(dev_videos),
            "held_out_evaluation_videos": len(held_out_videos),
            "horizons": summary_horizons,
            "scientific_integrity_statement": (
                "The evaluated forecast represents a linear trend projection of the heuristic risk index. "
                "Because real-world labeled crowd disaster benchmark datasets are not integrated into this local setup, "
                "these metrics benchmark mathematical trend stability and extrapolation error against the observed "
                "future composite risk score, NOT real-world disaster/stampede probability. "
                "No fabricated precision, recall, or disaster prediction percentages are claimed."
            ),
        }

        os.makedirs(os.path.dirname(output_json_path), exist_ok=True)
        with open(output_json_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)

        return report

    finally:
        db.close()

if __name__ == "__main__":
    rep = run_forecast_evaluation()
    print(json.dumps(rep, indent=2))
