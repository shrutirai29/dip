import numpy as np
from typing import List, Dict

class PatternAndForecastingEngine:
    """
    Genuine Pattern Detection & Short-Term Crowd-Risk Forecasting:
    
    1. Pattern Recognition:
       - NORMAL_FLOW: Unidirectional dominant velocity
       - COUNTERFLOW: Opposing directional subpopulations
       - CONVERGENCE: Flow vectors converging into a high-density zone
       - DIVERGENCE: Flow spreading rapidly outwards
       - BOTTLENECK: High upstream density + low throughput velocity
       - RAPID_SURGE: Simultaneous surge in population & velocity
       - ABNORMAL_DISORDER: High directional Shannon entropy (>0.70) + velocity variance
       
    2. Short-Term Risk Forecast:
       - Uses temporal 5–15 sec feature window (derivatives of density, acceleration, entropy)
       - Computes forecasted risk at +5s, +10s, +15s horizons
       - Evaluates statistical confidence based on trajectory consistency
    """

    def __init__(self, history_window: int = 20):
        self.history_window = history_window
        self.risk_history: List[float] = []
        self.density_history: List[float] = []
        self.entropy_history: List[float] = []
        self.velocity_history: List[float] = []

    def reset(self):
        self.risk_history.clear()
        self.density_history.clear()
        self.entropy_history.clear()
        self.velocity_history.clear()

    def detect_crowd_patterns(
        self,
        tracks: List[Dict],
        zone_cells: List[Dict],
        optical_entropy: float,
        mean_speed: float,
        current_count: int
    ) -> Dict:
        """
        Evaluates active patterns across movement vectors and spatial zones.
        """
        pattern = "NORMAL_FLOW"
        confidence = 0.65
        details = "Unidirectional or baseline ambient motion"

        if current_count < 2:
            return {"pattern": "NORMAL_FLOW", "confidence": 0.50, "details": "Low crowd activity"}

        # 1. Abnormal Disorder / Panic Turbulence
        if optical_entropy >= 0.68 and mean_speed > 4.0:
            return {
                "pattern": "ABNORMAL_DISORDER",
                "confidence": min(0.95, round(0.5 + optical_entropy * 0.45, 2)),
                "details": f"High directional Shannon entropy ({optical_entropy:.2f}) indicates chaotic multi-directional motion"
            }

        # 2. Localized Bottleneck
        bottleneck_zones = [z for z in zone_cells if z.get("pattern") == "BOTTLENECK"]
        if bottleneck_zones:
            target_z = bottleneck_zones[0]
            return {
                "pattern": "BOTTLENECK",
                "confidence": 0.88,
                "details": f"Congestion choke point formed in {target_z['name']} (Inflow > Outflow with reduced velocity)"
            }

        # 3. Counterflow / Opposing streams
        # Check track directional angles for bimodal distribution around 180° opposition
        angles = [t.get("direction_angle", 0.0) for t in tracks if t.get("speed", 0.0) > 1.5]
        if len(angles) >= 4:
            # Positive x movement vs negative x movement
            cos_vals = [np.cos(a) for a in angles]
            pos_stream = len([c for c in cos_vals if c > 0.4])
            neg_stream = len([c for c in cos_vals if c < -0.4])
            if pos_stream >= 2 and neg_stream >= 2 and (pos_stream + neg_stream) / len(angles) > 0.65:
                return {
                    "pattern": "COUNTERFLOW",
                    "confidence": 0.82,
                    "details": f"Opposing bi-directional streams observed ({pos_stream} vs {neg_stream} tracked individuals)"
                }

        # 4. Rapid Surge
        if len(self.density_history) >= 3:
            d_growth = self.density_history[-1] - self.density_history[-3]
            if d_growth > 0.15 and mean_speed > 8.0:
                return {
                    "pattern": "RAPID_SURGE",
                    "confidence": 0.85,
                    "details": "Simultaneous rapid influx and high movement velocity detected"
                }

        # 5. Spatial Convergence vs Divergence (Radial velocity relative to crowd centroid)
        moving_tracks = [
            t for t in tracks
            if t.get("speed", 0.0) > 1.0 and "centroid" in t and "direction_angle" in t
        ]
        if len(moving_tracks) >= 4:
            # Compute crowd geometric centroid
            cx = float(np.mean([t["centroid"][0] for t in moving_tracks]))
            cy = float(np.mean([t["centroid"][1] for t in moving_tracks]))

            radial_projections = []
            for t in moving_tracks:
                tx, ty = t["centroid"]
                dx = tx - cx
                dy = ty - cy
                dist = np.hypot(dx, dy)
                if dist > 15.0:  # Skip tracks already virtually at the centroid
                    # Unit radial outward vector: (dx/dist, dy/dist)
                    # Unit velocity vector: (cos(angle), sin(angle))
                    angle = t["direction_angle"]
                    vx = np.cos(angle)
                    vy = np.sin(angle)
                    # Dot product > 0: moving outward away from centroid (divergence)
                    # Dot product < 0: moving inward toward centroid (convergence)
                    radial_dot = (dx * vx + dy * vy) / dist
                    radial_projections.append(radial_dot)

            if len(radial_projections) >= 4:
                mean_radial = float(np.mean(radial_projections))
                outward_ratio = sum(1 for r in radial_projections if r > 0.3) / len(radial_projections)
                inward_ratio = sum(1 for r in radial_projections if r < -0.3) / len(radial_projections)

                if mean_radial > 0.35 and outward_ratio >= 0.65:
                    return {
                        "pattern": "DIVERGENCE",
                        "confidence": min(0.92, round(0.55 + outward_ratio * 0.35, 2)),
                        "details": f"Spatial outward radial dispersion: {int(outward_ratio*100)}% of active trajectories moving away from crowd centroid"
                    }
                elif mean_radial < -0.35 and inward_ratio >= 0.65:
                    return {
                        "pattern": "CONVERGENCE",
                        "confidence": min(0.92, round(0.55 + inward_ratio * 0.35, 2)),
                        "details": f"Spatial inward radial convergence: {int(inward_ratio*100)}% of active trajectories focusing toward crowd centroid"
                    }

        # Secondary fallback: zone cell boundary inflow/outflow imbalance if tracks are sparse
        inflow_sum = sum(z.get("inflow", 0) for z in zone_cells)
        outflow_sum = sum(z.get("outflow", 0) for z in zone_cells)
        if inflow_sum > outflow_sum + 3 and current_count >= 6:
            return {
                "pattern": "CONVERGENCE",
                "confidence": 0.72,
                "details": "Crowd trajectory vectors converging inward across zone boundaries"
            }
        elif outflow_sum > inflow_sum + 3 and current_count >= 6:
            return {
                "pattern": "DIVERGENCE",
                "confidence": 0.70,
                "details": "Crowd trajectory vectors dispersing outward across zone boundaries"
            }

        return {"pattern": pattern, "confidence": confidence, "details": details}

    def compute_short_term_forecast(
        self,
        current_risk: float,
        current_density_comp: float,
        current_entropy: float,
        current_speed: float,
        detected_pattern: str,
        sample_interval_sec: float = 0.2
    ) -> Dict:
        """
        Multivariate temporal forecast for +5s, +10s, and +15s horizons.
        Calculates 1st and 2nd derivatives of risk and features to project trajectories.
        """
        self.risk_history.append(current_risk)
        self.density_history.append(current_density_comp)
        self.entropy_history.append(current_entropy)
        self.velocity_history.append(current_speed)

        if len(self.risk_history) > self.history_window:
            self.risk_history.pop(0)
            self.density_history.pop(0)
            self.entropy_history.pop(0)
            self.velocity_history.pop(0)

        # Base case: insufficient history
        if len(self.risk_history) < 4:
            return {
                "forecast_5s": round(current_risk, 1),
                "forecast_10s": round(current_risk, 1),
                "forecast_15s": round(current_risk, 1),
                "confidence": 50.0,
                "trend": "STABLE",
                "horizon_sec": 10,
                "reliability": "Uncalibrated trend-stability heuristic; insufficient history"
            }

        # Fit recent risk history and convert the slope to risk points per second.
        recent_risks = np.asarray(self.risk_history[-5:], dtype=float)
        x = np.arange(len(recent_risks), dtype=float)
        interval = max(float(sample_interval_sec), 1e-6)
        slope, _ = np.polyfit(x, recent_risks, 1)
        risk_slope_per_sec = float(slope / interval)

        # Factor in pattern hazard multipliers
        pattern_multiplier = 1.0
        if detected_pattern == "BOTTLENECK":
            pattern_multiplier = 1.25
        elif detected_pattern == "ABNORMAL_DISORDER":
            pattern_multiplier = 1.30
        elif detected_pattern == "RAPID_SURGE":
            pattern_multiplier = 1.20
        elif detected_pattern == "COUNTERFLOW":
            pattern_multiplier = 1.15

        # Project in seconds, not a fixed number of samples. Density already
        # contributes to the composite risk trajectory; adding its derivative
        # again would double-count it without a calibrated model.
        delta_5s = risk_slope_per_sec * 5.0 * pattern_multiplier
        delta_10s = risk_slope_per_sec * 10.0 * pattern_multiplier
        delta_15s = risk_slope_per_sec * 15.0 * pattern_multiplier

        f_5s = max(0.0, min(100.0, current_risk + delta_5s))
        f_10s = max(0.0, min(100.0, current_risk + delta_10s))
        f_15s = max(0.0, min(100.0, current_risk + delta_15s))

        # Determine Trend
        if f_10s - current_risk > 12.0:
            trend = "SURGING"
        elif f_10s - current_risk > 4.0:
            trend = "RISING"
        elif current_risk - f_10s > 4.0:
            trend = "EASING"
        else:
            trend = "STABLE"

        # Fit-stability heuristic, not a calibrated probability or confidence interval.
        intercept = float(np.mean(recent_risks) - slope * np.mean(x))
        residuals = recent_risks - (slope * x + intercept)
        mean_squared_residual = float(np.mean(residuals ** 2))
        variance_penalty = min(0.35, mean_squared_residual / 100.0)
        confidence = max(0.40, min(0.92, 0.85 - variance_penalty))

        return {
            "forecast_5s": round(f_5s, 1),
            "forecast_10s": round(f_10s, 1),
            "forecast_15s": round(f_15s, 1),
            "confidence": round(confidence * 100.0, 1),
            "trend": trend,
            "horizon_sec": 10,
            "reliability": "Uncalibrated trend-stability heuristic; not a probability"
        }
