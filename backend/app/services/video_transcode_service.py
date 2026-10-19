import os
import shutil
import subprocess
import logging
from typing import Optional

logger = logging.getLogger("crowdguard.transcode")

def get_ffmpeg_path() -> Optional[str]:
    """Discover ffmpeg executable in PATH or standard system install locations."""
    path = shutil.which("ffmpeg")
    if path and os.path.exists(path):
        return path
    
    # Check Windows package manager standard locations
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    if local_app_data:
        potential_winget = os.path.join(
            local_app_data,
            "Microsoft",
            "WinGet",
            "Packages"
        )
        if os.path.exists(potential_winget):
            for root, _, files in os.walk(potential_winget):
                for f in files:
                    if f.lower() in ("ffmpeg.exe", "ffmpeg"):
                        candidate = os.path.join(root, f)
                        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
                            return candidate
    return None

def get_ffprobe_path() -> Optional[str]:
    """Discover ffprobe executable in PATH or standard system install locations."""
    path = shutil.which("ffprobe")
    if path and os.path.exists(path):
        return path
    
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    if local_app_data:
        potential_winget = os.path.join(
            local_app_data,
            "Microsoft",
            "WinGet",
            "Packages"
        )
        if os.path.exists(potential_winget):
            for root, _, files in os.walk(potential_winget):
                for f in files:
                    if f.lower() in ("ffprobe.exe", "ffprobe"):
                        candidate = os.path.join(root, f)
                        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
                            return candidate
    return None

def is_h264_stream(file_path: str) -> bool:
    """Inspect whether the video track uses H.264/AVC encoding."""
    if not os.path.exists(file_path):
        return False
    
    ffprobe = get_ffprobe_path()
    if ffprobe:
        try:
            cmd = [
                ffprobe,
                "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=codec_name",
                "-of", "default=noprint_wrappers=1:nokey=1",
                file_path
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            if res.returncode == 0:
                codec = res.stdout.strip().lower()
                return codec in ("h264", "avc", "avc1")
        except Exception as e:
            logger.warning(f"ffprobe check failed for {file_path}: {e}")

    # Fallback inspection via OpenCV
    try:
        import cv2
        cap = cv2.VideoCapture(file_path)
        if cap.isOpened():
            fourcc = int(cap.get(cv2.CAP_PROP_FOURCC))
            cap.release()
            codec_str = "".join([chr((fourcc >> 8 * i) & 0xFF) for i in range(4)]).lower()
            return codec_str in ("avc1", "h264", "x264")
    except Exception:
        pass

    return False

def ensure_h264_browser_compatible(file_path: str) -> str:
    """
    Ensure the target video file is encoded with H.264 (libx264), yuv420p,
    and faststart moov atom for universal HTML5 browser playback and seeking.
    Returns the path to the web-ready file.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Video file does not exist: {file_path}")

    # If already H.264, no transcoding needed
    if is_h264_stream(file_path):
        return file_path

    ffmpeg = get_ffmpeg_path()
    if not ffmpeg:
        logger.warning(
            f"ffmpeg not found on system; unable to transcode {file_path} to H.264. "
            "Browser playback may fail if encoded as MPEG-4 Part 2 (mp4v)."
        )
        return file_path

    temp_path = f"{file_path}.temp_h264.mp4"
    try:
        cmd = [
            ffmpeg,
            "-y",
            "-i", file_path,
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "fast",
            "-crf", "23",
            "-movflags", "+faststart",
            temp_path
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if res.returncode == 0 and os.path.exists(temp_path) and os.path.getsize(temp_path) > 0:
            # Safely replace original with H.264 transcoded file
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except OSError:
                    # On Windows if file locked, rename temp
                    pass
            shutil.move(temp_path, file_path)
            logger.info(f"Successfully converted {file_path} to H.264 for HTML5 browser compatibility")
            return file_path
        else:
            logger.error(f"ffmpeg conversion failed: {res.stderr}")
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
            return file_path
    except Exception as e:
        logger.error(f"Exception during H.264 conversion of {file_path}: {e}")
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
        return file_path
