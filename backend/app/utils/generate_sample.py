import os
import cv2
import numpy as np

def generate_sample_crowd_video(output_path: str, duration_sec: int = 8, fps: int = 25):
    """
    Generates a realistic synthetic CCTV crowd simulation video:
    - Walking people (ellipsoids with heads) traversing corridors and gathering
    - Tests YOLO person detections, optical flow calculation, grid clustering, and risk escalation
    """
    width, height = 640, 480
    total_frames = duration_sec * fps
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    np.random.seed(42)
    # Define 18 agents with starting positions and velocities
    agents = []
    for i in range(18):
        agents.append({
            "x": float(np.random.randint(60, width - 60)),
            "y": float(np.random.randint(100, height - 80)),
            "vx": float(np.random.uniform(-1.8, 1.8)),
            "vy": float(np.random.uniform(-1.2, 1.2)),
            "color": (int(np.random.randint(40, 90)), int(np.random.randint(50, 110)), int(np.random.randint(80, 160))),
            "size": int(np.random.randint(22, 30))
        })
        
    for frame_i in range(total_frames):
        # Surveillance CCTV style background (dim lighting with floor grid pattern)
        frame = np.full((height, width, 3), 45, dtype=np.uint8)
        # Add floor tiles
        for gy in range(0, height, 40):
            cv2.line(frame, (0, gy), (width, gy), (55, 55, 55), 1)
        for gx in range(0, width, 40):
            cv2.line(frame, (gx, 0), (gx, height), (55, 55, 55), 1)
            
        # As time progresses into second half, agents converge into a tight bottleneck zone in center
        t_ratio = frame_i / total_frames
        
        for ag in agents:
            if t_ratio > 0.4:
                # Pull toward center bottleneck (320, 260) to test crowd surge and clustering
                target_x = 320 + np.random.uniform(-40, 40)
                target_y = 260 + np.random.uniform(-30, 30)
                ag["vx"] += (target_x - ag["x"]) * 0.005
                ag["vy"] += (target_y - ag["y"]) * 0.005
                
            ag["x"] += ag["vx"]
            ag["y"] += ag["vy"]
            
            # Bounce off edges
            if ag["x"] < 40 or ag["x"] > width - 40:
                ag["vx"] *= -1
            if ag["y"] < 80 or ag["y"] > height - 60:
                ag["vy"] *= -1
                
            x, y = int(ag["x"]), int(ag["y"])
            sz = ag["size"]
            
            # Draw person (body torso + head + legs)
            # Torso
            cv2.ellipse(frame, (x, y), (sz // 2, sz), 0, 0, 360, ag["color"], -1)
            # Head
            cv2.circle(frame, (x, y - sz - 4), sz // 3, (180, 200, 220), -1)
            # Legs
            cv2.line(frame, (x - 4, y + sz), (x - 6, y + sz + 14), (30, 30, 30), 3)
            cv2.line(frame, (x + 4, y + sz), (x + 6, y + sz + 14), (30, 30, 30), 3)

        # Surveillance camera watermark text
        cv2.putText(frame, f"CAM-04 CORRIDOR | T={frame_i/fps:.2f}s", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1)
        out.write(frame)
        
    out.release()
    print(f"Generated sample CCTV simulation video at: {output_path}")

if __name__ == "__main__":
    generate_sample_crowd_video("data/sample_videos/crowd_corridor_sample.mp4")
