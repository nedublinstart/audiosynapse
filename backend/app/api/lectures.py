from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models import ChatMessage, Lecture, LectureStatus, Material, Subject, User
from app.schemas import (
    ChatMessageOut,
    ChatRequest,
    CalendarLectureOut,
    LectureCreate,
    LectureDetailOut,
    LectureOut,
    LectureUpdate,
)
from app.services import ai
from app.services.documents import extract_text_from_file
from app.services.pipeline import (
    ProcessingStage,
    maybe_recover_stale_lecture,
    run_lecture_pipeline,
    update_lecture_progress,
)

logger = logging.getLogger("synapse.lectures")

router = APIRouter(tags=["lectures"])

ALLOWED_AUDIO = {
    ".mp3",
    ".wav",
    ".m4a",
    ".m4b",
    ".ogg",
    ".oga",
    ".opus",
    ".aac",
    ".flac",
    ".wma",
    ".amr",
    ".mp4",
    ".webm",
    ".3gp",
    ".aiff",
    ".mkv",
}
ALLOWED_MATERIALS = {
    ".pdf",
    ".pptx",
    ".ppt",
    ".docx",
    ".odt",
    ".rtf",
    ".txt",
    ".md",
    ".html",
    ".htm",
    ".csv",
    ".xlsx",
    ".xls",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".bmp",
    ".tif",
    ".tiff",
    ".heic",
}


def _get_owned_subject(db: Session, user: User, subject_id: int) -> Subject:
    subject = db.query(Subject).filter(Subject.id == subject_id, Subject.owner_id == user.id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Предмет не найден")
    return subject


def _get_owned_lecture(db: Session, user: User, lecture_id: int) -> Lecture:
    lecture = (
        db.query(Lecture)
        .options(joinedload(Lecture.materials), joinedload(Lecture.subject))
        .join(Subject)
        .filter(Lecture.id == lecture_id, Subject.owner_id == user.id)
        .first()
    )
    if not lecture:
        raise HTTPException(status_code=404, detail="Лекция не найдена")
    return lecture


def _materials_text(lecture: Lecture) -> str:
    parts = [m.extracted_text for m in lecture.materials if m.extracted_text]
    return "\n\n".join(parts)


def _lecture_out(lecture: Lecture) -> LectureOut:
    return LectureOut.model_validate(lecture)


def _human_size(num_bytes: int) -> str:
    if num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.0f} КБ"
    return f"{num_bytes / (1024 * 1024):.1f} МБ"


async def _save_upload_stream(
    upload: UploadFile,
    dest: Path,
    *,
    max_bytes: int,
) -> int:
    """Stream upload to disk with size guard; returns bytes written."""
    total = 0
    chunk_size = 1024 * 1024
    with dest.open("wb") as out:
        while chunk := await upload.read(chunk_size):
            total += len(chunk)
            if total > max_bytes:
                dest.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"Файл слишком большой. Максимум {_human_size(max_bytes)}.",
                )
            out.write(chunk)
    return total


async def _process_lecture_pipeline(lecture_id: int) -> None:
    await run_lecture_pipeline(lecture_id)


def _date_only_utc(value: datetime | None) -> datetime:
    """Store lecture day without forcing the user to pick a clock time."""
    if value is None:
        now = datetime.now(timezone.utc)
        return datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)


