import cv2
import numpy as np

class DIPProcessor:
    """
    Digital Image Processing (DIP) techniques module:
    1. Grayscale & Color space transformations (BGR to RGB, HSV, Gray)
    2. Gaussian smoothing & Bilateral filtering (noise reduction)
    3. Dense Optical Flow (Farneback) for crowd motion dynamics
    4. Frame Differencing & Motion magnitude
    5. Adaptive Gaussian Density Surface Heatmap Generation
    """
    
    @staticmethod
    def preprocess_frame(frame: np.ndarray, target_size=(640, 640), apply_denoise: bool = False) -> np.ndarray:
        """
        DIP technique: Aspect-preserving letterbox / resizing & optional Gaussian filtering.
        """
        if apply_denoise:
            # Gaussian blur 3x3 to reduce CCTV sensor noise
            frame = cv2.GaussianBlur(frame, (3, 3), 0)
        return frame

    @staticmethod
    def compute_frame_difference(prev_gray: np.ndarray, curr_gray: np.ndarray, threshold: int = 25) -> tuple[float, np.ndarray]:
        """
        DIP technique: Temporal frame differencing to quantify baseline pixel motion.
        Returns:
            motion_ratio: fraction of pixels with motion (0.0 to 1.0)
            diff_mask: thresholded binary difference
        """
        if prev_gray is None or curr_gray is None:
            return 0.0, np.zeros_like(curr_gray if curr_gray is not None else np.zeros((10,10)))
        
        diff = cv2.absdiff(curr_gray, prev_gray)
        _, thresh = cv2.threshold(diff, threshold, 255, cv2.THRESH_BINARY)
        motion_ratio = float(np.count_nonzero(thresh)) / float(thresh.size)
        return motion_ratio, thresh

    @staticmethod
    def compute_optical_flow(prev_gray: np.ndarray, curr_gray: np.ndarray) -> tuple[float, np.ndarray, np.ndarray]:
        """
        DIP technique: Gunnar Farneback Dense Optical Flow.
        Calculates motion vector field [u, v] for crowd flow divergence/irregularity analysis.
        Returns:
            mean_magnitude: average flow speed across moving crowd pixels
            magnitude: 2D array of flow speeds
            angle: 2D array of flow angles in radians
        """
        if prev_gray is None or curr_gray is None:
            return 0.0, np.zeros((10, 10)), np.zeros((10, 10))
            
        flow = cv2.calcOpticalFlowFarneback(
            prev_gray, curr_gray, None,
            pyr_scale=0.5, levels=3, winsize=15,
            iterations=3, poly_n=5, poly_sigma=1.2, flags=0
        )
        
        mag, ang = cv2.cartToPolar(flow[..., 0], flow[..., 1])
        # Consider pixels with significant motion (> 1.0 px/frame)
        moving_mask = mag > 1.0
        mean_magnitude = float(np.mean(mag[moving_mask])) if np.any(moving_mask) else 0.0
        
        return mean_magnitude, mag, ang

    @staticmethod
    def generate_density_heatmap(
        frame_shape: tuple[int, int],
        detections: list[dict],
        kernel_size: int = 61,
        sigma: float = 15.0
    ) -> np.ndarray:
        """
        DIP technique: Spatial Continuous Density Estimation via 2D Gaussian Kernel splatting.
        Takes bounding box bottoms (feet position) or centers and projects Gaussian distributions.
        Returns a 3-channel BGR heatmap overlay.
        """
        h, w = frame_shape[:2]
        density_map = np.zeros((h, w), dtype=np.float32)
        
        if not detections:
            return np.zeros((h, w, 3), dtype=np.uint8)
            
        # Accumulate Gaussian kernel at each person's position
        half_k = kernel_size // 2
        # Generate 2D Gaussian kernel
        x = np.arange(-half_k, half_k + 1)
        y = np.arange(-half_k, half_k + 1)
        xx, yy = np.meshgrid(x, y)
        kernel = np.exp(-(xx**2 + yy**2) / (2 * sigma**2))
        kernel /= np.max(kernel)
        
        for det in detections:
            bbox = det.get("bbox", [])
            if len(bbox) != 4:
                continue
            x1, y1, x2, y2 = bbox
            # Center of bottom third (ground location of person)
            cx = int((x1 + x2) / 2)
            cy = int(y1 + (y2 - y1) * 0.8)
            
            # Bounds checking
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
                
        # Normalize to 0-255 for color mapping
        max_val = np.max(density_map)
        if max_val > 0:
            norm_density = np.clip((density_map / max(max_val, 3.0)) * 255, 0, 255).astype(np.uint8)
        else:
            norm_density = np.zeros((h, w), dtype=np.uint8)
            
        # Apply COLORMAP_JET or COLORMAP_TURBO for professional surveillance heatmap
        heatmap_colored = cv2.applyColorMap(norm_density, cv2.COLORMAP_JET)
        
        # Zero out areas with very low density so they don't tint blue
        mask = norm_density > 15
        heatmap_masked = np.zeros_like(heatmap_colored)
        heatmap_masked[mask] = heatmap_colored[mask]
        
        return heatmap_masked

    @staticmethod
    def blend_heatmap_on_frame(frame: np.ndarray, heatmap: np.ndarray, alpha: float = 0.5) -> np.ndarray:
        """
        DIP technique: Alpha blending weighted overlay: Output = Frame*(1-alpha) + Heatmap*alpha.
        """
        mask = cv2.cvtColor(heatmap, cv2.COLOR_BGR2GRAY) > 0
        output = frame.copy()
        output[mask] = cv2.addWeighted(frame[mask], 1.0 - alpha, heatmap[mask], alpha, 0)
        return output
