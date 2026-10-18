import numpy as np
from typing import List, Dict, Tuple

class SimpleByteTracker:
    """
    Lightweight, robust centroid & IoU multi-object tracker for CCTV people tracking.
    Maintains persistent track IDs, movement histories, speed calculation (px/sec),
    and trajectory directions.
    """

    def __init__(self, max_lost_frames: int = 15, iou_threshold: float = 0.3):
        self.max_lost_frames = max_lost_frames
        self.iou_threshold = iou_threshold
        self.next_id = 1
        
        # track_id -> dict with details:
        # 'id', 'bbox', 'centroid', 'history': [(x, y, timestamp)], 'lost_count', 'speed', 'direction'
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

    def update(self, detections: List[Dict], timestamp_sec: float) -> List[Dict]:
        """
        Takes raw detections: [{'bbox': [x1, y1, x2, y2], 'confidence': 0.85, ...}]
        Matches against existing tracks via IoU and distance heuristics.
        Returns tracked objects with assigned track_id, velocity, and trajectory history.
        """
        # If no existing tracks, create new ones
        if not self.tracks:
            for det in detections:
                bbox = det["bbox"]
                cx = (bbox[0] + bbox[2]) / 2.0
                cy = (bbox[1] + bbox[3]) / 2.0
                tid = self.next_id
                self.next_id += 1
                self.tracks[tid] = {
                    "id": tid,
                    "bbox": bbox,
                    "centroid": (cx, cy),
                    "history": [(cx, cy, timestamp_sec)],
                    "lost_count": 0,
                    "speed": 0.0,
                    "direction_angle": 0.0,
                    "confidence": det.get("confidence", 1.0)
                }
            return list(self.tracks.values())

        track_ids = list(self.tracks.keys())
        assigned_tracks = set()
        assigned_dets = set()

        # Compute cost matrix (1 - IoU)
        if detections and track_ids:
            matches = []
            for t_idx, tid in enumerate(track_ids):
                t_box = self.tracks[tid]["bbox"]
                for d_idx, det in enumerate(detections):
                    score = self._iou(t_box, det["bbox"])
                    if score >= self.iou_threshold:
                        matches.append((score, tid, d_idx))

            # Greedily match highest IoU first
            matches.sort(key=lambda x: x[0], reverse=True)
            for score, tid, d_idx in matches:
                if tid not in assigned_tracks and d_idx not in assigned_dets:
                    assigned_tracks.add(tid)
                    assigned_dets.add(d_idx)
                    
                    # Update track
                    det = detections[d_idx]
                    bbox = det["bbox"]
                    cx = (bbox[0] + bbox[2]) / 2.0
                    cy = (bbox[1] + bbox[3]) / 2.0
                    
                    old_history = self.tracks[tid]["history"]
                    old_cx, old_cy, old_time = old_history[-1]
                    dt = max(0.001, timestamp_sec - old_time)
                    dist = np.hypot(cx - old_cx, cy - old_cy)
                    speed = dist / dt  # pixels per second
                    direction = np.arctan2(cy - old_cy, cx - old_cx)
                    
                    new_hist = old_history + [(cx, cy, timestamp_sec)]
                    if len(new_hist) > 30:  # limit trajectory tail to 30 steps
                        new_hist = new_hist[-30:]
                        
                    self.tracks[tid].update({
                        "bbox": bbox,
                        "centroid": (cx, cy),
                        "history": new_hist,
                        "lost_count": 0,
                        "speed": float(speed),
                        "direction_angle": float(direction),
                        "confidence": det.get("confidence", 1.0)
                    })

        # For unassigned tracks, increment lost count
        for tid in track_ids:
            if tid not in assigned_tracks:
                self.tracks[tid]["lost_count"] += 1

        # Delete expired tracks
        self.tracks = {
            tid: trk for tid, trk in self.tracks.items()
            if trk["lost_count"] <= self.max_lost_frames
        }

        # For unassigned detections, initialize new tracks
        for d_idx, det in enumerate(detections):
            if d_idx not in assigned_dets:
                bbox = det["bbox"]
                cx = (bbox[0] + bbox[2]) / 2.0
                cy = (bbox[1] + bbox[3]) / 2.0
                tid = self.next_id
                self.next_id += 1
                self.tracks[tid] = {
                    "id": tid,
                    "bbox": bbox,
                    "centroid": (cx, cy),
                    "history": [(cx, cy, timestamp_sec)],
                    "lost_count": 0,
                    "speed": 0.0,
                    "direction_angle": 0.0,
                    "confidence": det.get("confidence", 1.0)
                }

        # Return currently active tracks (lost_count == 0)
        active_tracks = [trk for trk in self.tracks.values() if trk["lost_count"] == 0]
        return active_tracks
