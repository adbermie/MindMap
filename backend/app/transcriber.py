"""faster-whisper wrapper with lazy model load.

The first /api/transcribe call after boot pays the model-download cost
(~3GB for large-v3) and the model-load cost (~2-5s on a 4070). After that
the model stays resident and subsequent calls only pay GPU inference.
"""

from __future__ import annotations

import threading
from pathlib import Path

from faster_whisper import WhisperModel

from .config import settings


_model: WhisperModel | None = None
_lock = threading.Lock()


def _get_model() -> WhisperModel:
    global _model
    if _model is not None:
        return _model
    with _lock:
        if _model is None:
            _model = WhisperModel(
                settings.whisper_model,
                device=settings.whisper_device,
                compute_type=settings.whisper_compute_type,
            )
    return _model


def transcribe(audio_path: Path) -> tuple[str, str | None]:
    """Run faster-whisper on a local file. Returns (text, language)."""
    model = _get_model()
    segments, info = model.transcribe(
        str(audio_path),
        beam_size=5,
        vad_filter=True,
    )
    text = "".join(seg.text for seg in segments).strip()
    return text, info.language
