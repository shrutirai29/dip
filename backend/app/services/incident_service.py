import uuid
import datetime
from sqlalchemy.orm import Session
from app.models.entities import Incident

class IncidentService:
    """
    Sustained Event-Based Incident Management & Actionable Early Warnings:
    
    1. Condition Sustenance Window:
       Requires conditions to be sustained for N consecutive sampled frames before firing,
       preventing isolated noise or single-frame flickering alerts.
       
    2. Incident Taxonomy:
       - CRITICAL_RISK: Sustained critical overall hazard (Score > 75)
       - HIGH_CROWD_DENSITY: Sustained spatial saturation
       - RAPID_GROWTH: Rapid influx surge
       - ABNORMAL_MOTION: Turbulent directional disorder / panic vectors
       - LOCALIZED_BOTTLENECK: Sustained localized choke point
       - COUNTERFLOW_HAZARD: Opposing bi-directional collision risk
       - CONVERGENCE_SURGE: Multiple streams focusing into single passage
       
    3. Actionable Advisory Recommendations:
       Generates clear human-operator advisory actions without autonomous unsafe actuation.
    """

    def __init__(self, db: Session, sustenance_frames: int = 3, cooldown_sec: float = 4.0):
        self.db = db
        self.sustenance_frames = sustenance_frames
        self.cooldown_sec = cooldown_sec
        
        # Tracking condition counter: (analysis_id, incident_type) -> consecutive_frames
        self.condition_counters: dict[tuple[str, str], int] = {}
        # Cooldown timer: (analysis_id, incident_type) -> last_triggered_video_sec
        self.cooldowns: dict[tuple[str, str], float] = {}

    def check_and_create_incidents(
        self,
        analysis_id: str,
        frame_idx: int,
        timestamp_sec: float,
        risk_data: dict,
        current_count: int,
        grid_cells: list[dict],
        pattern_data: dict,
        forecast_data: dict,
        evidence_frame_path: str = None
    ) -> list[Incident]:
        created = []
        smoothed_score = risk_data.get("smoothed_score", 0.0)
        density_comp = risk_data.get("density_comp", 0.0)
        growth_comp = risk_data.get("growth_comp", 0.0)
        motion_comp = risk_data.get("motion_anomaly_comp", 0.0)
        congestion_comp = risk_data.get("congestion_comp", 0.0)
        
        active_pattern = pattern_data.get("pattern", "NORMAL_FLOW")
        f_risk = forecast_data.get("forecast_10s", smoothed_score)

        # 1. Critical Overall Risk Condition (Reserved for verified high current risk or high risk surging towards critical)
        critical_condition = (
            smoothed_score >= 75.0 or (smoothed_score >= 60.0 and f_risk >= 82.0)
        )
        self._evaluate_sustained_condition(
            condition=critical_condition,
            accumulator=created,
            analysis_id=analysis_id,
            frame_idx=frame_idx,
            timestamp_sec=timestamp_sec,
            incident_type="CRITICAL_RISK",
            severity="CRITICAL",
            risk_score=smoothed_score,
            forecast_risk=f_risk,
            reason=f"Severe crowd emergency risk threshold exceeded ({smoothed_score:.1f}/100, Forecast +10s: {f_risk:.1f})",
            action="URGENT: Dispatch on-site safety marshals immediately. Open secondary perimeter exit corridors and halt incoming inflow.",
            measurements={"risk_data": risk_data, "person_count": current_count, "forecast": forecast_data},
            region="Global Scene",
            evidence_path=evidence_frame_path
        )

        # 1b. Early Advisory Warning: High Projected Surge while current risk is moderate
        projected_surge_condition = (
            smoothed_score < 60.0 and f_risk >= 82.0 and forecast_data.get("trend") in ["SURGING", "RISING"]
        )
        self._evaluate_sustained_condition(
            condition=projected_surge_condition,
            accumulator=created,
            analysis_id=analysis_id,
            frame_idx=frame_idx,
            timestamp_sec=timestamp_sec,
            incident_type="PROJECTED_SURGE_WARNING",
            severity="MODERATE",
            risk_score=smoothed_score,
            forecast_risk=f_risk,
            reason=f"Advisory: Linear extrapolation projects potential risk surge (+10s: {f_risk:.1f}) while current risk is moderate ({smoothed_score:.1f}/100)",
            action="ADVISORY: Monitor corridor inflow and prepare standby marshals. Awaiting real-time confirmation before active intervention.",
            measurements={"risk_data": risk_data, "person_count": current_count, "forecast": forecast_data},
            region="Global Scene",
            evidence_path=evidence_frame_path
        )

        # 2. Localized Bottleneck
        bottleneck_zones = [c for c in grid_cells if c.get("pattern") == "BOTTLENECK"]
        self._evaluate_sustained_condition(
            condition=(len(bottleneck_zones) > 0 or active_pattern == "BOTTLENECK"),
            accumulator=created,
            analysis_id=analysis_id,
            frame_idx=frame_idx,
            timestamp_sec=timestamp_sec,
            incident_type="LOCALIZED_BOTTLENECK",
            severity="HIGH",
            risk_score=smoothed_score,
            forecast_risk=f_risk,
            reason=f"Dangerous localized bottleneck detected in {', '.join([z['name'] for z in bottleneck_zones]) if bottleneck_zones else 'Monitored Sector'}",
            action="Inspect choke point immediately. Deploy staff to alleviate stationary congestion and guide pedestrian movement.",
            measurements={"bottlenecks": [z["name"] for z in bottleneck_zones], "congestion_comp": congestion_comp},
            region=bottleneck_zones[0]["name"] if bottleneck_zones else "Sector B2",
            evidence_path=evidence_frame_path
        )

        # 3. Abnormal Motion / Directional Disorder (Panic / Dispersion)
        self._evaluate_sustained_condition(
            condition=(motion_comp >= 0.72 or active_pattern == "ABNORMAL_DISORDER"),
            accumulator=created,
            analysis_id=analysis_id,
            frame_idx=frame_idx,
            timestamp_sec=timestamp_sec,
            incident_type="ABNORMAL_MOTION",
            severity="HIGH" if smoothed_score > 60 else "MODERATE",
            risk_score=smoothed_score,
            forecast_risk=f_risk,
            reason="High directional Shannon entropy and velocity fluctuations detected (potential panic or turbulence)",
            action="Monitor video feed closely for physical conflict or sudden localized panic. Prepare public address broadcast.",
            measurements={"motion_comp": motion_comp, "pattern": pattern_data},
            region="Central Passage",
            evidence_path=evidence_frame_path
        )

        # 4. Rapid Crowd Surge / Influx
        self._evaluate_sustained_condition(
            condition=(growth_comp >= 0.70 or active_pattern == "RAPID_SURGE"),
            accumulator=created,
            analysis_id=analysis_id,
            frame_idx=frame_idx,
            timestamp_sec=timestamp_sec,
            incident_type="RAPID_GROWTH",
            severity="HIGH",
            risk_score=smoothed_score,
            forecast_risk=f_risk,
            reason="Abrupt influx surge detected in rolling temporal window",
            action="Temporarily meter entry turnstiles/gates to regulate inflow rate into corridor.",
            measurements={"growth_comp": growth_comp},
            region="Entrance Inflow",
            evidence_path=evidence_frame_path
        )

        # 5. Counterflow Collision Hazard
        self._evaluate_sustained_condition(
            condition=(active_pattern == "COUNTERFLOW"),
            accumulator=created,
            analysis_id=analysis_id,
            frame_idx=frame_idx,
            timestamp_sec=timestamp_sec,
            incident_type="COUNTERFLOW_HAZARD",
            severity="MODERATE",
            risk_score=smoothed_score,
            forecast_risk=f_risk,
            reason="Opposing bi-directional crowd streams colliding in narrow space",
            action="Establish directional physical barricades or one-way lane guidance to separate opposing flows.",
            measurements={"pattern": pattern_data},
            region="Transit Corridor",
            evidence_path=evidence_frame_path
        )

        return created

    def _evaluate_sustained_condition(
        self,
        condition: bool,
        accumulator: list,
        analysis_id: str,
        frame_idx: int,
        timestamp_sec: float,
        incident_type: str,
        severity: str,
        risk_score: float,
        forecast_risk: float,
        reason: str,
        action: str,
        measurements: dict,
        region: str,
        evidence_path: str
    ):
        key = (analysis_id, incident_type)
        
        if condition:
            self.condition_counters[key] = self.condition_counters.get(key, 0) + 1
        else:
            self.condition_counters[key] = 0
            return

        # Condition must be sustained for minimum consecutive frames
        if self.condition_counters[key] < self.sustenance_frames:
            return

        # Check cooldown
        last_time = self.cooldowns.get(key, -999.0)
        if timestamp_sec - last_time < self.cooldown_sec:
            return

        self.cooldowns[key] = timestamp_sec

        incident = Incident(
            id=f"inc_{uuid.uuid4().hex[:10]}",
            analysis_id=analysis_id,
            frame_index=frame_idx,
            video_timestamp_sec=round(timestamp_sec, 2),
            incident_type=incident_type,
            severity=severity,
            risk_score=round(risk_score, 1),
            forecast_risk=round(forecast_risk, 1),
            trigger_reason=reason,
            recommended_action=action,
            measurements=measurements,
            relevant_region=region,
            evidence_frame_path=evidence_path,
            status="Open",
            created_at=datetime.datetime.utcnow()
        )
        try:
            self.db.add(incident)
            self.db.commit()
            self.db.refresh(incident)
            accumulator.append(incident)
        except Exception as e:
            self.db.rollback()
            print(f"[IncidentService] Error persisting incident: {e}")
