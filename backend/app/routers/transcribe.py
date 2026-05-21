from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..transcriber import transcribe


router = APIRouter(prefix="/transcribe", tags=["transcribe"])


class TranscribeResponse(BaseModel):
    text: str
    language: str | None


@router.post("", response_model=TranscribeResponse)
async def transcribe_audio(audio: UploadFile = File(...)) -> TranscribeResponse:
    suffix = Path(audio.filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        path = Path(tmp.name)
        try:
            data = await audio.read()
            if not data:
                raise HTTPException(status_code=400, detail="Empty audio payload")
            tmp.write(data)
            tmp.flush()
            tmp.close()
            try:
                text, lang = transcribe(path)
            except Exception as exc:
                raise HTTPException(
                    status_code=500, detail=f"Transcription failed: {exc}"
                ) from exc
        finally:
            try:
                path.unlink(missing_ok=True)
            except Exception:
                pass

    return TranscribeResponse(text=text, language=lang)
