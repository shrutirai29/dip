import os
import math
import numpy as np
import cv2

def ensure_dir(d):
    os.makedirs(d, exist_ok=True)

def create_editorial_canvas(w=1920, h=1080):
    """
    Creates a deep, matte editorial slate canvas with a very subtle vertical gradient.
    Professional command center aesthetic without artificial neon glow.
    """
    img = np.zeros((h, w, 3), dtype=np.uint8)
    for y in range(h):
        factor = y / h
        # Deep obsidian graphite: top (18, 22, 28), bottom (11, 14, 18)
        b = int(26 - 9 * factor)
        g = int(20 - 7 * factor)
        r = int(16 - 5 * factor)
        img[y, :] = [b, g, r] # BGR
    return img

def add_clean_grid(img, spacing=96, line_col=(25, 31, 40)):
    """Subtle, barely visible structural grid for visual alignment."""
    h, w = img.shape[:2]
    for x in range(0, w, spacing):
        cv2.line(img, (x, 0), (x, h), line_col, 1)
    for y in range(0, h, spacing):
        cv2.line(img, (0, y), (w, y), line_col, 1)
    return img

def add_editorial_frame(img, category="CROWD SAFETY"):
    """
    A minimal, human-designed editorial framing element.
    Clean top brand mark with Red-Yellow-Green traffic light dots, and a subtle footer rule.
    """
    h, w = img.shape[:2]
    margin = 54

    # Top hairline rule
    cv2.line(img, (margin, margin), (w - margin, margin), (34, 42, 54), 1)

    # Traffic light 3-dot identity mark in top-left corner
    dot_y = margin - 14
    cv2.circle(img, (margin + 8, dot_y), 4, (129, 185, 16), -1)   # Green
    cv2.circle(img, (margin + 24, dot_y), 4, (11, 158, 245), -1)  # Yellow
    cv2.circle(img, (margin + 40, dot_y), 4, (68, 68, 239), -1)   # Red

    # Top right category label (clean, understated)
    cv2.putText(img, category.upper(), (w - margin - 220, dot_y + 4),
                cv2.FONT_HERSHEY_SIMPLEX, 0.38, (80, 96, 118), 1, cv2.LINE_AA)

    # Bottom hairline rule
    b_y = h - margin
    cv2.line(img, (margin, b_y), (w - margin, b_y), (30, 38, 48), 1)
    cv2.putText(img, "CROWDGUARD v2.0  |  CROWD RISK INTELLIGENCE & COMPUTER VISION", (margin, b_y + 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, (70, 84, 102), 1, cv2.LINE_AA)
    cv2.putText(img, "CONFIDENTIAL  ·  OPERATIONAL SAFETY BRIEFING", (w - margin - 320, b_y + 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, (70, 84, 102), 1, cv2.LINE_AA)

    return img

def add_subtle_vignette(img):
    """Soft edge darkening for focal depth."""
    h, w = img.shape[:2]
    Y, X = np.ogrid[:h, :w]
    cx, cy = w / 2, h / 2
    dist_sq = ((X - cx) / (w * 0.6)) ** 2 + ((Y - cy) / (h * 0.6)) ** 2
    mask = 1.0 - np.clip(dist_sq * 0.28, 0.0, 0.45)
    mask = np.stack([mask]*3, axis=-1)
    return (img * mask).astype(np.uint8)

# ==========================================
# 12 HUMAN-DESIGNED BACKGROUND GENERATORS
# ==========================================

def gen_bg_slide_1(out_path):
    # Slide 1: Hero Overview
    img = create_editorial_canvas()
    img = add_clean_grid(img, 96, (22, 28, 36))
    img = add_editorial_frame(img, "SYSTEM OVERVIEW")

    # Subtle optical flow vector traces across the lower right (representing pedestrian circulation)
    np.random.seed(42)
    for _ in range(60):
        sx = np.random.randint(900, 1800)
        sy = np.random.randint(620, 960)
        length = np.random.randint(18, 40)
        angle = np.random.normal(math.pi * 0.85, 0.2)
        ex = int(sx + length * math.cos(angle))
        ey = int(sy + length * math.sin(angle))
        cv2.line(img, (sx, sy), (ex, ey), (36, 46, 58), 1, cv2.LINE_AA)
        cv2.circle(img, (ex, ey), 1, (48, 62, 78), -1)

    img = add_subtle_vignette(img)
    cv2.imwrite(out_path, img)

def gen_bg_slide_2(out_path):
    # Slide 2: Problem Analysis
    img = create_editorial_canvas()
    img = add_clean_grid(img, 96, (22, 28, 36))
    img = add_editorial_frame(img, "PROBLEM CONTEXT")

    # Concentric density wave lines on right half (representing crowd shockwave propagation)
    cx, cy = 1450, 560
    for r in [90, 170, 260, 360, 470]:
        cv2.circle(img, (cx, cy), r, (28, 32, 42), 1, cv2.LINE_AA)

    img = add_subtle_vignette(img)
    cv2.imwrite(out_path, img)

def gen_bg_slide_3(out_path):
    # Slide 3: 3-Tier Safety Spectrum
    img = create_editorial_canvas()
    img = add_clean_grid(img, 96, (22, 28, 36))
    img = add_editorial_frame(img, "SAFETY ARCHITECTURE")

    # Clean vertical divider guides defining the 3 columns
    cv2.line(img, (670, 160), (670, 920), (28, 36, 46), 1)
    cv2.line(img, (1250, 160), (1250, 920), (28, 36, 46), 1)

    img = add_subtle_vignette(img)
    cv2.imwrite(out_path, img)

def gen_bg_slide_4(out_path):
    # Slide 4: YOLOv8 Vision
    img = create_editorial_canvas()
    img = add_clean_grid(img, 80, (22, 28, 36))
    img = add_editorial_frame(img, "COMPUTER VISION")

    # Subtle detection frame brackets in the background
    boxes = [
        (220, 300, 120, 260),
        (440, 380, 110, 220),
        (680, 280, 140, 290),
    ]
    for bx, by, bw, bh in boxes:
        cv2.rectangle(img, (bx, by), (bx + bw, by + bh), (26, 34, 44), 1)
        # Subtle centroid
        cv2.circle(img, (bx + bw//2, by + bh//2), 2, (38, 52, 68), -1)

    img = add_subtle_vignette(img)
    cv2.imwrite(out_path, img)

def gen_bg_slide_5(out_path):
    # Slide 5: Gunnar Farneback Optical Flow
    img = create_editorial_canvas()
    img = add_clean_grid(img, 80, (22, 28, 36))
    img = add_editorial_frame(img, "MOTION DYNAMICS")

    # Regular velocity vector field grid on right half
    for x in range(1050, 1750, 80):
        for y in range(260, 880, 80):
            # Coordinated flow vectors
            dx = int(22 * math.cos((x + y) * 0.003))
            dy = int(14 * math.sin((x - y) * 0.003))
            cv2.arrowedLine(img, (x, y), (x + dx, y + dy), (30, 40, 52), 1, tipLength=0.3)

    img = add_subtle_vignette(img)
    cv2.imwrite(out_path, img)

def gen_bg_slide_6(out_path):
    # Slide 6: Directional Shannon Entropy
    img = create_editorial_canvas()
    img = add_clean_grid(img, 96, (22, 28, 36))
    img = add_editorial_frame(img, "INFORMATION THEORY")

    # Clean polar 8-sector diagram etched into background
    cx, cy = 960, 540
    for r in [140, 260, 380]:
        cv2.circle(img, (cx, cy), r, (26, 34, 44), 1, cv2.LINE_AA)
    for angle_deg in range(0, 360, 45):
        rad = math.radians(angle_deg)
        ex = int(cx + 390 * math.cos(rad))
        ey = int(cy + 390 * math.sin(rad))
        cv2.line(img, (cx, cy), (ex, ey), (28, 36, 48), 1, cv2.LINE_AA)

    img = add_subtle_vignette(img)
    cv2.imwrite(out_path, img)

def gen_bg_slide_7(out_path):
    # Slide 7: 4-Factor Heuristic Risk Synthesis
    img = create_editorial_canvas()
    img = add_clean_grid(img, 96, (22, 28, 36))
    img = add_editorial_frame(img, "HEURISTIC RISK ENGINE")

    # Clean horizontal synthesis pipeline bus line
    cv2.line(img, (140, 335), (1780, 335), (32, 42, 54), 1)
    for cx in [295, 740, 1180, 1625]:
        cv2.circle(img, (cx, 335), 4, (45, 58, 76), -1)

    img = add_subtle_vignette(img)
    cv2.imwrite(out_path, img)

def gen_bg_slide_8(out_path):
    # Slide 8: 10-Second Predictive Forecasting
    img = create_editorial_canvas()
    img = add_clean_grid(img, 96, (22, 28, 36))
    img = add_editorial_frame(img, "PREDICTIVE HORIZON")

    # Time-series grid on right side
    cv2.line(img, (1100, 780), (1760, 780), (32, 42, 54), 1) # x-axis
    cv2.line(img, (1100, 340), (1100, 780), (32, 42, 54), 1) # y-axis
    for t_step in range(6):
        tx = 1100 + t_step * 130
        cv2.line(img, (tx, 775), (tx, 785), (32, 42, 54), 1)

    img = add_subtle_vignette(img)
    cv2.imwrite(out_path, img)

def gen_bg_slide_9(out_path):
    # Slide 9: 3x3 Spatial Quadrant Matrix
    img = create_editorial_canvas()
    img = add_clean_grid(img, 96, (22, 28, 36))
    img = add_editorial_frame(img, "SPATIAL REASONING")

    # Isometric ground plane grid on right side
    iso_cx, iso_cy = 1420, 560
    gs = 85
    for r in range(-2, 3):
        p1 = (iso_cx + int(r * gs * math.cos(math.pi/6) - 2 * gs * math.cos(math.pi/6)),
              iso_cy + int(r * gs * math.sin(math.pi/6) + 2 * gs * math.sin(math.pi/6)))
        p2 = (iso_cx + int(r * gs * math.cos(math.pi/6) + 2 * gs * math.cos(math.pi/6)),
              iso_cy + int(r * gs * math.sin(math.pi/6) - 2 * gs * math.sin(math.pi/6)))
        cv2.line(img, p1, p2, (30, 38, 50), 1, cv2.LINE_AA)

        p3 = (iso_cx + int(-2 * gs * math.cos(math.pi/6) + r * gs * math.cos(math.pi/6)),
              iso_cy + int(-2 * gs * math.sin(math.pi/6) - r * gs * math.sin(math.pi/6)))
        p4 = (iso_cx + int(2 * gs * math.cos(math.pi/6) + r * gs * math.cos(math.pi/6)),
              iso_cy + int(2 * gs * math.sin(math.pi/6) - r * gs * math.sin(math.pi/6)))
        cv2.line(img, p3, p4, (30, 38, 50), 1, cv2.LINE_AA)

    img = add_subtle_vignette(img)
    cv2.imwrite(out_path, img)

def gen_bg_slide_10(out_path):
    # Slide 10: Multi-Camera Network
    img = create_editorial_canvas()
    img = add_clean_grid(img, 96, (22, 28, 36))
    img = add_editorial_frame(img, "NVR FLEET ARCHITECTURE")
    img = add_subtle_vignette(img)
    cv2.imwrite(out_path, img)

def gen_bg_slide_11(out_path):
    # Slide 11: Real-World Deployments
    img = create_editorial_canvas()
    img = add_clean_grid(img, 96, (22, 28, 36))
    img = add_editorial_frame(img, "OPERATIONAL DEPLOYMENT")

    # 4 column dividers
    for cx in [520, 960, 1400]:
        cv2.line(img, (cx, 160), (cx, 920), (28, 36, 46), 1)

    img = add_subtle_vignette(img)
    cv2.imwrite(out_path, img)

def gen_bg_slide_12(out_path):
    # Slide 12: Executive Conclusion
    img = create_editorial_canvas()
    img = add_clean_grid(img, 96, (22, 28, 36))
    img = add_editorial_frame(img, "EXECUTIVE SUMMARY")

    # Very subtle watermark shield outline in center
    cx, cy = 960, 520
    shield_pts = np.array([
        [cx, cy - 200],
        [cx + 170, cy - 120],
        [cx + 140, cy + 90],
        [cx, cy + 200],
        [cx - 140, cy + 90],
        [cx - 170, cy - 120]
    ], np.int32)
    cv2.polylines(img, [shield_pts], True, (26, 34, 46), 1, cv2.LINE_AA)

    img = add_subtle_vignette(img)
    cv2.imwrite(out_path, img)

def generate_all_backgrounds(output_dir="d:/projects/dip/backend/assets/ppt_backgrounds"):
    ensure_dir(output_dir)
    print(f"Generating editorial human-crafted backgrounds into {output_dir}...")
    
    generators = [
        ("slide_1.png", gen_bg_slide_1),
        ("slide_2.png", gen_bg_slide_2),
        ("slide_3.png", gen_bg_slide_3),
        ("slide_4.png", gen_bg_slide_4),
        ("slide_5.png", gen_bg_slide_5),
        ("slide_6.png", gen_bg_slide_6),
        ("slide_7.png", gen_bg_slide_7),
        ("slide_8.png", gen_bg_slide_8),
        ("slide_9.png", gen_bg_slide_9),
        ("slide_10.png", gen_bg_slide_10),
        ("slide_11.png", gen_bg_slide_11),
        ("slide_12.png", gen_bg_slide_12),
    ]
    
    for filename, fn in generators:
        path = os.path.join(output_dir, filename)
        fn(path)
        print(f"  [✓] Generated {filename}")
        
    print("All 12 editorial backgrounds generated successfully!")

if __name__ == "__main__":
    generate_all_backgrounds()
