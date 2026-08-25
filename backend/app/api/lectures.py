from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.models import ChatMessage, Lecture, LectureStatus, Material, Subject, User
from app.schemas import (
    ChatMessageOut,
    ChatRequest,
    LectureCreate,
    LectureDetailOut,
    LectureOut,
    LectureUpdate,
)
from app.services import ai
from app.services.documents import extract_text_from_file

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
ALLOWED_MATERIALS = {".pdf", ".pptx", ".docx", ".png", ".jpg", ".jpeg", ".webp", ".txt", ".md"}


def _get_owned_subject(db: Session, user: User, subject_id: int) -> Subject:
    subject = db.query(Subject).filter(Subject.id == subject_id, Subject.owner_id == user.id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
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
        raise HTTPException(status_code=404, detail="Lecture not found")
    return lecture


def _materials_text(lecture: Lecture) -> str:
    parts = [m.extracted_text for m in lecture.materials if m.extracted_text]
    return "\n\n".join(parts)


def _lecture_out(lecture: Lecture) -> LectureOut:
    return LectureOut.model_validate(lecture)


async def _process_lecture_pipeline(lecture_id: int) -> None:
    db = SessionLocal()
    try:
        lecture = (
            db.query(Lecture)
            .options(joinedload(Lecture.materials), joinedload(Lecture.subject))
            .filter(Lecture.id == lecture_id)
            .one()
        )
        lecture.status = LectureStatus.processing
        db.commit()

        materials_text = _materials_text(lecture)
        notices: list[str] = []
        transcript = ""

        try:
            result = await ai.transcribe_audio(
                Path(lecture.audio_path), lecture.audio_filename or "audio.mp3"
            )
            transcript = result.text
            lecture.transcript = transcript
            if result.duration_seconds:
                lecture.duration_seconds = result.duration_seconds
            notices.append(f"Транскрибация: {result.engine}.")
        except ai.TranscriptionUnavailable as exc:
            logger.warning("transcription unavailable for lecture %s: %s", lecture_id, exc)
            notices.append(
                "Расшифровать аудио не удалось: доступной модели распознавания речи нет. "
                "Включи локальное распознавание (см. FIX_WINDOWS.txt, раздел «Транскрибация») "
                "или загрузи слайды/PDF — конспект соберётся по ним."
            )

        if not transcript and not materials_text.strip():
            lecture.status = LectureStatus.needs_clarification
            lecture.enrichment_notice = " ".join(notices)
            db.commit()
            return

        date_str = (
            lecture.lecture_date.strftime("%d.%m.%Y")
            if lecture.lecture_date
            else datetime.now(timezone.utc).strftime("%d.%m.%Y")
        )
        notes, engine = await ai.generate_notes(
            subject_name=lecture.subject.name,
            title=lecture.topic or lecture.title,
            lecture_date=date_str,
            duration_seconds=lecture.duration_seconds,
            transcript=transcript,
            materials_text=materials_text,
        )
        lecture.notes_markdown = notes
        if engine == "local":
            notices.append("Конспект собран локально: ИИ-провайдеры недоступны.")
        lecture.enrichment_notice = " ".join(notices) or None
        lecture.status = LectureStatus.ready
        db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.exception("lecture pipeline failed for %s", lecture_id)
        lecture = db.get(Lecture, lecture_id)
        if lecture:
            lecture.status = LectureStatus.needs_clarification
            lecture.enrichment_notice = f"Ошибка обработки: {type(exc).__name__}: {exc}"
            db.commit()
    finally:
        db.close()


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
        lecture_date=payload.lecture_date or datetime.now(timezone.utc),
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
        raise HTTPException(status_code=400, detail=f"Unsupported audio format. Allowed: {sorted(ALLOWED_AUDIO)}")

    dest_dir = settings.upload_dir / f"lecture_{lecture.id}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"audio_{uuid.uuid4().hex}{suffix}"
    # Stream in chunks: lecture recordings can be hundreds of megabytes.
    with dest.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            out.write(chunk)

    lecture.audio_path = str(dest)
    lecture.audio_filename = file.filename
    lecture.status = LectureStatus.processing
    db.commit()

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
        raise HTTPException(status_code=400, detail=f"Unsupported material. Allowed: {sorted(ALLOWED_MATERIALS)}")

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
        db.commit()
        try:
            notes, notice = await ai.enrich_notes(
                existing_notes=lecture.notes_markdown,
                materials_text=extracted,
                subject_name=lecture.subject.name,
                title=lecture.topic or lecture.title,
            )
            lecture.notes_markdown = notes
            lecture.enrichment_notice = notice
            lecture.status = LectureStatus.ready
        except Exception as exc:  # noqa: BLE001
            lecture.status = LectureStatus.needs_clarification
            lecture.enrichment_notice = f"Ошибка обогащения: {exc}"
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
        raise HTTPException(status_code=400, detail="No audio uploaded")
    lecture.status = LectureStatus.processing
    db.commit()
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
    answer = await ai.chat_about_lecture(
        message=payload.message,
        exam_mode=payload.exam_mode,
        notes=lecture.notes_markdown or "",
        transcript=lecture.transcript,
        materials_text=_materials_text(lecture),
        history=history,
    )
    assistant = ChatMessage(
        lecture_id=lecture.id,
        role="assistant",
        content=answer,
        exam_mode=payload.exam_mode,
    )
    db.add(assistant)
    db.commit()
    db.refresh(assistant)
    return ChatMessageOut.model_validate(assistant)


@router.get("/schedule/suggestions")
def schedule_suggestions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    """Suggest creating lecture cards for subjects that had a class ending recently."""
    now = datetime.now().astimezone()
    weekday = now.weekday()
    subjects = (
        db.query(Subject)
        .options(joinedload(Subject.schedule_slots))
        .filter(Subject.owner_id == user.id)
        .all()
    )
    suggestions: list[dict] = []
    for subject in subjects:
        for slot in subject.schedule_slots:
            if slot.weekday != weekday:
                continue
            try:
                end_h, end_m = map(int, slot.end_time.split(":"))
            except ValueError:
                continue
            end_minutes = end_h * 60 + end_m
            now_minutes = now.hour * 60 + now.minute
            # Suggest within 3 hours after class end
            if 0 <= now_minutes - end_minutes <= 180:
                suggestions.append(
                    {
                        "subject_id": subject.id,
                        "subject_name": subject.name,
                        "weekday": slot.weekday,
                        "start_time": slot.start_time,
                        "end_time": slot.end_time,
                        "location": slot.location,
                        "suggested_title": f"Лекция {now.strftime('%d.%m')} — {subject.name}",
                    }
                )
    return suggestions