@router.post("/subjects/{subject_id}/lectures", response_model=LectureOut)
def create_lecture(
    subject_id: int,
    payload: LectureCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LectureOut:
    subject = _get_owned_subject(db, user, subject_id)
    lecture = Lecture(
        subject_id=subject.id,
        title=payload.title.strip(),
        topic=payload.topic,
        lecture_date=_date_only_utc(payload.lecture_date),
        status=LectureStatus.awaiting_audio,
    )
    db.add(lecture)
    db.commit()
    db.refresh(lecture)
    lecture = _get_owned_lecture(db, user, lecture.id)
    return _lecture_out(lecture)


@router.get("/subjects/{subject_id}/lectures", response_model=list[LectureOut])
def list_lectures(
    subject_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[LectureOut]:
    _get_owned_subject(db, user, subject_id)
    rows = (
        db.query(Lecture)
        .options(joinedload(Lecture.materials))
        .filter(Lecture.subject_id == subject_id)
        .order_by(Lecture.created_at.desc())
        .all()
    )
    return [_lecture_out(r) for r in rows]


@router.get("/lectures/{lecture_id}", response_model=LectureDetailOut)
def get_lecture(
    lecture_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LectureDetailOut:
    lecture = _get_owned_lecture(db, user, lecture_id)
    maybe_recover_stale_lecture(db, lecture)
    return LectureDetailOut.model_validate(lecture)


@router.patch("/lectures/{lecture_id}", response_model=LectureOut)
def update_lecture(
    lecture_id: int,
    payload: LectureUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LectureOut:
    lecture = _get_owned_lecture(db, user, lecture_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(lecture, field, value)
    db.commit()
    lecture = _get_owned_lecture(db, user, lecture_id)
    return _lecture_out(lecture)


@router.delete(
    "/lectures/{lecture_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_lecture(
    lecture_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    lecture = _get_owned_lecture(db, user, lecture_id)
    db.delete(lecture)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/lectures/{lecture_id}/audio", response_model=LectureOut)
async def upload_audio(
    lecture_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LectureOut:
    lecture = _get_owned_lecture(db, user, lecture_id)
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_AUDIO:
        raise HTTPException(
            status_code=400,
            detail=f"Формат не поддерживается. Допустимо: {', '.join(sorted(ALLOWED_AUDIO))}",
        )

    dest_dir = settings.upload_dir / f"lecture_{lecture.id}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"audio_{uuid.uuid4().hex}{suffix}"

    lecture.status = LectureStatus.processing
    update_lecture_progress(
        db,
        lecture,
        stage=ProcessingStage.uploading,
        progress=1,
        message="Принимаем файл…",
    )

    try:
        written = await _save_upload_stream(file, dest, max_bytes=settings.max_upload_bytes)
    except HTTPException:
        lecture.status = LectureStatus.awaiting_audio
        lecture.processing_stage = None
        lecture.processing_progress = 0
        lecture.processing_message = None
        db.commit()
        raise

    if written < 1024:
        dest.unlink(missing_ok=True)
        lecture.status = LectureStatus.awaiting_audio
        lecture.processing_stage = None
        lecture.processing_progress = 0
        lecture.processing_message = None
        db.commit()
        raise HTTPException(status_code=400, detail="Файл пустой или повреждён (меньше 1 КБ).")

    if lecture.audio_path and lecture.audio_path != str(dest):
        try:
            Path(lecture.audio_path).unlink(missing_ok=True)
        except OSError:
            pass

    lecture.audio_path = str(dest)
    lecture.audio_filename = file.filename
    lecture.audio_size_bytes = written
    lecture.transcript = None
    lecture.notes_markdown = None
    update_lecture_progress(
        db,
        lecture,
        stage=ProcessingStage.queued,
        progress=100,
        message=f"Загружено {_human_size(written)} — ставим в очередь…",
    )

    background_tasks.add_task(_process_lecture_pipeline, lecture.id)
    lecture = _get_owned_lecture(db, user, lecture_id)
    return _lecture_out(lecture)


@router.post("/lectures/{lecture_id}/materials", response_model=LectureOut)
async def upload_material(
    lecture_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LectureOut:
    lecture = _get_owned_lecture(db, user, lecture_id)
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_MATERIALS:
        raise HTTPException(
            status_code=400,
            detail="Формат файла не поддерживается. Допустимо: PDF, Word, PowerPoint, таблицы, текст, изображения.",
        )

    dest_dir = settings.upload_dir / f"lecture_{lecture.id}" / "materials"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{uuid.uuid4().hex}{suffix}"
    content = await file.read()
    dest.write_bytes(content)

    extracted = extract_text_from_file(dest, file.content_type or "application/octet-stream", file.filename or dest.name)
    material = Material(
        lecture_id=lecture.id,
        filename=file.filename or dest.name,
        file_path=str(dest),
        content_type=file.content_type or "application/octet-stream",
        extracted_text=extracted,
    )
    db.add(material)
    db.commit()
    db.refresh(material)

    # Enrich existing notes if already ready
    lecture = _get_owned_lecture(db, user, lecture_id)
    if lecture.notes_markdown:
        lecture.status = LectureStatus.processing
        update_lecture_progress(
            db,
            lecture,
            stage=ProcessingStage.generating_notes,
            progress=70,
            message="Обновляем конспект с новыми материалами…",
        )
        try:
            all_materials = _materials_text(lecture)
            notes, notice = await ai.enrich_notes(
                existing_notes=lecture.notes_markdown,
                materials_text=all_materials,
                new_materials_text=extracted,
                subject_name=lecture.subject.name,
                subject_description=lecture.subject.description or "",
                title=lecture.topic or lecture.title,
            )
            lecture.notes_markdown = notes
            lecture.enrichment_notice = notice
            lecture.status = LectureStatus.ready
            lecture.processing_stage = ProcessingStage.done.value
            lecture.processing_progress = 100
            lecture.processing_message = "Конспект обновлён"
        except Exception as exc:  # noqa: BLE001
            logger.exception("enrich_notes failed for lecture %s", lecture_id)
            lecture.status = LectureStatus.ready
            lecture.enrichment_notice = (
                "Не удалось обновить конспект с новыми материалами. "
                "Предыдущая версия сохранена — попробуйте позже."
            )
            lecture.processing_stage = ProcessingStage.done.value
            lecture.processing_progress = 100
            lecture.processing_message = "Конспект без изменений"
        db.commit()

    lecture = _get_owned_lecture(db, user, lecture_id)
    return _lecture_out(lecture)


@router.post("/lectures/{lecture_id}/reprocess", response_model=LectureOut)
async def reprocess_lecture(
    lecture_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LectureOut:
    lecture = _get_owned_lecture(db, user, lecture_id)
    if not lecture.audio_path:
        raise HTTPException(status_code=400, detail="Сначала загрузите аудио лекции")
    lecture.status = LectureStatus.processing
    lecture.transcript = None
    lecture.notes_markdown = None
    update_lecture_progress(
        db,
        lecture,
        stage=ProcessingStage.queued,
        progress=5,
        message="Перезапуск обработки…",
    )
    background_tasks.add_task(_process_lecture_pipeline, lecture.id)
    return _lecture_out(lecture)


@router.get("/lectures/{lecture_id}/chat", response_model=list[ChatMessageOut])
def list_chat(
    lecture_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ChatMessageOut]:
    _get_owned_lecture(db, user, lecture_id)
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.lecture_id == lecture_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    return [ChatMessageOut.model_validate(r) for r in rows]


@router.post("/lectures/{lecture_id}/chat", response_model=ChatMessageOut)
async def chat(
    lecture_id: int,
    payload: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatMessageOut:
    lecture = _get_owned_lecture(db, user, lecture_id)
    user_msg = ChatMessage(
        lecture_id=lecture.id,
        role="user",
        content=payload.message.strip(),
        exam_mode=payload.exam_mode,
    )
    db.add(user_msg)
    db.commit()

    history_rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.lecture_id == lecture.id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    history = [{"role": m.role, "content": m.content} for m in history_rows[:-1]]
    try:
        answer, source = await ai.chat_about_lecture(
            message=payload.message,
            exam_mode=payload.exam_mode,
            notes=lecture.notes_markdown or "",
            transcript=lecture.transcript,
            materials_text=_materials_text(lecture),
            history=history,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("chat endpoint failed lecture=%s", lecture_id)
        answer, source = ai.offline_chat_reply(
            payload.message.strip(),
            exam_mode=payload.exam_mode,
            notes=lecture.notes_markdown or "",
            transcript=lecture.transcript,
            materials_text=_materials_text(lecture),
        )
    assistant = ChatMessage(
        lecture_id=lecture.id,
        role="assistant",
        content=answer,
        exam_mode=payload.exam_mode,
        source=source,
    )
    db.add(assistant)
    db.commit()
    db.refresh(assistant)
    return ChatMessageOut.model_validate(assistant)


@router.get("/calendar", response_model=list[CalendarLectureOut])
def calendar_lectures(
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CalendarLectureOut]:
    """Month grid data: lectures by day (no clock times)."""
    now = datetime.now(timezone.utc)
    y = year or now.year
    m = month or now.month
    if m < 1 or m > 12:
        raise HTTPException(status_code=400, detail="Некорректный месяц")
    if m == 12:
        start = datetime(y, m, 1, tzinfo=timezone.utc)
        end = datetime(y + 1, 1, 1, tzinfo=timezone.utc)
    else:
        start = datetime(y, m, 1, tzinfo=timezone.utc)
        end = datetime(y, m + 1, 1, tzinfo=timezone.utc)

    rows = (
        db.query(Lecture)
        .join(Subject, Subject.id == Lecture.subject_id)
        .options(joinedload(Lecture.subject))
        .filter(
            Subject.owner_id == user.id,
            Lecture.lecture_date.isnot(None),
            Lecture.lecture_date >= start,
            Lecture.lecture_date < end,
        )
        .order_by(Lecture.lecture_date.asc(), Lecture.id.asc())
        .all()
    )
    out: list[CalendarLectureOut] = []
    for lecture in rows:
        subject = lecture.subject
        out.append(
            CalendarLectureOut(
                id=lecture.id,
                title=lecture.title,
                topic=lecture.topic,
                lecture_date=lecture.lecture_date,
                status=lecture.status,
                subject_id=subject.id,
                subject_name=subject.name,
                subject_color=subject.color,
            )
        )
    return out


@router.get("/schedule/suggestions")
def schedule_suggestions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    """Deprecated soft hints — kept empty; schedules are floating by design."""
    _ = db, user
    return []
