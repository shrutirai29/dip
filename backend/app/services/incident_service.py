import uuid
import datetime
from sqlalchemy.orm import Session
from app.models.entities import Incident

class IncidentService:
    """
    Evaluates analysis measurements and logs actionable alert records.
    Types:
    - CRITICAL_RISK: Overall smoothed risk score exceeds 75
    - HIGH_CROWD_DENSITY: Density component > 0.70 or count > 20
    - RAPID_GROWTH: Crowd surge rate > 0.60
    - ABNORMAL_MOTION: High optical flow speed or sudden crush bottleneck
    - LOCALIZED_BOTTLENECK: Severe grid cluster congestion
    """

    def __init__(self, db: Session):
        self.db = db
        # Cooldown dictionary: (analysis_id, incident_type) -> last_triggered_video_sec
        self.cooldowns: dict[tuple[str, str], float] = {}
        self.cooldown_period_sec = 4.0  # Avoid firing identical alerts continuously every second

    def check_and_create_incidents(
        self,
        analysis_id: str,
        frame_idx: int,
        timestamp_sec: float,
        risk_data: dict,
        current_count: int,
        grid_cells: list[dict],
        evidence_frame_path: str = None
    ) -> list[Incident]:
        created_incidents = []
        smoothed_score = risk_data.get("smoothed_score", 0.0)
        density_comp = risk_data.get("density_comp", 0.0)
        growth_comp = risk_data.get("growth_comp", 0.0)
        motion_comp = risk_data.get("motion_anomaly_comp", 0.0)
        congestion_comp = risk_data.get("congestion_comp", 0.0)

        # 1. Critical Overall Risk
        if smoothed_score >= 75.0:
            self._trigger_incident(
                created_incidents,
                analysis_id=analysis_id,
                frame_idx=frame_idx,
                timestamp_sec=timestamp_sec,
                incident_type="CRITICAL_RISK",
                severity="CRITICAL",
                risk_score=smoothed_score,
                reason=f"Severe crowd emergency risk threshold exceeded ({smoothed_score:.1f}/100)",
                measurements={"risk_data": risk_data, "person_count": current_count},
                region="Global Scene",
                evidence_path=evidence_frame_path
            )

        # 2. High Crowd Density
        if density_comp >= 0.75:
            self._trigger_incident(
                created_incidents,
                analysis_id=analysis_id,
                frame_idx=frame_idx,
                timestamp_sec=timestamp_sec,
                incident_type="HIGH_CROWD_DENSITY",
                severity="HIGH",
                risk_score=smoothed_score,
                reason=f"Dangerous crowd density detected ({current_count} persons in monitored field)",
                measurements={"density_comp": density_comp, "person_count": current_count},
                region="Field of View",
                evidence_path=evidence_frame_path
            )

        # 3. Rapid Crowd Surge
        if growth_comp >= 0.70:
            self._trigger_incident(
                created_incidents,
                analysis_id=analysis_id,
                frame_idx=frame_idx,
                timestamp_sec=timestamp_sec,
                incident_type="RAPID_GROWTH",
                severity="HIGH",
                risk_score=smoothed_score,
                reason="Rapid influx / sudden crowd influx surge detected in rolling time window",
                measurements={"growth_comp": growth_comp},
                region="Entrance / Passage",
                evidence_path=evidence_frame_path
            )

        # 4. Abnormal Motion / Flow Irregularity
        if motion_comp >= 0.75:
            self._trigger_incident(
                created_incidents,
                analysis_id=analysis_id,
                frame_idx=frame_idx,
                timestamp_sec=timestamp_sec,
                incident_type="ABNORMAL_MOTION",
                severity="MODERATE" if smoothed_score < 70 else "HIGH",
                risk_score=smoothed_score,
                reason="High-velocity movement perturbation or sudden panic dispersion motion vectors",
                measurements={"motion_comp": motion_comp},
                region="Corridor",
                evidence_path=evidence_frame_path
            )

        # 5. Localized Congestion in Grid Cells
        critical_cells = [c for c in grid_cells if c.get("density_level") == "Critical"]
        if critical_cells and congestion_comp >= 0.65:
            hotspot_names = ", ".join([c["name"] for c in critical_cells])
            self._trigger_incident(
                created_incidents,
                analysis_id=analysis_id,
                frame_idx=frame_idx,
                timestamp_sec=timestamp_sec,
                incident_type="LOCALIZED_BOTTLENECK",
                severity="HIGH",
                risk_score=smoothed_score,
                reason=f"Localized bottleneck formed with high concentration in: {hotspot_names}",
                measurements={"hotspots": [c["name"] for c in critical_cells], "congestion_comp": congestion_comp},
                region=hotspot_names,
                evidence_path=evidence_frame_path
            )

        return created_incidents

    def _trigger_incident(
        self,
        accumulator: list,
        analysis_id: str,
        frame_idx: int,
        timestamp_sec: float,
        incident_type: str,
        severity: str,
        risk_score: float,
        reason: str,
        measurements: dict,
        region: str,
        evidence_path: str
    ):
        key = (analysis_id, incident_type)
        last_time = self.cooldowns.get(key, -999.0)
        if timestamp_sec - last_time < self.cooldown_period_sec:
            return  # still in cooldown
            
        self.cooldowns[key] = timestamp_sec

        incident = Incident(
            id=f"inc_{uuid.uuid4().hex[:10]}",
            analysis_id=analysis_id,
            frame_index=frame_idx,
            video_timestamp_sec=round(timestamp_sec, 2),
            incident_type=incident_type,
            severity=severity,
            risk_score=round(risk_score, 1),
            trigger_reason=reason,
            measurements=measurements,
            relevant_region=region,
            evidence_frame_path=evidence_path,
            status="Open",
            created_at=datetime.datetime.utcnow()
        )
        self.db.add(incident)
        self.db.commit()
        self.db.refresh(incident)
        accumulator.append(incident)
