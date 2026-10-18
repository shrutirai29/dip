import cv2
import numpy as np
from typing import List, Dict

class DensityService:
    """
    Intelligent Spatial 3x3 Quadrant Analysis (Zones A1–C3):
    Calculates detailed telemetry per zone:
    - Population & normalized occupancy density
    - Average velocity & motion variance
    - Inflow & outflow across borders
    - Localized zone risk & bottleneck status
    """

    def __init__(self, grid_rows: int = 3, grid_cols: int = 3):
        self.grid_rows = grid_rows
        self.grid_cols = grid_cols
        self.prev_zone_counts: Dict[str, int] = {}

    def compute_zone_telemetry(
        self,
        frame_width: int,
        frame_height: int,
        detections: List[Dict],
        tracks: List[Dict],
        optical_flow_dict: Dict = None,
        perspective_weight: float = 1.0
    ) -> List[Dict]:
        cell_w = frame_width / float(self.grid_cols)
        cell_h = frame_height / float(self.grid_rows)
        
        cells = []
        for r in range(self.grid_rows):
            for c in range(self.grid_cols):
                zone_name = f"Zone {chr(65 + r)}{c + 1}"
                cells.append({
                    "id": f"zone_{r}_{c}",
                    "name": zone_name,
                    "row": r,
                    "col": c,
                    "x1": int(c * cell_w),
                    "y1": int(r * cell_h),
                    "x2": int((c + 1) * cell_w),
                    "y2": int((r + 1) * cell_h),
                    "population": 0,
                    "normalized_density": 0.0,
                    "density_level": "Low",
                    "avg_velocity": 0.0,
                    "velocity_variance": 0.0,
                    "inflow": 0,
                    "outflow": 0,
                    "zone_risk": 0.0,
                    "pattern": "NORMAL"
                })

        # 1. Populate counts from detections with perspective adjustment
        for det in detections:
            bbox = det.get("bbox", [])
            if len(bbox) != 4:
                continue
            cx = (bbox[0] + bbox[2]) / 2.0
            cy = float(bbox[3])  # Foot point

            c = min(self.grid_cols - 1, max(0, int(cx / cell_w)))
            r = min(self.grid_rows - 1, max(0, int(cy / cell_h)))
            idx = r * self.grid_cols + c
            cells[idx]["population"] += 1

        # 2. Correlate tracks for velocity, acceleration, and zone transitions
        zone_tracks: Dict[str, List[Dict]] = {cell["name"]: [] for cell in cells}
        for trk in tracks:
            z_curr = trk.get("current_zone")
            z_prev = trk.get("prev_zone")
            if z_curr in zone_tracks:
                zone_tracks[z_curr].append(trk)
            
            # Detect cross-boundary flow transitions
            if z_curr != z_prev and z_curr and z_prev:
                for c in cells:
                    if c["name"] == z_curr:
                        c["inflow"] += 1
                    if c["name"] == z_prev:
                        c["outflow"] += 1

        # 3. Calculate zone-specific velocities and normalized risks
        for cell in cells:
            z_name = cell["name"]
            t_list = zone_tracks.get(z_name, [])
            pop = cell["population"]
            
            # Perspective adjustment: top row (Row 0) has smaller pixel area per person
            y_factor = 1.0 + (1.0 - (cell["row"] / float(self.grid_rows))) * (perspective_weight * 0.5)
            norm_density = min(1.0, (pop * y_factor) / 12.0)
            cell["normalized_density"] = round(float(norm_density), 2)
            
            if t_list:
                speeds = [t["speed"] for t in t_list]
                cell["avg_velocity"] = round(float(np.mean(speeds)), 2)
                cell["velocity_variance"] = round(float(np.var(speeds)), 2)
            else:
                cell["avg_velocity"] = 0.0
                cell["velocity_variance"] = 0.0

            # Density classification
            if norm_density >= 0.70 or pop >= 8:
                cell["density_level"] = "Critical"
            elif norm_density >= 0.45 or pop >= 5:
                cell["density_level"] = "High"
            elif norm_density >= 0.20 or pop >= 2:
                cell["density_level"] = "Moderate"
            else:
                cell["density_level"] = "Low"

            # Compute Zone Risk Index (0-100)
            z_risk = (
                norm_density * 45.0 +
                min(35.0, cell["inflow"] * 8.0) +
                (20.0 if (pop >= 4 and cell["avg_velocity"] < 2.0) else 0.0)
            )
            cell["zone_risk"] = round(min(100.0, float(z_risk)), 1)
            
            # Identify local bottleneck / convergence
            if cell["inflow"] > cell["outflow"] and pop >= 4 and cell["avg_velocity"] < 3.0:
                cell["pattern"] = "BOTTLENECK"
            elif pop >= 6 and cell["avg_velocity"] > 15.0:
                cell["pattern"] = "RAPID_SURGE"
            elif pop >= 5:
                cell["pattern"] = "HIGH_CONCENTRATION"

        return cells

    def draw_grid_overlay(
        self,
        frame: np.ndarray,
        grid_cells: List[Dict],
        alpha: float = 0.22
    ) -> np.ndarray:
        """
        Draws tactical surveillance HUD overlay on the video frame.
        """
        overlay = frame.copy()
        for cell in grid_cells:
            color = (0, 220, 100)  # Low/Safe
            if cell["density_level"] == "Critical":
                color = (0, 0, 255)
            elif cell["density_level"] == "High":
                color = (0, 140, 255)
            elif cell["density_level"] == "Moderate":
                color = (0, 220, 255)
                
            cv2.rectangle(overlay, (cell["x1"], cell["y1"]), (cell["x2"], cell["y2"]), color, 1)
            
            # Zone header badge
            badge_text = f"{cell['name']} | N:{cell['population']} ({cell['density_level']})"
            cv2.putText(
                overlay, badge_text, (cell["x1"] + 8, cell["y1"] + 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, color, 1, cv2.LINE_AA
            )
            
            # Bottleneck tag if present
            if cell["pattern"] == "BOTTLENECK":
                cv2.putText(
                    overlay, "ALERT: BOTTLENECK", (cell["x1"] + 8, cell["y1"] + 36),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 0, 255), 1, cv2.LINE_AA
                )
            
        return cv2.addWeighted(overlay, alpha, frame, 1.0 - alpha, 0)
