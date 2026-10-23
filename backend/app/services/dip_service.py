import cv2
import numpy as np

# In-memory kernel cache for 2D Gaussian density splatting
_GAUSSIAN_KERNEL_CACHE: dict = {}

def _get_cached_gaussian_kernel(k_scaled: int, sigma: float) -> np.ndarray:
    cache_key = (k_scaled, round(sigma, 1))
    if cache_key not in _GAUSSIAN_KERNEL_CACHE:
        half_k = k_scaled // 2
        x = np.arange(-half_k, half_k + 1)
        y = np.arange(-half_k, half_k + 1)
        xx, yy = np.meshgrid(x, y)
        kernel = np.exp(-(xx**2 + yy**2) / (2.0 * sigma**2)).astype(np.float32)
        _GAUSSIAN_KERNEL_CACHE[cache_key] = kernel
    return _GAUSSIAN_KERNEL_CACHE[cache_key]


class DIPProcessor:
    """
    Advanced Digital Image Processing (DIP) pipeline:
    1. Preprocessing, aspect-preserving letterbox & bilateral/Gaussian filtering.
    2. Temporal frame differencing with morphological opening to suppress sensor noise.
    3. Gunnar Farneback Dense Optical Flow (pyr_scale=0.5, levels=3, winsize=15).
    4. Motion magnitude, direction vector field, and directional Shannon entropy.
    5. Perspective-aware 2D continuous Gaussian density splatting (Y-axis perspective normalization).
    6. Privacy anonymization filters (face blurring & silhouette anonymization).
    """

    @staticmethod
    def preprocess_frame(frame: np.ndarray, apply_denoise: bool = False) -> np.ndarray:
        """
        DIP: Dual-stage noise suppression.
        When apply_denoise is True, applies edge-preserving bilateral filtering.
        Default is False to avoid redundant CPU filtering prior to CNN inference.
        """
        if apply_denoise and frame is not None and frame.size > 0:
            return cv2.bilateralFilter(frame, 5, 50, 50)
        return frame

    @staticmethod
    def compute_frame_difference(
        prev_gray: np.ndarray,
        curr_gray: np.ndarray,
        threshold: int = 25
    ) -> tuple[float, np.ndarray]:
        """
        DIP: Temporal frame differencing + morphological noise cleanup.
        """
        if prev_gray is None or curr_gray is None or prev_gray.size == 0 or curr_gray.size == 0 or prev_gray.shape != curr_gray.shape:
            fallback = np.zeros_like(curr_gray) if (curr_gray is not None and curr_gray.size > 0) else np.zeros((10, 10), dtype=np.uint8)
            return 0.0, fallback
        
        diff = cv2.absdiff(curr_gray, prev_gray)
        _, thresh = cv2.threshold(diff, threshold, 255, cv2.THRESH_BINARY)
        
        # Morphological opening (erode followed by dilate) to remove isolated single-pixel sensor noise
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        clean_thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
        
        motion_ratio = float(np.count_nonzero(clean_thresh)) / float(clean_thresh.size)
        return motion_ratio, clean_thresh

    @staticmethod
    def compute_optical_flow_dynamics(
        prev_gray: np.ndarray,
        curr_gray: np.ndarray
    ) -> dict:
        """
        DIP: Gunnar Farneback Dense Optical Flow analysis.
        Computes:
        - Mean flow velocity (px/frame)
        - Velocity variance (motion irregularity / instability)
        - Directional Shannon Entropy (0.0 to 1.0):
            H = -Σ p_i log2(p_i) / log2(N_bins)
            Low entropy: coordinated laminar motion
            High entropy: chaotic multi-directional turbulence
        """
        if prev_gray is None or curr_gray is None or prev_gray.size == 0 or curr_gray.size == 0 or prev_gray.shape != curr_gray.shape:
            return {
                "mean_magnitude": 0.0,
                "motion_variance": 0.0,
                "directional_entropy": 0.0,
                "flow_raw": None,
                "magnitude": np.zeros((10, 10), dtype=np.float32),
                "angle": np.zeros((10, 10), dtype=np.float32)
            }
            
        flow = cv2.calcOpticalFlowFarneback(
            prev_gray, curr_gray, None,
            pyr_scale=0.5, levels=3, winsize=15,
            iterations=3, poly_n=5, poly_sigma=1.2, flags=0
        )
        
        u = flow[..., 0]
        v = flow[..., 1]
        mag, ang = cv2.cartToPolar(u, v, angleInDegrees=False)  # 0 to 2pi
        
        # Moving threshold (> 0.8 px/frame)
        moving_mask = mag > 0.8
        moving_mags = mag[moving_mask]
        moving_angs = ang[moving_mask]
        
        if len(moving_mags) > 10:
            mean_mag = float(np.mean(moving_mags))
            var_mag = float(np.var(moving_mags))
            
            # Compute Directional Shannon Entropy across 8 angular sectors (N=8 bins: 45° sectors)
            num_bins = 8
            hist, _ = np.histogram(moving_angs, bins=num_bins, range=(0, 2 * np.pi))
            prob = hist / float(np.sum(hist))
            prob = prob[prob > 0]  # Avoid log(0)
            
            shannon_h = -np.sum(prob * np.log2(prob))
            norm_entropy = float(shannon_h / np.log2(num_bins))
            norm_entropy = min(1.0, max(0.0, norm_entropy))
        else:
            mean_mag = 0.0
            var_mag = 0.0
            norm_entropy = 0.0

        return {
            "mean_magnitude": round(mean_mag, 2),
            "motion_variance": round(var_mag, 2),
            "directional_entropy": round(norm_entropy, 3),
            "flow_raw": flow,
            "magnitude": mag,
            "angle": ang
        }

    @staticmethod
    def generate_density_heatmap(
        frame_shape: tuple[int, int],
        detections: list[dict],
        kernel_size: int = 61,
        sigma_base: float = 14.0,
        perspective_weight: float = 1.0
    ) -> np.ndarray:
        """
        DIP: Perspective-Aware Continuous 2D Gaussian Density Splatting.
        Adjusts Gaussian kernel footprint and weighting according to vertical Y-coordinate:
        - People farther away (higher in frame, small pixel bounding area) receive perspective normalization.
        - People close up (lower in frame) receive standard ground projection.
        Optimized with cached kernel arrays.
        """
        h, w = frame_shape[:2]
        if not detections:
            return np.zeros((h, w, 3), dtype=np.uint8)

        density_map = np.zeros((h, w), dtype=np.float32)
        
        for det in detections:
            bbox = det.get("bbox", [])
            if len(bbox) != 4:
                continue
            x1, y1, x2, y2 = bbox
            cx = int((x1 + x2) / 2)
            # Ground foot position
            cy = int(y2)
            
            # Y-coordinate perspective scale factor (normalized from horizon 0.2 to bottom 1.0)
            y_norm = max(0.1, min(1.0, cy / float(h)))
            
            # Far perspective weight: when higher up (small y_norm), scale up representation
            persp_scale = 1.0 + (1.0 - y_norm) * (perspective_weight * 0.8)
            
            # Adaptive kernel size scaled by perspective (smaller in background, wider in foreground)
            k_scaled = int(kernel_size * (0.6 + 0.5 * y_norm))
            if k_scaled % 2 == 0:
                k_scaled += 1
            half_k = k_scaled // 2
            
            sigma = max(3.0, sigma_base * (0.6 + 0.5 * y_norm))
            
            # Retrieve cached Gaussian kernel patch
            base_k = _get_cached_gaussian_kernel(k_scaled, sigma)
            kernel = base_k * persp_scale
            
            # Bounds clipping
            kx1 = max(0, cx - half_k)
            kx2 = min(w, cx + half_k + 1)
            ky1 = max(0, cy - half_k)
            ky2 = min(h, cy + half_k + 1)
            
            gk_x1 = kx1 - (cx - half_k)
            gk_x2 = gk_x1 + (kx2 - kx1)
            gk_y1 = ky1 - (cy - half_k)
            gk_y2 = gk_y1 + (ky2 - ky1)
            
            if kx2 > kx1 and ky2 > ky1 and gk_x2 > gk_x1 and gk_y2 > gk_y1:
                density_map[ky1:ky2, kx1:kx2] += kernel[gk_y1:gk_y2, gk_x1:gk_x2]
                
        # Normalize continuous surface to 0-255
        max_val = np.max(density_map)
        if max_val > 0:
            norm_density = np.clip((density_map / max(max_val, 3.5)) * 255, 0, 255).astype(np.uint8)
        else:
            return np.zeros((h, w, 3), dtype=np.uint8)
            
        # Colorize using high-contrast JET colormap
        heatmap_colored = cv2.applyColorMap(norm_density, cv2.COLORMAP_JET)
        
        # Suppress lowest 12% to preserve background visibility
        mask = norm_density > 25
        heatmap_masked = np.zeros_like(heatmap_colored)
        heatmap_masked[mask] = heatmap_colored[mask]
        
        return heatmap_masked

    @staticmethod
    def apply_privacy_filter(frame: np.ndarray, detections: list[dict], mode: str = "none") -> np.ndarray:
        """
        DIP Privacy Preservation Module:
        - "face_blur": Bilateral heavy blur applied to upper 25% head region of every person
        - "full_anonymize": Solid filled silhouette overlay preventing biometric profiling
        """
        if mode == "none" or not detections:
            return frame
            
        out = frame.copy()
        h, w = frame.shape[:2]
        
        for det in detections:
            bbox = det.get("bbox", [])
            if len(bbox) != 4:
                continue
            x1, y1, x2, y2 = [int(v) for v in bbox]
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)
            
            if x2 <= x1 or y2 <= y1:
                continue
                
            box_h = y2 - y1
            
            if mode == "face_blur":
                # Upper 28% represents head/face
                face_y2 = min(y2, y1 + int(box_h * 0.28))
                face_roi = out[y1:face_y2, x1:x2]
                if face_roi.size > 0:
                    rh, rw = face_roi.shape[:2]
                    kw = min(25, rw if rw % 2 != 0 else rw - 1)
                    kh = min(25, rh if rh % 2 != 0 else rh - 1)
                    kw = max(3, kw)
                    kh = max(3, kh)
                    blurred = cv2.GaussianBlur(face_roi, (kw, kh), 30)
                    out[y1:face_y2, x1:x2] = blurred
            elif mode == "full_anonymize":
                # Dark gray privacy silhouette applied strictly inside the bounding box
                box_roi = out[y1:y2, x1:x2]
                if box_roi.size > 0:
                    mask_color = np.full_like(box_roi, (40, 45, 55))
                    out[y1:y2, x1:x2] = cv2.addWeighted(mask_color, 0.85, box_roi, 0.15, 0)
                
        return out

    @staticmethod
    def blend_heatmap_on_frame(frame: np.ndarray, heatmap: np.ndarray, alpha: float = 0.45) -> np.ndarray:
        """
        DIP: Alpha blending weighted overlay: Output = Frame*(1-alpha) + Heatmap*alpha.
        Optimized with cv2.addWeighted and uint8 vectorized masking to eliminate float32 conversion overhead.
        """
        if heatmap is None or frame is None or heatmap.size == 0 or frame.size == 0:
            return frame
        gray = cv2.cvtColor(heatmap, cv2.COLOR_BGR2GRAY)
        mask = gray > 10
        if not np.any(mask):
            return frame
        blended = cv2.addWeighted(frame, 1.0 - alpha, heatmap, alpha, 0)
        out = frame.copy()
        mask3 = np.repeat(mask[:, :, np.newaxis], 3, axis=2)
        np.copyto(out, blended, where=mask3)
        return out
