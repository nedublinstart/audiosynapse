"""Extract audio from video containers before transcription."""

from __future__ import annotations

import logging
import shutil
import subprocess
import uuid
from pathlib import Path

logger = logging.getLogger("synapse.media")

VIDEO_EXTENSIONS = {".mp4", ".webm", ".mkv", ".mov", ".3gp", ".avi", ".m4v"}

VIDEO_LABEL = "видео"


def is_video_path(path: Path) -> bool:
    return path.suffix.lower() in VIDEO_EXTENSIONS


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def prepare_transcription_path(media_path: Path) -> tuple[Path, Path | None]:
    """
    Return (path_for_whisper, temp_file_to_delete).
    Video files are converted to mp3 via ffmpeg when available.
    """
    media_path = Path(media_path)
    if not is_video_path(media_path):
        return media_path, None

    if not ffmpeg_available():
        logger.warning("ffmpeg missing — transcribing video container directly")
        return media_path, None

    out = media_path.parent / f"{media_path.stem}_audio_{uuid.uuid4().hex[:8]}.mp3"
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(media_path),
                "-vn",
                "-acodec",
                "libmp3lame",
                "-q:a",
                "4",
                "-ar",
                "16000",
                "-ac",
                "1",
                str(out),
            ],
            check=True,
            capture_output=True,
            timeout=600,
        )
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or b"").decode("utf-8", errors="ignore")[:400]
        logger.warning("ffmpeg extract failed: %s", stderr)
        return media_path, None
    except Exception as exc:  # noqa: BLE001
        logger.warning("ffmpeg extract error: %s", exc)
        return media_path, None

    if not out.exists() or out.stat().st_size < 1024:
        out.unlink(missing_ok=True)
        return media_path, None

    logger.info("extracted audio from video %s → %s", media_path.name, out.name)
    return out, out
