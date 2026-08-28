"""Lecture audio upload → transcription → notes pipeline with live progress."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path

from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
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


def _lecture_date_str(lecture: Lecture) -> str:
    if lecture.lecture_date:
        return lecture.lecture_date.strftime("%d.%m.%Y")
    return datetime.now(timezone.utc).strftime("%d.%m.%Y")


def _materials_text(lecture: Lecture) -> str:
    return "\n\n".join(m.extracted_text for m in lecture.materials if m.extracted_text)


def _notes_context(db: Session, lecture: Lecture) -> dict[str, str | int]:
    subject = lecture.subject
    prior = (
        db.query(Lecture)
        .filter(Lecture.subject_id == lecture.subject_id, Lecture.id != lecture.id)
        .order_by(Lecture.id.asc())
        .all()
    )
    lines: list[str] = []
    for item in prior[-6:]:
        label = item.topic or item.title
        line = f"• {label}"
        if item.notes_markdown:
            snippet = " ".join(item.notes_markdown.split())[:420]
            line += f" — {snippet}…"
        lines.append(line)
    return {
        "subject_description": (subject.description or "") if subject else "",
        "course_context": "\n".join(lines),
        "lecture_number": len(prior) + 1,
    }


def finalize_pipeline_with_fallback(
    lecture_id: int,
    *,
    reason: str,
    try_fallback_notes: bool = True,
) -> None:
    """
    Always leave the lecture in a terminal state the user can see.
    Prefer delivering degraded notes over an empty error screen.
    """
    from app.services import ai

    db = SessionLocal()
    try:
        lecture = (
            db.query(Lecture)
            .options(joinedload(Lecture.materials), joinedload(Lecture.subject))
            .filter(Lecture.id == lecture_id)
            .one_or_none()
        )
        if not lecture or lecture.status != LectureStatus.processing:
            return

        materials_text = _materials_text(lecture)
        transcript = (lecture.transcript or "").strip()

        if try_fallback_notes and (transcript or materials_text.strip()):
            notes = ai.build_demo_notes(
                subject_name=lecture.subject.name if lecture.subject else "Предмет",
                title=lecture.topic or lecture.title,
                lecture_date=_lecture_date_str(lecture),
                duration_seconds=lecture.duration_seconds,
                transcript=transcript,
                materials_text=materials_text,
            )
            lecture.notes_markdown = notes
            lecture.status = LectureStatus.ready
            lecture.enrichment_notice = (
                f"Конспект собран в упрощённом режиме. {reason}"
            )
            lecture.processing_stage = ProcessingStage.done.value
            lecture.processing_progress = 100
            lecture.processing_message = "Конспект готов (упрощённый режим)"
            logger.warning(
                "pipeline fallback notes lecture=%s reason=%s",
                lecture_id,
                reason[:120],
            )
        else:
            if lecture.audio_path and Path(lecture.audio_path).exists():
                notes = ai.build_demo_notes(
                    subject_name=lecture.subject.name if lecture.subject else "Предмет",
                    title=lecture.topic or lecture.title,
                    lecture_date=_lecture_date_str(lecture),
                    duration_seconds=lecture.duration_seconds,
                    transcript=transcript,
                    materials_text=materials_text,
                )
                lecture.notes_markdown = notes
                lecture.status = LectureStatus.ready
                lecture.enrichment_notice = reason
                lecture.processing_stage = ProcessingStage.done.value
                lecture.processing_progress = 100
                lecture.processing_message = "Черновик конспекта готов"
            else:
                lecture.status = LectureStatus.needs_clarification
                lecture.enrichment_notice = reason
                lecture.processing_stage = None
                lecture.processing_progress = 0
                lecture.processing_message = "Обработка прервана"
        db.commit()
    except Exception:  # noqa: BLE001
        logger.exception("finalize_pipeline_with_fallback failed lecture=%s", lecture_id)
        db.rollback()
    finally:
        db.close()


def recover_stale_processing_lectures() -> int:
    """On startup: unblock lectures left in processing after a crash or hang."""
    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=settings.processing_stale_seconds)
        rows = (
            db.query(Lecture.id)
            .filter(
                Lecture.status == LectureStatus.processing,
                Lecture.updated_at < cutoff,
            )
            .all()
        )
        ids = [row[0] for row in rows]
    finally:
        db.close()

    for lecture_id in ids:
        finalize_pipeline_with_fallback(
            lecture_id,
            reason="Обработка зависла — нажмите «Обработать снова» для полного конспекта.",
            try_fallback_notes=True,
        )
    if ids:
        logger.warning("recovered %s stale processing lecture(s)", len(ids))
    return len(ids)


def maybe_recover_stale_lecture(db: Session, lecture: Lecture) -> bool:
    """Lazy recovery when the client polls a stuck job."""
    if lecture.status != LectureStatus.processing or not lecture.updated_at:
        return False

    updated = lecture.updated_at
    if updated.tzinfo is None:
        updated = updated.replace(tzinfo=timezone.utc)
    else:
        updated = updated.astimezone(timezone.utc)

    age = datetime.now(timezone.utc) - updated
    if age.total_seconds() < settings.processing_stale_seconds:
        return False

    lecture_id = lecture.id
    db.commit()
    finalize_pipeline_with_fallback(
        lecture_id,
        reason="Обработка заняла слишком много времени — показан упрощённый конспект. "
        "Нажмите «Обработать снова» для полной версии.",
        try_fallback_notes=True,
    )
    db.refresh(lecture)
    return True


async def _run_lecture_pipeline_impl(lecture_id: int) -> None:
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

        materials_text = _materials_text(lecture)
        notices: list[str] = []
        transcript = ""

        update_lecture_progress(
            db,
            lecture,
            stage=ProcessingStage.transcribing,
            progress=8,
            message="Загружаем модель распознавания речи…",
        )

        if not lecture.audio_path:
            notices.append("Аудиофайл не загружен.")
        elif not Path(lecture.audio_path).exists():
            notices.append("Аудиофайл не найден на сервере — загрузите запись заново.")

        audio_path = Path(lecture.audio_path) if lecture.audio_path else None

        if audio_path and audio_path.exists():
            try:
                result = await ai.transcribe_audio(
                    audio_path,
                    lecture.audio_filename or "audio.mp3",
                    on_progress=_progress_reporter(lecture_id),
                )
                transcript = result.text
                lecture.transcript = transcript
                if result.duration_seconds:
                    lecture.duration_seconds = result.duration_seconds
                notices.append("Аудио расшифровано.")
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
                    "Расшифровать запись не удалось. Загрузите слайды/PDF — конспект соберётся по ним."
                )
                update_lecture_progress(
                    db,
                    lecture,
                    stage=ProcessingStage.analyzing,
                    progress=50,
                    message="Расшифровка недоступна — пробуем собрать конспект по материалам",
                )

        if not transcript and not materials_text.strip():
            if lecture.audio_path and Path(lecture.audio_path).exists():
                notes = ai.build_demo_notes(
                    subject_name=lecture.subject.name if lecture.subject else "Предмет",
                    title=lecture.topic or lecture.title,
                    lecture_date=_lecture_date_str(lecture),
                    duration_seconds=lecture.duration_seconds,
                    transcript="",
                    materials_text="",
                )
                lecture.notes_markdown = notes
                lecture.status = LectureStatus.ready
                lecture.enrichment_notice = (
                    " ".join(notices)
                    or "Расшифровка не удалась — сохранён черновик. "
                    "Загрузите PDF/DOCX или нажмите «Обработать снова»."
                )
                lecture.processing_stage = ProcessingStage.done.value
                lecture.processing_progress = 100
                lecture.processing_message = "Черновик конспекта готов"
                db.commit()
                logger.warning(
                    "pipeline no transcript lecture=%s — delivered stub notes",
                    lecture_id,
                )
                return

            lecture.status = LectureStatus.needs_clarification
            lecture.enrichment_notice = " ".join(notices) or "Нет аудио-текста и материалов для конспекта."
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

        date_str = _lecture_date_str(lecture)
        ctx = _notes_context(db, lecture)

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
            subject_description=str(ctx["subject_description"]),
            course_context=str(ctx["course_context"]),
            lecture_number=int(ctx["lecture_number"]),
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
            notices.append("Конспект собран локально — для полного качества подключите ИИ-ключ.")
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
        finalize_pipeline_with_fallback(
            lecture_id,
            reason="Не удалось завершить обработку — показан упрощённый конспект.",
            try_fallback_notes=True,
        )
    finally:
        db.close()


async def run_lecture_pipeline(lecture_id: int) -> None:
    try:
        await asyncio.wait_for(
            _run_lecture_pipeline_impl(lecture_id),
            timeout=settings.pipeline_max_seconds,
        )
    except asyncio.TimeoutError:
        logger.error("pipeline timeout lecture=%s after %ss", lecture_id, settings.pipeline_max_seconds)
        finalize_pipeline_with_fallback(
            lecture_id,
            reason="Превышено время обработки — показан упрощённый конспект. "
            "Нажмите «Обработать снова».",
            try_fallback_notes=True,
        )
