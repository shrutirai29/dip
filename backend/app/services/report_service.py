import csv
import io
from app.models.entities import Analysis, FrameRecord, Incident

class ReportService:
    @staticmethod
    def generate_analysis_csv(analysis: Analysis, frame_records: list[FrameRecord], incidents: list[Incident]) -> str:
        """
        Generates comprehensive CSV export containing video summary, frame-by-frame telemetry,
        forecasting metrics, patterns, and logged incidents.
        """
        output = io.StringIO()
        writer = csv.writer(output)

        # 1. Header & Summary Section
        writer.writerow(["CROWDGUARD / ADVANCED DIP CROWD MONITORING & DISASTER FORECASTING AUDIT"])
        writer.writerow(["Analysis ID", analysis.id])
        writer.writerow(["Video ID", analysis.video_id])
        writer.writerow(["Original Video", analysis.video.original_filename if analysis.video else "N/A"])
        writer.writerow(["Analyzed At", analysis.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")])
        writer.writerow(["Total Frames", analysis.total_frames])
        writer.writerow(["Peak Person Count", analysis.peak_count])
        writer.writerow(["Average Person Count", round(analysis.avg_count, 2)])
        writer.writerow(["Max Risk Score", round(analysis.max_risk_score, 2)])
        writer.writerow(["Average Risk Score", round(analysis.avg_risk_score, 2)])
        writer.writerow(["Dominant Pattern", analysis.dominant_pattern])
        writer.writerow(["High-Risk Duration (sec)", round(analysis.high_risk_duration_sec, 2)])
        writer.writerow(["Total Incidents Triggered", len(incidents)])
        writer.writerow([])

        # 2. Incident Summary Table
        writer.writerow(["INCIDENTS & EARLY WARNING LOG"])
        writer.writerow([
            "Incident ID", "Time (sec)", "Frame", "Type", "Severity", "Current Risk",
            "Forecast Risk (+10s)", "Region", "Reason", "Recommended Action", "Status"
        ])
        for inc in incidents:
            writer.writerow([
                inc.id,
                inc.video_timestamp_sec,
                inc.frame_index,
                inc.incident_type,
                inc.severity,
                inc.risk_score,
                inc.forecast_risk,
                inc.relevant_region or "Global",
                inc.trigger_reason,
                inc.recommended_action or "Human review advised",
                inc.status
            ])
        writer.writerow([])

        # 3. Frame-by-Frame Data Table
        writer.writerow(["FRAME-BY-FRAME DIP & RISK FORECAST METRICS"])
        writer.writerow([
            "Frame Index",
            "Timestamp (sec)",
            "Person Count",
            "Density Comp",
            "Growth Comp",
            "Motion Comp",
            "Congestion Comp",
            "Current Risk (0-100)",
            "Smoothed Risk (0-100)",
            "Forecast +5s",
            "Forecast +10s",
            "Forecast +15s",
            "Forecast Trend",
            "Forecast Confidence (%)",
            "Active Pattern",
            "Directional Entropy",
            "Optical Flow Mag (px)",
            "Mean Speed (px/s)",
            "Mean Accel (px/s2)",
            "Explanation"
        ])

        for fr in frame_records:
            writer.writerow([
                fr.frame_index,
                fr.timestamp_sec,
                fr.person_count,
                fr.density_component,
                fr.growth_component,
                fr.motion_anomaly_component,
                fr.congestion_component,
                fr.raw_risk_score,
                fr.smoothed_risk_score,
                fr.forecast_risk_5s,
                fr.forecast_risk_10s,
                fr.forecast_risk_15s,
                fr.forecast_trend,
                fr.forecast_confidence,
                fr.detected_pattern,
                fr.directional_entropy,
                fr.optical_flow_magnitude,
                fr.mean_speed_pixels,
                fr.mean_acceleration,
                fr.risk_explanation
            ])

        return output.getvalue()
