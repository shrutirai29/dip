import os

class Settings:
    PROJECT_NAME: str = "Digital Image Processing Based Crowd Monitoring and Disaster Prediction System"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api"
    
    # backend/app/core/config.py -> core -> app -> backend -> project_root
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    DATA_DIR: str = os.path.join(BASE_DIR, "data")
    UPLOAD_DIR: str = os.path.join(DATA_DIR, "uploads")
    PROCESSED_DIR: str = os.path.join(DATA_DIR, "processed")
    REPORTS_DIR: str = os.path.join(DATA_DIR, "reports")
    SAMPLE_VIDEOS_DIR: str = os.path.join(DATA_DIR, "sample_videos")
    MODELS_DIR: str = os.path.join(DATA_DIR, "models")
    
    DATABASE_URL: str = f"sqlite:///{os.path.join(DATA_DIR, 'surveillance.db')}"
    
    # YOLO Detection Settings
    YOLO_MODEL_NAME: str = "yolov8n.pt"  # nano model for fast CPU/CUDA inference
    DEFAULT_CONF_THRESHOLD: float = 0.30  # Evidence-based baseline to suppress small background clutter
    DEFAULT_IOU_THRESHOLD: float = 0.45
    DEFAULT_INFERENCE_SIZE: int = 640
    DEFAULT_FRAME_STRIDE: int = 2  # Process every 2nd frame for real-time CPU balance
    TRACKER_MIN_HITS: int = 2  # Consecutive frames required to confirm tentative track
    TRACKER_INSTANT_CONFIRM_CONF: float = 0.60  # Immediate confirmation for high-confidence detections
    TRACKER_MAX_LOST: int = 15
    
    # Risk Engine Heuristic Weights (Sum to 1.0)
    WEIGHT_DENSITY: float = 0.35
    WEIGHT_GROWTH: float = 0.20
    WEIGHT_MOTION_ANOMALY: float = 0.25
    WEIGHT_CONGESTION: float = 0.20
    
    # Risk Bands
    RISK_LOW_MAX: float = 25.0
    RISK_MODERATE_MAX: float = 50.0
    RISK_HIGH_MAX: float = 75.0
    
    # Perspective Normalization Defaults
    PERSPECTIVE_FAR_SCALE: float = 1.8   # High y-offset / horizon scaling factor
    PERSPECTIVE_NEAR_SCALE: float = 0.8  # Bottom of frame factor
    
    # Privacy Mode Defaults
    DEFAULT_PRIVACY_MODE: str = "none"  # "none", "face_blur", "full_anonymize"
    
    MAX_UPLOAD_SIZE_MB: int = 150
    
    # RTSP CCTV Integration & Network Security
    ALLOWED_CAMERA_SUBNETS: list[str] = [
        "192.168.0.0/16",
        "10.0.0.0/8",
        "172.16.0.0/12"
    ]
    # Allowed ports: standard RTSP (554), RTSPS (322), alternate (8554, 5544, 10554, 7070)
    # plus non-privileged dynamic port range (1024-65535)
    ALLOWED_CAMERA_PORTS: list[int] = [554, 322, 8554, 5544, 10554, 7070]
    ALLOW_LOOPBACK_RTSP_TESTING: bool = os.getenv("ALLOW_LOOPBACK_RTSP_TESTING", "0").lower() in ("1", "true")
    DEFAULT_RTSP_TIMEOUT_SEC: float = 5.0
    DEFAULT_RTSP_MAX_RETRIES: int = 5
    DEFAULT_RTSP_INITIAL_BACKOFF_SEC: float = 1.0
    DEFAULT_RTSP_MAX_BACKOFF_SEC: float = 16.0
    
    # CORS Allowed Origins
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ]

settings = Settings()

# Ensure directories exist
for folder in [
    settings.DATA_DIR,
    settings.UPLOAD_DIR,
    settings.PROCESSED_DIR,
    settings.REPORTS_DIR,
    settings.SAMPLE_VIDEOS_DIR,
    settings.MODELS_DIR
]:
    os.makedirs(folder, exist_ok=True)
