import os
import cv2
import numpy as np

def generate_synthetic_crowd_scenario(scenario_name: str, output_path: str, duration_sec: int = 10, fps: int = 25):
    """
    Generates synthetic CCTV test scenarios for reproducible academic demonstration:
    - "bottleneck": Crowd enters corridors and clusters into central passage
    - "counterflow": Opposing streams passing through each other
    - "panic_disorder": Coordinated movement followed by abrupt dispersion and speed surge
    """
    width, height = 640, 480
    total_frames = duration_sec * fps
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    np.random.seed(42 if scenario_name == "bottleneck" else 101)
    
    agents = []
    num_agents = 22 if scenario_name != "counterflow" else 24
    
    for i in range(num_agents):
        if scenario_name == "counterflow":
            # Half going left-to-right, half right-to-left
            is_east = (i % 2 == 0)
            agents.append({
                "x": float(np.random.randint(40, 180) if is_east else np.random.randint(460, 600)),
                "y": float(np.random.randint(140, 360)),
                "vx": float(np.random.uniform(2.0, 3.2) if is_east else np.random.uniform(-3.2, -2.0)),
                "vy": float(np.random.uniform(-0.4, 0.4)),
                "size": int(np.random.randint(22, 28)),
                "color": (60, 100, 140) if is_east else (140, 90, 60)
            })
        else:
            agents.append({
                "x": float(np.random.randint(60, width - 60)),
                "y": float(np.random.randint(100, height - 80)),
                "vx": float(np.random.uniform(-1.5, 1.5)),
                "vy": float(np.random.uniform(-1.0, 1.0)),
                "size": int(np.random.randint(22, 28)),
                "color": (int(np.random.randint(40, 90)), int(np.random.randint(50, 110)), int(np.random.randint(80, 160)))
            })

    for frame_i in range(total_frames):
        t_ratio = frame_i / float(total_frames)
        # Background
        frame = np.full((height, width, 3), 32, dtype=np.uint8)
        # Floor grid lines
        for gy in range(0, height, 40):
            cv2.line(frame, (0, gy), (width, gy), (45, 45, 48), 1)
        for gx in range(0, width, 40):
            cv2.line(frame, (gx, 0), (gx, height), (45, 45, 48), 1)

        # Scenario dynamic behaviors
        for ag in agents:
            if scenario_name == "bottleneck":
                if t_ratio > 0.35:
                    # Focus towards Sector B2 / Zone (320, 260)
                    target_x = 320.0 + np.random.uniform(-40, 40)
                    target_y = 260.0 + np.random.uniform(-30, 30)
                    ag["vx"] += (target_x - ag["x"]) * 0.007
                    ag["vy"] += (target_y - ag["y"]) * 0.007
            elif scenario_name == "panic_disorder":
                if t_ratio > 0.50:
                    # Sudden velocity surge in random turbulent directions
                    ag["vx"] += np.random.uniform(-2.5, 2.5)
                    ag["vy"] += np.random.uniform(-2.5, 2.5)
                    # Dampen max velocity
                    ag["vx"] = np.clip(ag["vx"], -9.0, 9.0)
                    ag["vy"] = np.clip(ag["vy"], -9.0, 9.0)

            ag["x"] += ag["vx"]
            ag["y"] += ag["vy"]

            # Boundary bounce
            if ag["x"] < 35 or ag["x"] > width - 35:
                ag["vx"] *= -1
            if ag["y"] < 70 or ag["y"] > height - 55:
                ag["vy"] *= -1

            x, y = int(ag["x"]), int(ag["y"])
            sz = ag["size"]

            # Person model: Torso + Head + Ground foot anchor
            cv2.ellipse(frame, (x, y), (sz // 2, sz), 0, 0, 360, ag["color"], -1)
            cv2.circle(frame, (x, y - sz - 4), sz // 3, (190, 205, 220), -1)
            cv2.line(frame, (x - 4, y + sz), (x - 6, y + sz + 12), (20, 20, 20), 3)
            cv2.line(frame, (x + 4, y + sz), (x + 6, y + sz + 12), (20, 20, 20), 3)

        # Watermark
        tag = f"CROWDGUARD DEMO | SCENARIO: {scenario_name.upper()} | T={frame_i/fps:.2f}s"
        cv2.putText(frame, tag, (15, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (180, 195, 210), 1, cv2.LINE_AA)
        out.write(frame)

    out.release()
    print(f"Generated scenario [{scenario_name}] at: {output_path}")

if __name__ == "__main__":
    generate_synthetic_crowd_scenario("bottleneck", "data/sample_videos/crowd_bottleneck_demo.mp4")
    generate_synthetic_crowd_scenario("counterflow", "data/sample_videos/crowd_counterflow_demo.mp4")
    generate_synthetic_crowd_scenario("panic_disorder", "data/sample_videos/crowd_panic_demo.mp4")
