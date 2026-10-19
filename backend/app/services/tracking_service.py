import numpy as np
from typing import List, Dict, Tuple, Any

class SimpleByteTracker:
    """
    Evidence-Based Multi-Object Pedestrian Tracker:
    - Maintains persistent track IDs across frames using greedy IoU matching.
    - Two-stage track confirmation state machine ('tentative' -> 'confirmed'):
        * Detections with high confidence (>= instant_confirm_conf) confirm immediately.
        * Moderate confidence detections require min_hits consecutive frames to confirm.
        * Unconfirmed tentative tracks that miss a single frame are immediately pruned.
        * Stale tracks (lost_count > 0) are never exposed as active people.
    - Calculates instantaneous 2D pixel velocity (px/sec) and acceleration (px/sec²).
    - Tracks ground foot-points, directional heading angles, and active spatial zones (A1–C3).
    - Detects cross-boundary zone transitions to measure localized inflow and outflow.
    """

    def __init__(
        self,
        max_lost_frames: int = 15,
        iou_threshold: float = 0.3,
        min_hits: int = 2,
        instant_confirm_conf: float = 0.60
    ):
        self.max_lost_frames = max_lost_frames
        self.iou_threshold = iou_threshold
        self.min_hits = min_hits
        self.instant_confirm_conf = instant_confirm_conf
        self.next_id = 1
        self.tracks: Dict[int, Dict[str, Any]] = {}

    def _iou(self, boxA: list, boxB: list) -> float:
        wA = max(0.0, float(boxA[2] - boxA[0]))
        hA = max(0.0, float(boxA[3] - boxA[1]))
        wB = max(0.0, float(boxB[2] - boxB[0]))
        hB = max(0.0, float(boxB[3] - boxB[1]))
        boxAArea = wA * hA
        boxBArea = wB * hB
        if boxAArea <= 0.0 or boxBArea <= 0.0:
            return 0.0

        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2])
        yB = min(boxA[3], boxB[3])

        interArea = max(0.0, xB - xA) * max(0.0, yB - yA)
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
        Takes validated person detections and updates confirmed tracked objects.
        Returns only confirmed tracks actively detected in the current frame.
        """
        track_ids = list(self.tracks.keys())
        assigned_tracks = set()
        assigned_dets = set()

        # 1. Match existing tracks with current detections using IoU
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
                    conf = float(det.get("confidence", 1.0))
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

                    accel = (current_speed - old_speed) / dt
                    direction = np.arctan2(cy - old_cy, cx - old_cx)

                    new_hist = old_history + [(cx, cy, timestamp_sec)]
                    if len(new_hist) > 30:
                        new_hist = new_hist[-30:]

                    new_hits = self.tracks[tid].get("hits", 1) + 1
                    is_confirmed = (
                        self.tracks[tid].get("is_confirmed", False)
                        or new_hits >= self.min_hits
                        or conf >= self.instant_confirm_conf
                    )

                    self.tracks[tid].update({
                        "bbox": bbox,
                        "centroid": (cx, cy),
                        "foot_point": foot_pt,
                        "history": new_hist,
                        "hits": new_hits,
                        "lost_count": 0,
                        "state": "confirmed" if is_confirmed else "tentative",
                        "is_confirmed": is_confirmed,
                        "speed": float(current_speed),
                        "acceleration": float(accel),
                        "direction_angle": float(direction),
                        "prev_zone": self.tracks[tid]["current_zone"],
                        "current_zone": new_zone,
                        "confidence": conf
                    })

        # 2. Increment lost count for unmatched tracks
        for tid in track_ids:
            if tid not in assigned_tracks:
                self.tracks[tid]["lost_count"] += 1

        # 3. Prune tracks:
        # - Tentative tracks that were not detected this frame (lost_count > 0) are PRUNED IMMEDIATELY.
        # - Confirmed tracks that exceed max_lost_frames are pruned.
        self.tracks = {
            tid: trk for tid, trk in self.tracks.items()
            if (trk.get("is_confirmed", False) and trk["lost_count"] <= self.max_lost_frames)
        }

        # 4. Initialize unassigned detections
        for d_idx, det in enumerate(detections):
            if d_idx not in assigned_dets:
                bbox = det["bbox"]
                conf = float(det.get("confidence", 1.0))
                cx = (bbox[0] + bbox[2]) / 2.0
                cy = (bbox[1] + bbox[3]) / 2.0
                foot_pt = (cx, float(bbox[3]))
                zone = self._get_zone_name(cx, foot_pt[1], frame_width, frame_height)

                is_confirmed = (conf >= self.instant_confirm_conf) or (self.min_hits <= 1)
                state = "confirmed" if is_confirmed else "tentative"

                tid = self.next_id
                self.next_id += 1
                self.tracks[tid] = {
                    "id": tid,
                    "bbox": bbox,
                    "centroid": (cx, cy),
                    "foot_point": foot_pt,
                    "history": [(cx, cy, timestamp_sec)],
                    "hits": 1,
                    "lost_count": 0,
                    "state": state,
                    "is_confirmed": is_confirmed,
                    "speed": 0.0,
                    "acceleration": 0.0,
                    "direction_angle": 0.0,
                    "current_zone": zone,
                    "prev_zone": zone,
                    "confidence": conf
                }

        # 5. Return strictly confirmed tracks that are actively present (lost_count == 0)
        return [
            trk for trk in self.tracks.values()
            if trk["lost_count"] == 0 and trk.get("is_confirmed", False)
        ]

    def get_diagnostic_tracks(self) -> List[Dict[str, Any]]:
        """Exposes internal tracker state including tentative and lost tracks for diagnostics."""
        return [
            {
                "id": trk["id"],
                "state": trk.get("state", "tentative"),
                "is_confirmed": trk.get("is_confirmed", False),
                "hits": trk.get("hits", 1),
                "lost_count": trk["lost_count"],
                "confidence": trk.get("confidence", 0.0),
                "bbox": trk["bbox"]
            }
            for trk in self.tracks.values()
        ]

