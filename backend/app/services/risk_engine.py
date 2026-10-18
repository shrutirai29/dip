import numpy as np

class CrowdRiskEngine:
    """
    Transparent, explainable, configurable crowd-risk score ranging from 0 to 100.
    Computed from actual measurements:
    - Crowd density / occupancy pressure (35%)
    - Rapid crowd growth / influx rate (20%)
    - Unusual movement or flow irregularity (25%)
    - Sustained movement convergence / localized congestion (20%)
    
    Formula:
    risk_score = 100 * (
        w_density * density_comp +
        w_growth * growth_comp +
        w_motion * motion_anomaly_comp +
        w_congestion * congestion_comp
    )
    """

    def __init__(
        self,
        weight_density: float = 0.35,
        weight_growth: float = 0.20,
        weight_motion_anomaly: float = 0.25,
        weight_congestion: float = 0.20,
        history_window_size: int = 15,
        alpha_ema: float = 0.3  # Exponential moving average smoothing
    ):
        # Normalize weights to ensure sum == 1.0
        total_w = weight_density + weight_growth + weight_motion_anomaly + weight_congestion
        if total_w <= 0:
            total_w = 1.0
        self.w_density = weight_density / total_w
        self.w_growth = weight_growth / total_w
        self.w_motion = weight_motion_anomaly / total_w
        self.w_congestion = weight_congestion / total_w
        
        self.history_window_size = history_window_size
        self.alpha_ema = alpha_ema
        
        # State tracking over time
        self.count_history: list[int] = []
        self.speed_history: list[float] = []
        self.last_smoothed_risk: float = 0.0
        
    def reset(self):
        self.count_history.clear()
        self.speed_history.clear()
        self.last_smoothed_risk = 0.0

    def compute_risk(
        self,
        current_count: int,
        optical_flow_mag: float,
        mean_speed: float,
        grid_densities: list[float] = None
    ) -> dict:
        """
        Evaluates risk components and returns normalized values, raw and smoothed risk scores,
        band, and clear plain-language rationale.
        """
        # Input sanitization against NaN or non-finite values
        current_count = max(0, int(current_count))
        optical_flow_mag = float(np.nan_to_num(optical_flow_mag, nan=0.0, posinf=100.0, neginf=0.0))
        mean_speed = float(np.nan_to_num(mean_speed, nan=0.0, posinf=100.0, neginf=0.0))
        if grid_densities:
            grid_densities = [float(np.nan_to_num(g, nan=0.0, posinf=1.0, neginf=0.0)) for g in grid_densities]

        # 1. Density Component (0.0 to 1.0)
        # Using occupancy heuristic: 0 people -> 0.0; 25+ people in frame -> 1.0
        # If grid densities are provided, peak local cluster density has higher weight
        max_cluster_density = max(grid_densities) if grid_densities else 0.0
        density_comp = min(1.0, (current_count / 25.0) * 0.7 + (max_cluster_density / 8.0) * 0.3)
        
        # 2. Crowd Growth Component (0.0 to 1.0)
        self.count_history.append(current_count)
        if len(self.count_history) > self.history_window_size:
            self.count_history.pop(0)
            
        if len(self.count_history) > 1:
            baseline_count = np.mean(self.count_history[:-1])
            growth_delta = current_count - baseline_count
            # Rapid surge of +5 to +10 people normalized
            growth_comp = max(0.0, min(1.0, growth_delta / 8.0))
        else:
            growth_comp = 0.0

        # 3. Motion Anomaly / Flow Irregularity Component (0.0 to 1.0)
        # Low or chaotic motion when crowded, or sudden surge in optical flow
        self.speed_history.append(mean_speed)
        if len(self.speed_history) > self.history_window_size:
            self.speed_history.pop(0)
            
        # If optical flow exceeds typical baseline (> 6.0 px) or drops near 0 with high density (crush/bottleneck)
        if current_count > 8 and mean_speed < 0.5:
            # Standstill bottleneck risk
            motion_anomaly_comp = 0.8
        else:
            # Panic surge / running motion detection
            motion_anomaly_comp = min(1.0, optical_flow_mag / 8.0)
            
        # 4. Congestion / Convergence Component (0.0 to 1.0)
        # Evaluated from highest regional grid concentration relative to total count
        if current_count > 0 and grid_densities:
            # Gini-like concentration: if 60%+ of the crowd is packed into 1 grid cell
            concentration_ratio = max_cluster_density / max(1, current_count)
            congestion_comp = min(1.0, concentration_ratio * 1.5)
        else:
            congestion_comp = min(1.0, current_count / 30.0)

        # Raw Risk Formula
        raw_score = 100.0 * (
            self.w_density * density_comp +
            self.w_growth * growth_comp +
            self.w_motion * motion_anomaly_comp +
            self.w_congestion * congestion_comp
        )
        raw_score = max(0.0, min(100.0, raw_score))

        # Temporal EMA Smoothing to eliminate single-frame flickering
        if self.last_smoothed_risk == 0.0:
            smoothed_score = raw_score
        else:
            smoothed_score = self.alpha_ema * raw_score + (1.0 - self.alpha_ema) * self.last_smoothed_risk
        
        self.last_smoothed_risk = smoothed_score

        # Risk Band
        if smoothed_score < 25.0:
            band = "Low"
        elif smoothed_score < 50.0:
            band = "Moderate"
        elif smoothed_score < 75.0:
            band = "High"
        else:
            band = "Critical"

        # Explainable reasons
        explanations = []
        if density_comp > 0.6:
            explanations.append(f"Elevated crowd concentration ({current_count} persons detected)")
        if growth_comp > 0.5:
            explanations.append("Rapid crowd influx detected in rolling window")
        if motion_anomaly_comp > 0.6:
            explanations.append("Abnormal motion vectors or optical flow velocity surge")
        if congestion_comp > 0.6:
            explanations.append("High spatial clustering/localized bottleneck in monitored zone")
        if not explanations:
            explanations.append("Crowd movement and spatial distribution are within standard baseline parameters")

        return {
            "density_comp": round(float(density_comp), 4),
            "growth_comp": round(float(growth_comp), 4),
            "motion_anomaly_comp": round(float(motion_anomaly_comp), 4),
            "congestion_comp": round(float(congestion_comp), 4),
            "raw_score": round(float(raw_score), 2),
            "smoothed_score": round(float(smoothed_score), 2),
            "band": band,
            "explanation": " • ".join(explanations)
        }
