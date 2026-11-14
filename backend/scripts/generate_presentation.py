import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

def create_deck():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    # Color Palette
    C_BG = RGBColor(11, 17, 32)         # #0B1120 Deep Night Slate
    C_CARD = RGBColor(19, 29, 53)       # #131D35 Tactical Container
    C_CARD_BORDER = RGBColor(37, 52, 86) # #253456
    C_ACCENT = RGBColor(56, 189, 248)   # #38BDF8 Electric Sky Cyan
    C_GREEN = RGBColor(52, 211, 153)    # #34D399 Emerald Green
    C_AMBER = RGBColor(251, 191, 36)    # #FBBF24 Warning Amber
    C_RED = RGBColor(248, 113, 113)     # #F87171 Alert Coral
    C_TEXT_WHITE = RGBColor(248, 250, 252) # #F8FAFC Pure Title
    C_TEXT_MUTED = RGBColor(148, 163, 184) # #94A3B8 Slate Muted
    C_TEXT_DIM = RGBColor(100, 116, 139)   # #64748B Subtitle

    blank_layout = prs.slide_layouts[6]

    def set_slide_background(slide):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
        bg.fill.solid()
        bg.fill.fore_color.rgb = C_BG
        bg.line.fill.background()
        return bg

    def add_header(slide, category: str, title: str):
        tb = slide.shapes.add_textbox(Inches(0.8), Inches(0.5), Inches(11.7), Inches(1.1))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
        
        p0 = tf.paragraphs[0]
        p0.text = category.upper()
        p0.font.size = Pt(10)
        p0.font.bold = True
        p0.font.color.rgb = C_ACCENT
        p0.font.name = "Segoe UI"
        
        p1 = tf.add_paragraph()
        p1.text = title
        p1.font.size = Pt(22)
        p1.font.bold = True
        p1.font.color.rgb = C_TEXT_WHITE
        p1.font.name = "Segoe UI"

    def add_card(slide, left, top, width, height, title="", border_color=C_CARD_BORDER, bg_color=C_CARD):
        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
        card.fill.solid()
        card.fill.fore_color.rgb = bg_color
        card.line.color.rgb = border_color
        card.line.width = Pt(1.2)
        
        if title:
            tb = slide.shapes.add_textbox(left + Inches(0.25), top + Inches(0.2), width - Inches(0.5), Inches(0.45))
            tf = tb.text_frame
            tf.word_wrap = True
            tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
            p = tf.paragraphs[0]
            p.text = title
            p.font.size = Pt(14)
            p.font.bold = True
            p.font.color.rgb = C_ACCENT
            p.font.name = "Segoe UI"
        return card

    # ==========================================
    # SLIDE 1: TITLE SLIDE
    # ==========================================
    s1 = prs.slides.add_slide(blank_layout)
    set_slide_background(s1)

    # Decorative accent bar
    top_bar = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(1.2), Inches(1.8), Inches(0.08))
    top_bar.fill.solid()
    top_bar.fill.fore_color.rgb = C_ACCENT
    top_bar.line.fill.background()

    tb = s1.shapes.add_textbox(Inches(0.8), Inches(1.5), Inches(11.7), Inches(3.2))
    tf = tb.text_frame
    tf.word_wrap = True
    
    p = tf.paragraphs[0]
    p.text = "CROWDGUARD v2.0"
    p.font.size = Pt(44)
    p.font.bold = True
    p.font.color.rgb = C_TEXT_WHITE
    p.font.name = "Segoe UI"
    
    p2 = tf.add_paragraph()
    p2.text = "Digital Image Processing (DIP) Crowd Monitoring & Disaster Risk Assessment System"
    p2.font.size = Pt(20)
    p2.font.bold = True
    p2.font.color.rgb = C_ACCENT
    p2.font.name = "Segoe UI"
    p2.space_before = Pt(10)

    p3 = tf.add_paragraph()
    p3.text = "An explainable computer vision command platform combining Gunnar Farneback dense optical flow, directional Shannon entropy, perspective-aware Gaussian density splatting, and multivariate short-term risk forecasting."
    p3.font.size = Pt(13)
    p3.font.color.rgb = C_TEXT_MUTED
    p3.font.name = "Segoe UI"
    p3.space_before = Pt(14)

    # 4 Tech Pills at bottom
    pills = [
        ("YOLOv8 Detection", "Class 0 Person Core", C_ACCENT),
        ("Farneback Optical Flow", "Dense Motion Vectors", C_GREEN),
        ("Shannon Entropy", "Turbulence & Chaos", C_AMBER),
        ("Three.js 3D Spatial", "Tactical Heightmap HUD", C_RED),
    ]
    pill_w = Inches(2.7)
    for i, (title_p, sub_p, col) in enumerate(pills):
        px = Inches(0.8) + i * Inches(2.95)
        py = Inches(5.3)
        add_card(s1, px, py, pill_w, Inches(1.4), border_color=col)
        tb_p = s1.shapes.add_textbox(px + Inches(0.2), py + Inches(0.25), pill_w - Inches(0.4), Inches(0.9))
        tf_p = tb_p.text_frame
        tf_p.word_wrap = True
        p_t = tf_p.paragraphs[0]
        p_t.text = title_p
        p_t.font.size = Pt(13)
        p_t.font.bold = True
        p_t.font.color.rgb = C_TEXT_WHITE
        p_t.font.name = "Segoe UI"
        
        p_s = tf_p.add_paragraph()
        p_s.text = sub_p
        p_s.font.size = Pt(11)
        p_s.font.color.rgb = col
        p_s.font.name = "Segoe UI"

    # ==========================================
    # SLIDE 2: PROBLEM STATEMENT & MOTIVATION
    # ==========================================
    s2 = prs.slides.add_slide(blank_layout)
    set_slide_background(s2)
    add_header(s2, "Context & Challenge", "The Anatomy of Crowd Disasters & Surveillance Gaps")

    cards_data = [
        ("Traditional CCTV Limitations", [
            ("Human Fatigue & Delayed Reaction:", "Operators monitoring 10+ camera feeds miss micro-turbulences that precede stampedes."),
            ("Passive vs. Proactive:", "Historical video archives are forensic; human operators rarely get actionable 10-second predictive warnings."),
            ("Static Camera Perspective Blindness:", "Distant crowds appear small and dense, triggering false density alerts without geometric compensation.")
        ], C_AMBER),
        ("Physical Hazards in Dense Crowds", [
            ("Progressive Crowd Collapse:", "Density crossing 4-6 persons/m2 causes uncontrollable shockwaves transmitted across bodies."),
            ("Turbulent Flow Anomaly:", "Bi-directional counterflow and sudden directional reversals create shear pressures."),
            ("Geometric Chokepoints:", "Corridors, turnstiles, and narrow exit gates funnel crowds into critical bottleneck states.")
        ], C_RED),
        ("The CROWDGUARD Solution", [
            ("Explainable Metric Fusion:", "Heuristic 0-100 hazard scoring based on physics and mathematics, not black-box neural magic."),
            ("Directional Shannon Entropy:", "Quantifies crowd disorder mathematically before physical crushing commences."),
            ("Tactical Early Warnings:", "+5s, +10s, +15s trend forecasts give dispatchers time to open egress bypasses.")
        ], C_GREEN)
    ]

    card_w = Inches(3.7)
    for i, (title, items, accent) in enumerate(cards_data):
        cx = Inches(0.8) + i * Inches(3.95)
        cy = Inches(1.8)
        add_card(s2, cx, cy, card_w, Inches(5.0), title=title, border_color=accent)
        tb_c = s2.shapes.add_textbox(cx + Inches(0.25), cy + Inches(0.75), card_w - Inches(0.5), Inches(4.0))
        tf_c = tb_c.text_frame
        tf_c.word_wrap = True
        for j, (h, b) in enumerate(items):
            p = tf_c.paragraphs[0] if j == 0 else tf_c.add_paragraph()
            p.text = f"• {h} "
            p.font.size = Pt(11.5)
            p.font.bold = True
            p.font.color.rgb = C_TEXT_WHITE
            p.font.name = "Segoe UI"
            if j > 0:
                p.space_before = Pt(12)
            
            run = p.add_run()
            run.text = b
            run.font.bold = False
            run.font.color.rgb = C_TEXT_MUTED

    # ==========================================
    # SLIDE 3: SYSTEM ARCHITECTURE & PIPELINE
    # ==========================================
    s3 = prs.slides.add_slide(blank_layout)
    set_slide_background(s3)
    add_header(s3, "Engineering Architecture", "Multi-Stage Vision & DIP Processing Pipeline")

    stages = [
        ("01. INGESTION", "RTSP / Webcam / File", "• RTSP backoff & reconnect\n• Threaded non-blocking capture\n• 25 FPS stride downsampling", C_ACCENT),
        ("02. DIP FILTERING", "Denoise & Difference", "• Edge-preserving bilateral filter\n• Temporal difference opened\n• Illumination-invariant motion", C_GREEN),
        ("03. PERCEPTION", "YOLOv8 + Optical Flow", "• Class 0 (Person) detection\n• Farneback (u,v) vector field\n• Persistent IoU centroid tracking", C_ACCENT),
        ("04. ANALYTICS", "Entropy & Density", "• Directional Shannon entropy\n• 2D Gaussian density splat\n• Perspective Y-normalization", C_AMBER),
        ("05. RISK & HUD", "Scoring & 3D Spatial", "• 0-100 composite risk & EMA\n• +5s, +10s, +15s extrapolation\n• Three.js 3x3 tactical grid", C_RED),
    ]

    st_w = Inches(2.2)
    for i, (num, name, body, acc) in enumerate(stages):
        sx = Inches(0.8) + i * Inches(2.4)
        sy = Inches(2.0)
        add_card(s3, sx, sy, st_w, Inches(4.8), border_color=acc)
        tb_s = s3.shapes.add_textbox(sx + Inches(0.18), sy + Inches(0.25), st_w - Inches(0.36), Inches(4.3))
        tf_s = tb_s.text_frame
        tf_s.word_wrap = True
        
        p0 = tf_s.paragraphs[0]
        p0.text = num
        p0.font.size = Pt(11)
        p0.font.bold = True
        p0.font.color.rgb = acc
        p0.font.name = "Segoe UI"
        
        p1 = tf_s.add_paragraph()
        p1.text = name
        p1.font.size = Pt(14)
        p1.font.bold = True
        p1.font.color.rgb = C_TEXT_WHITE
        p1.font.name = "Segoe UI"
        p1.space_before = Pt(4)

        p2 = tf_s.add_paragraph()
        p2.text = body
        p2.font.size = Pt(11)
        p2.font.color.rgb = C_TEXT_MUTED
        p2.font.name = "Segoe UI"
        p2.space_before = Pt(14)

    # ==========================================
    # SLIDE 4: DIP MATHEMATICAL FORMULATION
    # ==========================================
    s4 = prs.slides.add_slide(blank_layout)
    set_slide_background(s4)
    add_header(s4, "Digital Image Processing Core", "Mathematical Foundations: Optical Flow & Shannon Entropy")

    # Left Card: Gunnar Farneback
    add_card(s4, Inches(0.8), Inches(1.8), Inches(5.7), Inches(5.0), title="1. Gunnar Farneback Dense Optical Flow", border_color=C_ACCENT)
    tb_l = s4.shapes.add_textbox(Inches(1.05), Inches(2.55), Inches(5.2), Inches(4.0))
    tf_l = tb_l.text_frame
    tf_l.word_wrap = True

    pts_l = [
        ("Polynomial Expansion Model:", "Approximates local neighborhoods using quadratic polynomials:"),
        ("Equation:", "f1(x) ~ x^T A1 x + b1^T x + c1\nf2(x) = f1(x - d)"),
        ("Displacement Velocity Field:", "Yields dense displacement vector field d = (u, v) for every moving pixel."),
        ("Magnitude & Directional Angle:", "|v| = sqrt(u^2 + v^2),  theta = atan2(v, u) in [0, 2pi)"),
        ("Operational Benefit:", "Enables granular velocity calculation without relying solely on bounding box displacement.")
    ]
    for j, (h, b) in enumerate(pts_l):
        p = tf_l.paragraphs[0] if j == 0 else tf_l.add_paragraph()
        p.text = f"• {h} "
        p.font.size = Pt(11.5)
        p.font.bold = True
        p.font.color.rgb = C_TEXT_WHITE
        p.font.name = "Segoe UI"
        if j > 0:
            p.space_before = Pt(8)
        run = p.add_run()
        run.text = b
        run.font.bold = False
        run.font.color.rgb = C_TEXT_MUTED

    # Right Card: Directional Shannon Entropy
    add_card(s4, Inches(6.8), Inches(1.8), Inches(5.7), Inches(5.0), title="2. Directional Shannon Entropy (Disorder Metric)", border_color=C_AMBER)
    tb_r = s4.shapes.add_textbox(Inches(7.05), Inches(2.55), Inches(5.2), Inches(4.0))
    tf_r = tb_r.text_frame
    tf_r.word_wrap = True

    pts_r = [
        ("Angular Binning:", "Vectors with speed > 0.8 px are binned into 8 discrete sectors (45 deg each)."),
        ("Probability Mass Function:", "p_i = count(theta in sector_i) / Total Moving Vectors"),
        ("Shannon Entropy Formulation:", "H = - sum_{i=1..8} [ p_i * log2(p_i + eps) ]\nH_norm = H / log2(8)  in  [0.0, 1.0]"),
        ("Laminar Flow (H_norm < 0.35):", "Coordinated, uniform movement in exit corridors."),
        ("Turbulent Disorder (H_norm > 0.68):", "Chaotic, multi-directional vectors signaling panic, cross-flow, or crush hazard.")
    ]
    for j, (h, b) in enumerate(pts_r):
        p = tf_r.paragraphs[0] if j == 0 else tf_r.add_paragraph()
        p.text = f"• {h} "
        p.font.size = Pt(11.5)
        p.font.bold = True
        p.font.color.rgb = C_TEXT_WHITE
        p.font.name = "Segoe UI"
        if j > 0:
            p.space_before = Pt(8)
        run = p.add_run()
        run.text = b
        run.font.bold = False
        run.font.color.rgb = C_TEXT_MUTED

    # ==========================================
    # SLIDE 5: DENSITY SPLATTING & PERSPECTIVE
    # ==========================================
    s5 = prs.slides.add_slide(blank_layout)
    set_slide_background(s5)
    add_header(s5, "Continuous Spatial Modeling", "Perspective-Aware 2D Gaussian Density Splatting")

    add_card(s5, Inches(0.8), Inches(1.8), Inches(5.7), Inches(5.0), title="Perspective Normalization (Y-Axis)", border_color=C_GREEN)
    tb_s5a = s5.shapes.add_textbox(Inches(1.05), Inches(2.55), Inches(5.2), Inches(4.0))
    tf_s5a = tb_s5a.text_frame
    tf_s5a.word_wrap = True

    pts_s5a = [
        ("The Monocular Camera Dilemma:", "Objects high in the camera frame (near horizon) appear smaller and more clustered than foreground objects."),
        ("Adaptive Vertical Scaling:", "Dynamic scaling factor calculated per detected person:"),
        ("Equation:", "scale(y) = FarScale - (y / H) * (FarScale - NearScale)\nFarScale = 1.8, NearScale = 0.8"),
        ("Physical Meaning:", "Distant individuals contribute higher normalized density weight, counteracting perspective foreshortening."),
        ("Ground Foot Placement:", "Centroid evaluated at (x_center, y_bottom) to anchor density directly to floor coordinates.")
    ]
    for j, (h, b) in enumerate(pts_s5a):
        p = tf_s5a.paragraphs[0] if j == 0 else tf_s5a.add_paragraph()
        p.text = f"• {h} "
        p.font.size = Pt(11.5)
        p.font.bold = True
        p.font.color.rgb = C_TEXT_WHITE
        p.font.name = "Segoe UI"
        if j > 0:
            p.space_before = Pt(8)
        run = p.add_run()
        run.text = b
        run.font.bold = False
        run.font.color.rgb = C_TEXT_MUTED

    add_card(s5, Inches(6.8), Inches(1.8), Inches(5.7), Inches(5.0), title="Continuous Gaussian Kernel Splatting", border_color=C_ACCENT)
    tb_s5b = s5.shapes.add_textbox(Inches(7.05), Inches(2.55), Inches(5.2), Inches(4.0))
    tf_s5b = tb_s5b.text_frame
    tf_s5b.word_wrap = True

    pts_s5b = [
        ("Cached Splat Kernels:", "61x61 precomputed Gaussian kernel matrix G(x, y; sigma) stored in LRU memory cache."),
        ("Sub-Pixel Accumulation:", "Every verified detection adds a continuous Gaussian surface contribution to an accumulator matrix."),
        ("Boundary Truncation Resilience:", "Splatting handles persons entering or leaving edge boundaries without kernel clipping artifacts."),
        ("Colormap Blending:", "Maps continuous float density [0.0, 1.0] to OpenCV JET/VIRIDIS colormap with alpha compositing over original RGB."),
        ("Tactical Heatmap Overlay:", "Provides instant operator visual identification of choke spots.")
    ]
    for j, (h, b) in enumerate(pts_s5b):
        p = tf_s5b.paragraphs[0] if j == 0 else tf_s5b.add_paragraph()
        p.text = f"• {h} "
        p.font.size = Pt(11.5)
        p.font.bold = True
        p.font.color.rgb = C_TEXT_WHITE
        p.font.name = "Segoe UI"
        if j > 0:
            p.space_before = Pt(8)
        run = p.add_run()
        run.text = b
        run.font.bold = False
        run.font.color.rgb = C_TEXT_MUTED

    # ==========================================
    # SLIDE 6: EXPLAINABLE HEURISTIC RISK ENGINE
    # ==========================================
    s6 = prs.slides.add_slide(blank_layout)
    set_slide_background(s6)
    add_header(s6, "Decision Intelligence", "Transparent 0–100 Composite Heuristic Risk Engine")

    # 4 Factor Cards across the top
    factors = [
        ("Crowd Density Pressure", "35% Weight", "Normalized spatial occupancy against baseline scene capacity.", C_RED),
        ("Surge Inflow Rate", "20% Weight", "Rate of crowd arrival (dCount/dt) over trailing 15-frame window.", C_AMBER),
        ("Flow Irregularity / Disorder", "25% Weight", "Derived from Directional Shannon Entropy & spatial velocity variance.", C_ACCENT),
        ("Localized Grid Congestion", "20% Weight", "Concentration of crowd mass inside 3x3 tactical grid choke zones.", C_GREEN),
    ]

    for i, (title_f, wt, desc_f, col_f) in enumerate(factors):
        fx = Inches(0.8) + i * Inches(2.95)
        fy = Inches(1.8)
        add_card(s6, fx, fy, Inches(2.7), Inches(2.3), border_color=col_f)
        tb_f = s6.shapes.add_textbox(fx + Inches(0.2), fy + Inches(0.2), Inches(2.3), Inches(1.9))
        tf_f = tb_f.text_frame
        tf_f.word_wrap = True
        
        p0 = tf_f.paragraphs[0]
        p0.text = title_f
        p0.font.size = Pt(13)
        p0.font.bold = True
        p0.font.color.rgb = C_TEXT_WHITE
        p0.font.name = "Segoe UI"
        
        p1 = tf_f.add_paragraph()
        p1.text = wt
        p1.font.size = Pt(12)
        p1.font.bold = True
        p1.font.color.rgb = col_f
        p1.font.name = "Segoe UI"
        p1.space_before = Pt(4)
        
        p2 = tf_f.add_paragraph()
        p2.text = desc_f
        p2.font.size = Pt(10)
        p2.font.color.rgb = C_TEXT_MUTED
        p2.font.name = "Segoe UI"
        p2.space_before = Pt(6)

    # Bottom Formula Card
    add_card(s6, Inches(0.8), Inches(4.35), Inches(11.733), Inches(2.45), title="Mathematical Formulation & EMA Temporal Smoothing", border_color=C_ACCENT)
    tb_form = s6.shapes.add_textbox(Inches(1.05), Inches(4.95), Inches(11.2), Inches(1.7))
    tf_form = tb_form.text_frame
    tf_form.word_wrap = True
    
    p_eq = tf_form.paragraphs[0]
    p_eq.text = "Risk_raw = 100 * [ 0.35 * C_density + 0.20 * C_surge + 0.25 * C_anomaly + 0.20 * C_congestion ]"
    p_eq.font.size = Pt(15)
    p_eq.font.bold = True
    p_eq.font.color.rgb = C_TEXT_WHITE
    p_eq.font.name = "Consolas"
    
    p_ema = tf_form.add_paragraph()
    p_ema.text = "Risk_smoothed(t) = alpha * Risk_raw(t) + (1 - alpha) * Risk_smoothed(t - 1)    [alpha = 0.30]"
    p_ema.font.size = Pt(13)
    p_ema.font.bold = True
    p_ema.font.color.rgb = C_AMBER
    p_ema.font.name = "Consolas"
    p_ema.space_before = Pt(6)

    p_desc = tf_form.add_paragraph()
    p_desc.text = "Bands: 0-25 Low (Normal Flow) | 26-50 Moderate (Elevated Inflow) | 51-75 High (Congestion Warning) | 76-100 Critical (Imminent Crush Risk)"
    p_desc.font.size = Pt(11)
    p_desc.font.color.rgb = C_TEXT_MUTED
    p_desc.font.name = "Segoe UI"
    p_desc.space_before = Pt(8)

    # ==========================================
    # SLIDE 7: SHORT-TERM PREDICTIVE FORECASTING
    # ==========================================
    s7 = prs.slides.add_slide(blank_layout)
    set_slide_background(s7)
    add_header(s7, "Predictive Disaster Prevention", "Short-Term Trend Forecasting (+5s, +10s, +15s)")

    fore_cards = [
        ("+5 Seconds Ahead", "Tactical Pre-Alert", "Detects acceleration in arrival corridors before crowds meet physical barriers.\n\nOperator Advisory: Prime secondary egress gates and alert corridor marshals.", C_ACCENT),
        ("+10 Seconds Ahead", "Flow Intervention Window", "Extrapolates density growth using velocity vectors & linear-quadratic fitting.\n\nOperator Advisory: Initiate turnstile metering to throttle ingress flow.", C_AMBER),
        ("+15 Seconds Ahead", "Evacuation Decision Gate", "Projects spatial grid capacity exhaustion if surge velocity is maintained.\n\nOperator Advisory: Dispatch automated crowd dispersion announcements.", C_RED)
    ]

    for i, (f_title, f_sub, f_text, f_col) in enumerate(fore_cards):
        fx = Inches(0.8) + i * Inches(3.95)
        fy = Inches(1.8)
        add_card(s7, fx, fy, Inches(3.7), Inches(5.0), title=f_title, border_color=f_col)
        tb_fc = s7.shapes.add_textbox(fx + Inches(0.25), fy + Inches(0.75), Inches(3.2), Inches(4.0))
        tf_fc = tb_fc.text_frame
        tf_fc.word_wrap = True
        
        p0 = tf_fc.paragraphs[0]
        p0.text = f_sub
        p0.font.size = Pt(13)
        p0.font.bold = True
        p0.font.color.rgb = f_col
        p0.font.name = "Segoe UI"
        
        p1 = tf_fc.add_paragraph()
        p1.text = f_text
        p1.font.size = Pt(12)
        p1.font.color.rgb = C_TEXT_MUTED
        p1.font.name = "Segoe UI"
        p1.space_before = Pt(14)

    # ==========================================
    # SLIDE 8: 3D SPATIAL INTELLIGENCE & HUD
    # ==========================================
    s8 = prs.slides.add_slide(blank_layout)
    set_slide_background(s8)
    add_header(s8, "Command Center Visualization", "Interactive 3D Spatial Intelligence & 3x3 Tactical Grid")

    add_card(s8, Inches(0.8), Inches(1.8), Inches(5.7), Inches(5.0), title="3x3 Spatial Tactical Grid (Zones A1–C3)", border_color=C_ACCENT)
    tb_s8a = s8.shapes.add_textbox(Inches(1.05), Inches(2.55), Inches(5.2), Inches(4.0))
    tf_s8a = tb_s8a.text_frame
    tf_s8a.word_wrap = True

    pts_s8a = [
        ("Zonal Decomposition:", "The surveillance viewport is partitioned into 9 tactical quadrants (A1 to C3)."),
        ("Independent Inflow / Outflow Metrics:", "Tracks individual crossings across cell boundaries to quantify net accumulation rates."),
        ("Zone Level Classification:", "Each quadrant calculates localized density, average velocity, and hazard state (Normal, Warning, Hazard, Choke)."),
        ("Choke Point Identification:", "Immediately flags which specific zone (e.g., B2 Central Hub or C3 Exit Gate) is causing flow stagnation.")
    ]
    for j, (h, b) in enumerate(pts_s8a):
        p = tf_s8a.paragraphs[0] if j == 0 else tf_s8a.add_paragraph()
        p.text = f"• {h} "
        p.font.size = Pt(11.5)
        p.font.bold = True
        p.font.color.rgb = C_TEXT_WHITE
        p.font.name = "Segoe UI"
        if j > 0:
            p.space_before = Pt(10)
        run = p.add_run()
        run.text = b
        run.font.bold = False
        run.font.color.rgb = C_TEXT_MUTED

    add_card(s8, Inches(6.8), Inches(1.8), Inches(5.7), Inches(5.0), title="Three.js 3D Topological Heightmap Centerpiece", border_color=C_GREEN)
    tb_s8b = s8.shapes.add_textbox(Inches(7.05), Inches(2.55), Inches(5.2), Inches(4.0))
    tf_s8b = tb_s8b.text_frame
    tf_s8b.word_wrap = True

    pts_s8b = [
        ("Real-Time 3D Mesh Elevation:", "Three.js WebGL canvas raises 3D terrain height proportionally to localized crowd risk and density."),
        ("Dynamic Tactical Lighting:", "Critical choke zones pulse with crimson ambient point lights, drawing operator focus instantly."),
        ("Multi-View Orbit Controls:", "Operators can rotate, pan, and tilt perspective to inspect crowd gradients from orthographic or isometric angles."),
        ("Interactive Zone Inspection:", "Clicking any 3D quadrant brings up focused historical telemetry, track counts, and velocity vectors.")
    ]
    for j, (h, b) in enumerate(pts_s8b):
        p = tf_s8b.paragraphs[0] if j == 0 else tf_s8b.add_paragraph()
        p.text = f"• {h} "
        p.font.size = Pt(11.5)
        p.font.bold = True
        p.font.color.rgb = C_TEXT_WHITE
        p.font.name = "Segoe UI"
        if j > 0:
            p.space_before = Pt(10)
        run = p.add_run()
        run.text = b
        run.font.bold = False
        run.font.color.rgb = C_TEXT_MUTED

    # ==========================================
    # SLIDE 9: PRIVACY, ETHICS & OPERATIONAL INTEGRITY
    # ==========================================
    s9 = prs.slides.add_slide(blank_layout)
    set_slide_background(s9)
    add_header(s9, "Governance & Ethics", "Privacy-Preserving Vision & Operational Safety")

    eth_cards = [
        ("Zero Biometric Profiling", "Anonymized Footwear Points", "• No facial recognition, re-identification databases, or demographic classification.\n• Only physical bounding boxes, centroid coordinates, and ground foot-points are extracted.\n• Compliant with GDPR and international privacy statutes.", C_GREEN),
        ("Dual-Mode Privacy Masking", "Bilateral Blur & Silhouette", "• Edge-preserving bilateral face blurring applied automatically on processed streams.\n• Full silhouette anonymization mode converts tracked persons into solid geometric silhouettes.\n• Protects civilian identity during forensic audit export.", C_ACCENT),
        ("Forensic Audit & Accountability", "Tamper-Evident CSV Export", "• Every analysis session exports timestamped per-frame metrics, telemetry, and incident logs.\n• Complete audit trail for post-event crowd safety reviews and event management audits.\n• Local SQLite storage ensures zero third-party cloud data exposure.", C_AMBER)
    ]

    for i, (e_title, e_sub, e_text, e_col) in enumerate(eth_cards):
        ex = Inches(0.8) + i * Inches(3.95)
        ey = Inches(1.8)
        add_card(s9, ex, ey, Inches(3.7), Inches(5.0), title=e_title, border_color=e_col)
        tb_ec = s9.shapes.add_textbox(ex + Inches(0.25), ey + Inches(0.75), Inches(3.2), Inches(4.0))
        tf_ec = tb_ec.text_frame
        tf_ec.word_wrap = True
        
        p0 = tf_ec.paragraphs[0]
        p0.text = e_sub
        p0.font.size = Pt(12)
        p0.font.bold = True
        p0.font.color.rgb = e_col
        p0.font.name = "Segoe UI"
        
        p1 = tf_ec.add_paragraph()
        p1.text = e_text
        p1.font.size = Pt(11)
        p1.font.color.rgb = C_TEXT_MUTED
        p1.font.name = "Segoe UI"
        p1.space_before = Pt(12)

    # ==========================================
    # SLIDE 10: BENCHMARKS & EXPERIMENTAL RESULTS
    # ==========================================
    s10 = prs.slides.add_slide(blank_layout)
    set_slide_background(s10)
    add_header(s10, "Empirical Validation", "Performance Benchmarks & Quality Verification")

    metrics = [
        ("25+ FPS", "Real-Time Throughput", "Achieved on standard multi-core CPU with frame stride & LRU kernel caching.", C_GREEN),
        ("22 / 22", "Test Gates Passed", "100% test pass rate across unit, integration, and API benchmark suites.", C_ACCENT),
        ("< 120 ms", "Pipeline Latency", "End-to-end processing latency from RTSP arrival to 3D HUD rendering.", C_AMBER),
        ("0.84 IoU", "Tracker Association", "Robust track persistence during dense occlusion and rapid cross-flow.", C_GREEN),
    ]

    for i, (val, label, subtext, col_m) in enumerate(metrics):
        mx = Inches(0.8) + i * Inches(2.95)
        my = Inches(1.8)
        add_card(s10, mx, my, Inches(2.7), Inches(2.2), border_color=col_m)
        tb_m = s10.shapes.add_textbox(mx + Inches(0.2), my + Inches(0.2), Inches(2.3), Inches(1.8))
        tf_m = tb_m.text_frame
        tf_m.word_wrap = True
        
        p0 = tf_m.paragraphs[0]
        p0.text = val
        p0.font.size = Pt(28)
        p0.font.bold = True
        p0.font.color.rgb = col_m
        p0.font.name = "Segoe UI"
        
        p1 = tf_m.add_paragraph()
        p1.text = label
        p1.font.size = Pt(12)
        p1.font.bold = True
        p1.font.color.rgb = C_TEXT_WHITE
        p1.font.name = "Segoe UI"
        p1.space_before = Pt(4)
        
        p2 = tf_m.add_paragraph()
        p2.text = subtext
        p2.font.size = Pt(9.5)
        p2.font.color.rgb = C_TEXT_MUTED
        p2.font.name = "Segoe UI"
        p2.space_before = Pt(4)

    # Bottom Benchmarks Detail Card
    add_card(s10, Inches(0.8), Inches(4.25), Inches(11.733), Inches(2.55), title="Synthetic Scenario Stress-Testing Verification", border_color=C_CARD_BORDER)
    tb_bt = s10.shapes.add_textbox(Inches(1.05), Inches(4.85), Inches(11.2), Inches(1.8))
    tf_bt = tb_bt.text_frame
    tf_bt.word_wrap = True

    b_pts = [
        ("Corridor Influx Benchmark:", "Validated controlled laminar flow transition into high-density corridor queueing."),
        ("Bi-Directional Counterflow Demo:", "Demonstrated immediate entropy spike (H_norm > 0.72) upon collision of opposing streams."),
        ("Sudden Panic Surge Simulation:", "Verified short-term forecast engine triggering critical alert 12 seconds prior to simulated barrier impact."),
        ("Multi-Stream Concurrency:", "Stress-tested 4 concurrent simulated camera feeds with zero frame buffer overflow.")
    ]
    for j, (h, b) in enumerate(b_pts):
        p = tf_bt.paragraphs[0] if j == 0 else tf_bt.add_paragraph()
        p.text = f"• {h} "
        p.font.size = Pt(11.5)
        p.font.bold = True
        p.font.color.rgb = C_TEXT_WHITE
        p.font.name = "Segoe UI"
        if j > 0:
            p.space_before = Pt(6)
        run = p.add_run()
        run.text = b
        run.font.bold = False
        run.font.color.rgb = C_TEXT_MUTED

    # ==========================================
    # SLIDE 11: CONCLUSION & FUTURE WORK
    # ==========================================
    s11 = prs.slides.add_slide(blank_layout)
    set_slide_background(s11)
    add_header(s11, "Summary & Roadmap", "Key Contributions & Future Research Horizons")

    add_card(s11, Inches(0.8), Inches(1.8), Inches(5.7), Inches(5.0), title="Key Project Contributions", border_color=C_GREEN)
    tb_s11a = s11.shapes.add_textbox(Inches(1.05), Inches(2.55), Inches(5.2), Inches(4.0))
    tf_s11a = tb_s11a.text_frame
    tf_s11a.word_wrap = True

    pts_s11a = [
        ("Transparent Risk Science:", "Replaced inscrutable black-box models with verifiable Digital Image Processing metrics."),
        ("Multi-Modal Perception:", "Synthesized Gunnar Farneback optical flow, directional Shannon entropy, and YOLOv8."),
        ("Perspective Compensation:", "Corrected monocular tilt distortion via adaptive vertical Gaussian splatting."),
        ("Operator-Centric 3D HUD:", "Delivered an art-directed Three.js workstation offering actionable early warning advisories.")
    ]
    for j, (h, b) in enumerate(pts_s11a):
        p = tf_s11a.paragraphs[0] if j == 0 else tf_s11a.add_paragraph()
        p.text = f"• {h} "
        p.font.size = Pt(11.5)
        p.font.bold = True
        p.font.color.rgb = C_TEXT_WHITE
        p.font.name = "Segoe UI"
        if j > 0:
            p.space_before = Pt(10)
        run = p.add_run()
        run.text = b
        run.font.bold = False
        run.font.color.rgb = C_TEXT_MUTED

    add_card(s11, Inches(6.8), Inches(1.8), Inches(5.7), Inches(5.0), title="Future Research Horizons", border_color=C_ACCENT)
    tb_s11b = s11.shapes.add_textbox(Inches(7.05), Inches(2.55), Inches(5.2), Inches(4.0))
    tf_s11b = tb_s11b.text_frame
    tf_s11b.word_wrap = True

    pts_s11b = [
        ("Stereoscopic Ground-Plane Homography:", "Calibrating dual-lens camera extrinsics to produce mathematically exact physical persons/m2."),
        ("Graph Neural Network (GNN) Spatio-Temporal Models:", "Modeling inter-pedestrian force vectors for macroscopic disaster prediction."),
        ("City-Scale Distributed Edge Federation:", "Deploying edge DIP pipelines on NVIDIA Jetson / Raspberry Pi with central coordination."),
        ("Autonomous Drone Aerial Surveillance:", "Adapting perspective normalization to non-stationary gimbal cameras.")
    ]
    for j, (h, b) in enumerate(pts_s11b):
        p = tf_s11b.paragraphs[0] if j == 0 else tf_s11b.add_paragraph()
        p.text = f"• {h} "
        p.font.size = Pt(11.5)
        p.font.bold = True
        p.font.color.rgb = C_TEXT_WHITE
        p.font.name = "Segoe UI"
        if j > 0:
            p.space_before = Pt(10)
        run = p.add_run()
        run.text = b
        run.font.bold = False
        run.font.color.rgb = C_TEXT_MUTED

    # Output directory
    output_dir = "d:\\projects\\dip"
    output_path = os.path.join(output_dir, "CROWDGUARD_v2_Presentation.pptx")
    prs.save(output_path)
    print(f"Presentation saved successfully to: {output_path}")

if __name__ == "__main__":
    create_deck()
