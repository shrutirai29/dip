import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.database.session import engine, Base
from app.api.endpoints import router as api_router

# Initialize database schema
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Digital Image Processing and Computer Vision system for real-time crowd safety, density mapping, flow anomaly detection, and early risk warning."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files to serve processed videos and frames directly to frontend
app.mount("/data/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
app.mount("/data/processed", StaticFiles(directory=settings.PROCESSED_DIR), name="processed")
if os.path.exists(settings.SAMPLE_VIDEOS_DIR):
    app.mount("/data/sample_videos", StaticFiles(directory=settings.SAMPLE_VIDEOS_DIR), name="sample_videos")

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def root():
    return {
        "message": "Welcome to DIP Crowd Monitoring & Disaster Risk Assessment System API",
        "docs": "/docs",
        "health": "/api/health"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
