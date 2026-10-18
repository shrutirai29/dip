import cv2
import numpy as np
from typing import List, Dict

class DensityService:
    """
    Computes spatial crowd density, grid quadrant occupancy,
    and identifies crowded regions of interest (ROIs).
    """

    def __init__(self, grid_rows: int = 3, grid_cols: int = 3):
        self.grid_rows = grid_rows
        self.grid_cols = grid_cols

    def compute_grid_density(
        self,
        frame_width: int,
        frame_height: int,
        detections: List[Dict]
    ) -> List[Dict]:
        """
        Partitions the frame into a rows x cols grid and counts detections in each cell.
        Returns a list of grid cells with coordinates, person count, and percentage density.
        """
        cell_w = frame_width / self.grid_cols
        cell_h = frame_height / self.grid_rows
        
        cells = []
        for r in range(self.grid_rows):
            for c in range(self.grid_cols):
                cells.append({
                    "id": f"zone_{r}_{c}",
                    "name": f"Zone {chr(65 + r)}{c + 1}",
                    "row": r,
                    "col": c,
                    "x1": int(c * cell_w),
                    "y1": int(r * cell_h),
                    "x2": int((c + 1) * cell_w),
                    "y2": int((r + 1) * cell_h),
                    "count": 0,
                    "density_level": "Normal"
                })

        total_detections = len(detections)
        for det in detections:
            bbox = det.get("bbox", [])
            if len(bbox) != 4:
                continue
            x1, y1, x2, y2 = bbox
            cx = (x1 + x2) / 2.0
            cy = y2  # foot ground level

            c = min(self.grid_cols - 1, max(0, int(cx / cell_w)))
            r = min(self.grid_rows - 1, max(0, int(cy / cell_h)))
            idx = r * self.grid_cols + c
            cells[idx]["count"] += 1

        for cell in cells:
            count = cell["count"]
            if count >= 6:
                cell["density_level"] = "Critical"
            elif count >= 4:
                cell["density_level"] = "High"
            elif count >= 2:
                cell["density_level"] = "Moderate"
            else:
                cell["density_level"] = "Low"

        return cells

    def draw_grid_overlay(
        self,
        frame: np.ndarray,
        grid_cells: List[Dict],
        alpha: float = 0.25
    ) -> np.ndarray:
        """
        Draws subtle grid overlay lines and zone occupancy badges.
        """
        overlay = frame.copy()
        for cell in grid_cells:
            color = (0, 255, 0)
            if cell["density_level"] == "Critical":
                color = (0, 0, 255)
            elif cell["density_level"] == "High":
                color = (0, 140, 255)
            elif cell["density_level"] == "Moderate":
                color = (0, 255, 255)
                
            cv2.rectangle(overlay, (cell["x1"], cell["y1"]), (cell["x2"], cell["y2"]), color, 1)
            # Label
            label = f"{cell['name']}: {cell['count']}"
            cv2.putText(
                overlay, label, (cell["x1"] + 10, cell["y1"] + 25),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA
            )
            
        return cv2.addWeighted(overlay, alpha, frame, 1.0 - alpha, 0)
