"""Lecture audio upload → transcription → notes pipeline with live progress."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

from sqlalchemy.orm import Session, joinedload

from app.core.database import SessionLocal
from app.models import Lecture, LectureStatus

logger = logging.getLogger("synapse.pipeline")


class ProcessingStage(str, Enum):
    uploading = "uploading"
    queued = "queued"
    transcribing = "transcribing"
    analyzing = "analyzing"
    generating_notes = "generating_notes"
    finalizing = "finalizing"
    done = "done"


STAGE_LABELS: dict[str, str] = {
    ProcessingStage.uploading.value: "Загрузка аудио",
    ProcessingStage.queued.value: "Подготовка к обработке",
    ProcessingStage.transcribing.value: "Расшифровка речи",
    ProcessingStage.analyzing.value: "Анализ содержания",
    ProcessingStage.generating_notes.value: "Сборка конспекта",
    ProcessingStage.finalizing.value: "Финальная проверка",
    ProcessingStage.done.value: "Готово",
}


def stage_label(stage: str | None) -> str:
    if not stage:
        return "Обработка"
    return STAGE_LABELS.get(stage, stage)


def update_lecture_progress(
    db: Session,
    lecture: Lecture,
    *,
    stage: ProcessingStage | str,
    progress: int,
    message: str | None = None,
) -> None:
    lecture.processing_stage = stage.value if isinstance(stage, ProcessingStage) else stage
    lecture.processing_progress = max(0, min(100, progress))
    if message is not None:
        lecture.processing_message = message
    db.commit()


def _progress_reporter(lecture_id: int):
    """Thread-safe progress updates from transcription workers."""

    def report(ratio: float, message: str) -> None:
        db = SessionLocal()
        try:
            lecture = db.get(Lecture, lecture_id)
            if not lecture or lecture.status != LectureStatus.processing:
                return
            pct = 8 + int(ratio * 42)  # transcribing: 8–50%
            update_lecture_progress(
                db,
                lecture,
                stage=ProcessingStage.transcribing,
                progress=pct,
                message=message,
            )
        finally:
            db.close()

    return report


async def run_lecture_pipeline(lecture_id: int) -> None:
    from app.services import ai

    db = SessionLocal()
    try:
        lecture = (
            db.query(Lecture)
            .options(joinedload(Lecture.materials), joinedload(Lecture.subject))
            .filter(Lecture.id == lecture_id)
            .one()
        )
        lecture.status = LectureStatus.processing
        update_lecture_progress(
            db,
            lecture,
            stage=ProcessingStage.queued,
            progress=5,
            message="Файл принят, запускаем обработку…",
        )

        materials_text = "\n\n".join(
            m.extracted_text for m in lecture.materials if m.extracted_text
        )
        notices: list[str] = []
        transcript = ""

        update_lecture_progress(
            db,
            lecture,
            stage=ProcessingStage.transcribing,
            progress=8,
            message="Загружаем модель распознавания речи…",
        )

        try:
            result = await ai.transcribe_audio(
                Path(lecture.audio_path),
                lecture.audio_filename or "audio.mp3",
                on_progress=_progress_reporter(lecture_id),
            )
            transcript = result.text
            lecture.transcript = transcript
            if result.duration_seconds:
                lecture.duration_seconds = result.duration_seconds
            notices.append(f"Транскрибация: {result.engine}.")
            update_lecture_progress(
                db,
                lecture,
                stage=ProcessingStage.transcribing,
                progress=50,
                message=f"Расшифровка завершена ({len(transcript):,} симв.)".replace(",", " "),
            )
        except ai.TranscriptionUnavailable as exc:
            logger.warning("transcription unavailable for lecture %s: %s", lecture_id, exc)
            notices.append(
                "Расшифровать аудио не удалось. Загрузите слайды/PDF — конспект соберётся по ним."
            )
            update_lecture_progress(
                db,
                lecture,
                stage=ProcessingStage.analyzing,
                progress=50,
                message="Расшифровка недоступна — пробуем собрать конспект по материалам",
            )

        if not transcript and not materials_text.strip():
            lecture.status = LectureStatus.needs_clarification
            lecture.enrichment_notice = " ".join(notices)
            lecture.processing_stage = None
            lecture.processing_progress = 0
            lecture.processing_message = None
            db.commit()
            return

        update_lecture_progress(
            db,
            lecture,
            stage=ProcessingStage.analyzing,
            progress=55,
            message="Извлекаем темы, термины и структуру лекции…",
        )

        date_str = (
            lecture.lecture_date.strftime("%d.%m.%Y")
            if lecture.lecture_date
            else datetime.now(timezone.utc).strftime("%d.%m.%Y")
        )

        update_lecture_progress(
            db,
            lecture,
            stage=ProcessingStage.generating_notes,
            progress=60,
            message="Собираем полный конспект без урезания содержания…",
        )

        notes, engine = await ai.generate_notes(
            subject_name=lecture.subject.name,
            title=lecture.topic or lecture.title,
            lecture_date=date_str,
            duration_seconds=lecture.duration_seconds,
            transcript=transcript,
            materials_text=materials_text,
        )

        update_lecture_progress(
            db,
            lecture,
            stage=ProcessingStage.finalizing,
            progress=92,
            message="Проверяем и сохраняем результат…",
        )

        lecture.notes_markdown = notes
        if engine == "local":
            notices.append("Конспект собран локально: добавьте AI-ключ для полного качества.")
        elif engine == "ai":
            notices.append("Конспект собран с полным разбором материала.")

        lecture.enrichment_notice = " ".join(notices) or None
        lecture.status = LectureStatus.ready
        lecture.processing_stage = ProcessingStage.done.value
        lecture.processing_progress = 100
        lecture.processing_message = "Конспект готов"
        db.commit()
        logger.info("pipeline complete lecture=%s notes_chars=%s", lecture_id, len(notes))

    except Exception as exc:  # noqa: BLE001
        logger.exception("lecture pipeline failed for %s", lecture_id)
        db.rollback()
        lecture = db.get(Lecture, lecture_id)
        if lecture:
            lecture.status = LectureStatus.needs_clarification
            lecture.enrichment_notice = f"Ошибка обработки: {type(exc).__name__}: {exc}"
            lecture.processing_stage = None
            lecture.processing_progress = 0
            lecture.processing_message = "Обработка прервана"
            db.commit()
    finally:
        db.close()
