import os

class Settings:
    PROJECT_NAME: str = "Digital Image Processing Based Crowd Monitoring and Disaster Prediction System"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    DATA_DIR: str = os.path.join(BASE_DIR, "data")
    UPLOAD_DIR: str = os.path.join(DATA_DIR, "uploads")
    PROCESSED_DIR: str = os.path.join(DATA_DIR, "processed")
    REPORTS_DIR: str = os.path.join(DATA_DIR, "reports")
    SAMPLE_VIDEOS_DIR: str = os.path.join(DATA_DIR, "sample_videos")
    MODELS_DIR: str = os.path.join(DATA_DIR, "models")
    
    DATABASE_URL: str = f"sqlite:///{os.path.join(DATA_DIR, 'surveillance.db')}"
    
    # YOLO Settings
    YOLO_MODEL_NAME: str = "yolov8n.pt"  # nano model for fast CPU inference
    DEFAULT_CONF_THRESHOLD: float = 0.25
    DEFAULT_IOU_THRESHOLD: float = 0.45
    DEFAULT_INFERENCE_SIZE: int = 640
    DEFAULT_FRAME_STRIDE: int = 2  # process every 2nd frame for real-time CPU speed
    
    # Risk Engine Heuristic Weights (Sum to 1.0)
    WEIGHT_DENSITY: float = 0.35
    WEIGHT_GROWTH: float = 0.20
    WEIGHT_MOTION_ANOMALY: float = 0.25
    WEIGHT_CONGESTION: float = 0.20
    
    # Risk Bands
    RISK_LOW_MAX: float = 25.0
    RISK_MODERATE_MAX: float = 50.0
    RISK_HIGH_MAX: float = 75.0
    
    MAX_UPLOAD_SIZE_MB: int = 150

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
