# CROWDGUARD v2.0 — Anti-Template Design Refinement & Art-Directed Surveillance Workstation Report

**Branch:** `feat/crowdguard-art-directed-ui`  
**Base:** `feat/crowdguard-light-dark-redesign`  
**Architecture:** React 19 + TypeScript + Vite + Tailwind CSS + FastAPI + PyTorch / YOLOv8  
**Date:** October 2026  

---

## 1. Executive Summary

This phase accomplished an intentional, art-directed visual refinement across the entire **CROWDGUARD** application, breaking out of generic SaaS template patterns (identical 4-card KPI rows, homogeneous rounded containers, decorative glows, and excessive badging) and establishing a **high-precision, academic-grade surveillance workstation aesthetic** ("editorial precision meets practical CCTV operations").

All functionality, backend contracts, camera streaming mechanisms, tracking algorithms, and benchmark endpoints were preserved with **100% fidelity**:
- **Frontend Build (`tsc -b && vite build`):** Succeeded in **< 1.0s** with **0 errors**.
- **Frontend Linter (`oxlint`):** Verified with **0 errors**.
- **Backend Test Suite (`pytest`):** **121 passed, 1 skipped, 0 failures**.

---

## 2. Diagnosed Flaws & Architectural Refinements

### A. Elimination of Repetitive 4-Card KPI Walls
- **Problem:** Every primary page (Overview, Multi-Camera, Live Monitoring, Analytics, Incidents, History) rendered an identical row of 4 or 6 square cards with decorative colored icons and subtext, creating a generic dashboard feel.
- **Solution:** Designed and deployed `MetricStrip` and `MetricItem` in `frontend/src/components/UIComponents.tsx`. These horizontal telemetry ribbons feature subtle vertical dividers, monospace value readouts, compact uppercase taxonomy headers, and tabular numeral alignment (`tabular-nums`). They dock cleanly under viewports or header consoles rather than floating as disconnected cards.

### B. Asymmetric Surveillance Workstation Composition
- **Problem:** Symmetric 2-column or 3-column grids treated surveillance video, raw time-series charts, and data tables identically.
- **Solution:** Restructured `Overview.tsx` into an asymmetric 60/40 surveillance workstation layout:
  - **Hero Operational Sector (7 cols):** Pure black surveillance viewport (`bg-black`) with integrated live HUD and immediate 3×3 spatial density matrix.
  - **Temporal & Incident Console (5 cols):** Integrated +10s forecast trajectory and automated hazard alert feed.
  - **Fleet Session Registry Table:** Full-width dense tabular layout with monospaced timestamps and frame indices.

### C. Surveillance Monitor Tiles & HUD Integration
- **Problem:** In `MultiCamera.tsx`, each camera tile was enclosed in an overly-rounded card with 4 nested mini-cards inside.
- **Solution:** Converted streams into professional CCTV surveillance workstation tiles:
  - True 16:9 pure black monitors (`bg-black`) ensuring YOLO bounding boxes, class labels, and optical flow vectors maintain optimal contrast in both light and dark modes.
  - On-screen surveillance HUDs displaying protocol designation (`RTSP` or `WEBCAM`), resolution, and real-time STALE detection warning badges when frame age exceeds 2.0s.
  - Direct 4-way divided telemetry bar beneath the viewport (`OBSERVED`, `RISK`, `CAP/INF FPS`, `FRESHNESS`).

### D. Elimination of Metric Jitter via Tabular Numerals
- **Problem:** Dynamic FPS counters, frame counts, latencies, and timestamps shifted horizontally during live streaming due to proportional font glyph widths.
- **Solution:** Enforced `font-variant-numeric: tabular-nums` globally across `.tabular-nums`, tables, and monospace containers in `frontend/src/App.css`.

### E. Editorial Analytical Investigation
- **Problem:** `Analytics.tsx` presented 3 generic chart containers without narrative context.
- **Solution:** Restructured the analytics flow with editorial investigative inquiry headers answering specific crowd disaster dynamics:
  1. *What is the short-term disaster risk trajectory? — Multi-Horizon Projections (+5s, +10s, +15s)*
  2. *Is the crowd moving in organized laminar flow or turbulent panic? — Shannon Entropy & Velocity Variance*
  3. *Which physical mechanism is driving the composite risk rating? — 4-Factor Heuristic Decomposition*

---

## 3. Brand Color Palette Integrity

The required 5-color brand palette was strictly preserved:
- **Slate Blue (`#2F4454`):** Primary interactive headers, buttons, and telemetry accents.
- **Deep Burgundy (`#2E151B`):** Critical risk indicators, severity accents, and alert banners.
- **Dusty Rose (`#DA7B93`):** High-risk thresholds, velocity trend lines, and turbulence indices.
- **Muted Teal (`#376E6F`):** Active streams, healthy telemetry markers, and focal UI borders.
- **Deep Teal (`#1C3334`):** Primary dark text in light mode, high-contrast badges, and dark workstation frames.

---

## 4. Verification & Testing Matrix

| Component | Target Verification | Result | Status |
| :--- | :--- | :--- | :--- |
| **Frontend Compilation** | `npm --prefix frontend run build` | Built in ~780ms, 0 TypeScript errors | **PASSED** |
| **Frontend Linting** | `npm --prefix frontend run lint` | 0 errors | **PASSED** |
| **Backend Test Suite** | `pytest -q` | 121 passed, 1 skipped | **PASSED** |
| **Theme Switching** | Light (default) ↔ Dark | Instantaneous, non-disruptive, no stream remount | **PASSED** |
| **Multi-Camera HUD** | RTSP / Webcam multi-stream | Monospace HUD, stale indicators active | **PASSED** |
