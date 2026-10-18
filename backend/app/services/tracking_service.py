import numpy as np
from typing import List, Dict, Tuple

class SimpleByteTracker:
    """
    Robust multi-object tracker for CCTV people tracking:
    - Maintains persistent track IDs and lifetime counts.
    - Calculates instantaneous velocity (px/sec) and acceleration (px/sec²).
    - Tracks foot-points, directional angles, and active spatial zone.
    - Manages zone transitions (inflow / outflow) to detect bottlenecks.
    """

    def __init__(self, max_lost_frames: int = 15, iou_threshold: float = 0.3):
        self.max_lost_frames = max_lost_frames
        self.iou_threshold = iou_threshold
        self.next_id = 1
        self.tracks: Dict[int, Dict] = {}

    def _iou(self, boxA: list, boxB: list) -> float:
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2])
        yB = min(boxA[3], boxB[3])

        interArea = max(0, xB - xA) * max(0, yB - yA)
        boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
        boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])

        iou = interArea / float(boxAArea + boxBArea - interArea + 1e-6)
        return float(iou)

    def _get_zone_name(self, cx: float, cy: float, frame_w: int, frame_h: int) -> str:
        c = min(2, max(0, int(cx / (frame_w / 3.0))))
        r = min(2, max(0, int(cy / (frame_h / 3.0))))
        return f"Zone {chr(65 + r)}{c + 1}"

    def update(
        self,
        detections: List[Dict],
        timestamp_sec: float,
        frame_width: int = 640,
        frame_height: int = 480
    ) -> List[Dict]:
        """
        Takes raw detections and produces persistent tracked objects with velocity,
        acceleration, directional angles, and zone assignment.
        """
        if not self.tracks:
            for det in detections:
                bbox = det["bbox"]
                cx = (bbox[0] + bbox[2]) / 2.0
                cy = (bbox[1] + bbox[3]) / 2.0
                foot_pt = (cx, float(bbox[3]))
                zone = self._get_zone_name(cx, foot_pt[1], frame_width, frame_height)
                
                tid = self.next_id
                self.next_id += 1
                self.tracks[tid] = {
                    "id": tid,
                    "bbox": bbox,
                    "centroid": (cx, cy),
                    "foot_point": foot_pt,
                    "history": [(cx, cy, timestamp_sec)],
                    "lost_count": 0,
                    "speed": 0.0,
                    "acceleration": 0.0,
                    "direction_angle": 0.0,
                    "current_zone": zone,
                    "prev_zone": zone,
                    "confidence": det.get("confidence", 1.0)
                }
            return list(self.tracks.values())

        track_ids = list(self.tracks.keys())
        assigned_tracks = set()
        assigned_dets = set()

        if detections and track_ids:
            matches = []
            for tid in track_ids:
                t_box = self.tracks[tid]["bbox"]
                for d_idx, det in enumerate(detections):
                    score = self._iou(t_box, det["bbox"])
                    if score >= self.iou_threshold:
                        matches.append((score, tid, d_idx))

            matches.sort(key=lambda x: x[0], reverse=True)
            for score, tid, d_idx in matches:
                if tid not in assigned_tracks and d_idx not in assigned_dets:
                    assigned_tracks.add(tid)
                    assigned_dets.add(d_idx)
                    
                    det = detections[d_idx]
                    bbox = det["bbox"]
                    cx = (bbox[0] + bbox[2]) / 2.0
                    cy = (bbox[1] + bbox[3]) / 2.0
                    foot_pt = (cx, float(bbox[3]))
                    new_zone = self._get_zone_name(cx, foot_pt[1], frame_width, frame_height)
                    
                    old_history = self.tracks[tid]["history"]
                    old_cx, old_cy, old_time = old_history[-1]
                    old_speed = self.tracks[tid].get("speed", 0.0)
                    
                    dt = max(0.001, timestamp_sec - old_time)
                    dist = np.hypot(cx - old_cx, cy - old_cy)
                    current_speed = dist / dt  # px/sec
                    
                    # Acceleration = delta_v / delta_t
                    accel = (current_speed - old_speed) / dt
                    direction = np.arctan2(cy - old_cy, cx - old_cx)
                    
                    new_hist = old_history + [(cx, cy, timestamp_sec)]
                    if len(new_hist) > 30:
                        new_hist = new_hist[-30:]
                        
                    self.tracks[tid].update({
                        "bbox": bbox,
                        "centroid": (cx, cy),
                        "foot_point": foot_pt,
                        "history": new_hist,
                        "lost_count": 0,
                        "speed": float(current_speed),
                        "acceleration": float(accel),
                        "direction_angle": float(direction),
                        "prev_zone": self.tracks[tid]["current_zone"],
                        "current_zone": new_zone,
                        "confidence": det.get("confidence", 1.0)
                    })

        for tid in track_ids:
            if tid not in assigned_tracks:
                self.tracks[tid]["lost_count"] += 1

        # Prune expired tracks
        self.tracks = {
            tid: trk for tid, trk in self.tracks.items()
            if trk["lost_count"] <= self.max_lost_frames
        }

        # Initialize unassigned detections
        for d_idx, det in enumerate(detections):
            if d_idx not in assigned_dets:
                bbox = det["bbox"]
                cx = (bbox[0] + bbox[2]) / 2.0
                cy = (bbox[1] + bbox[3]) / 2.0
                foot_pt = (cx, float(bbox[3]))
                zone = self._get_zone_name(cx, foot_pt[1], frame_width, frame_height)
                
                tid = self.next_id
                self.next_id += 1
                self.tracks[tid] = {
                    "id": tid,
                    "bbox": bbox,
                    "centroid": (cx, cy),
                    "foot_point": foot_pt,
                    "history": [(cx, cy, timestamp_sec)],
                    "lost_count": 0,
                    "speed": 0.0,
                    "acceleration": 0.0,
                    "direction_angle": 0.0,
                    "current_zone": zone,
                    "prev_zone": zone,
                    "confidence": det.get("confidence", 1.0)
                }

        return [trk for trk in self.tracks.values() if trk["lost_count"] == 0]
