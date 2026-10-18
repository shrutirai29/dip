import csv
import io
import datetime
from sqlalchemy.orm import Session
from app.models.entities import Analysis, FrameRecord, Incident

class ReportService:
    @staticmethod
    def generate_analysis_csv(analysis: Analysis, frame_records: list[FrameRecord], incidents: list[Incident]) -> str:
        """
        Generates a comprehensive CSV export containing video summary, frame-by-frame metrics,
        and logged incident events.
        """
        output = io.StringIO()
        writer = csv.writer(output)

        # 1. Header & Summary Section
        writer.writerow(["DIGITAL IMAGE PROCESSING CROWD SAFETY AUDIT REPORT"])
        writer.writerow(["Analysis ID", analysis.id])
        writer.writerow(["Video ID", analysis.video_id])
        writer.writerow(["Original Video", analysis.video.original_filename if analysis.video else "N/A"])
        writer.writerow(["Analyzed At", analysis.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")])
        writer.writerow(["Total Frames", analysis.total_frames])
        writer.writerow(["Peak Person Count", analysis.peak_count])
        writer.writerow(["Average Person Count", round(analysis.avg_count, 2)])
        writer.writerow(["Max Risk Score", round(analysis.max_risk_score, 2)])
        writer.writerow(["Average Risk Score", round(analysis.avg_risk_score, 2)])
        writer.writerow(["High-Risk Duration (sec)", round(analysis.high_risk_duration_sec, 2)])
        writer.writerow(["Total Incidents Triggered", len(incidents)])
        writer.writerow([])

        # 2. Incident Summary Table
        writer.writerow(["INCIDENTS LOG"])
        writer.writerow(["Incident ID", "Time (sec)", "Frame", "Type", "Severity", "Risk Score", "Region", "Reason", "Status"])
        for inc in incidents:
            writer.writerow([
                inc.id,
                inc.video_timestamp_sec,
                inc.frame_index,
                inc.incident_type,
                inc.severity,
                inc.risk_score,
                inc.relevant_region or "Global",
                inc.trigger_reason,
                inc.status
            ])
        writer.writerow([])

        # 3. Frame-by-Frame Data Table
        writer.writerow(["FRAME-BY-FRAME DIP & RISK METRICS"])
        writer.writerow([
            "Frame Index",
            "Timestamp (sec)",
            "Person Count",
            "Density Comp (0-1)",
            "Growth Comp (0-1)",
            "Motion Anomaly Comp (0-1)",
            "Congestion Comp (0-1)",
            "Raw Risk Score (0-100)",
            "Smoothed Risk Score (0-100)",
            "Risk Band",
            "Optical Flow Magnitude (px)",
            "Mean Speed (px/s)",
            "Risk Explanation"
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
                fr.risk_band,
                fr.optical_flow_magnitude,
                fr.mean_speed_pixels,
                fr.risk_explanation
            ])

        return output.getvalue()
