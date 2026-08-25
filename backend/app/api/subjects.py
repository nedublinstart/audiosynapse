from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import ScheduleSlot, Semester, Subject, User
from app.schemas import (
    ScheduleSlotCreate,
    ScheduleSlotOut,
    SemesterCreate,
    SemesterOut,
    SubjectCreate,
    SubjectOut,
    SubjectUpdate,
)

router = APIRouter(tags=["academics"])


@router.post("/semesters", response_model=SemesterOut)
def create_semester(
    payload: SemesterCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SemesterOut:
    semester = Semester(name=payload.name.strip(), owner_id=user.id)
    db.add(semester)
    db.commit()
    db.refresh(semester)
    return SemesterOut.model_validate(semester)


@router.get("/semesters", response_model=list[SemesterOut])
def list_semesters(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SemesterOut]:
    rows = db.query(Semester).filter(Semester.owner_id == user.id).order_by(Semester.created_at.desc()).all()
    return [SemesterOut.model_validate(r) for r in rows]


def _subject_out(subject: Subject) -> SubjectOut:
    data = SubjectOut.model_validate(subject)
    data.lecture_count = len(subject.lectures)
    return data


@router.post("/subjects", response_model=SubjectOut)
def create_subject(
    payload: SubjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubjectOut:
    if payload.semester_id:
        semester = db.get(Semester, payload.semester_id)
        if not semester or semester.owner_id != user.id:
            raise HTTPException(status_code=404, detail="Semester not found")
    subject = Subject(
        name=payload.name.strip(),
        description=payload.description,
        color=payload.color,
        owner_id=user.id,
        semester_id=payload.semester_id,
    )
    db.add(subject)
    db.flush()
    for slot in payload.schedule:
        db.add(
            ScheduleSlot(
                subject_id=subject.id,
                weekday=slot.weekday,
                start_time=slot.start_time,
                end_time=slot.end_time,
                location=slot.location,
            )
        )
    db.commit()
    subject = (
        db.query(Subject)
        .options(joinedload(Subject.schedule_slots), joinedload(Subject.lectures))
        .filter(Subject.id == subject.id)
        .one()
    )
    return _subject_out(subject)


@router.get("/subjects", response_model=list[SubjectOut])
def list_subjects(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SubjectOut]:
    rows = (
        db.query(Subject)
        .options(joinedload(Subject.schedule_slots), joinedload(Subject.lectures))
        .filter(Subject.owner_id == user.id)
        .order_by(Subject.created_at.desc())
        .all()
    )
    return [_subject_out(r) for r in rows]


@router.get("/subjects/{subject_id}", response_model=SubjectOut)
def get_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubjectOut:
    subject = (
        db.query(Subject)
        .options(joinedload(Subject.schedule_slots), joinedload(Subject.lectures))
        .filter(Subject.id == subject_id, Subject.owner_id == user.id)
        .first()
    )
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    return _subject_out(subject)


@router.patch("/subjects/{subject_id}", response_model=SubjectOut)
def update_subject(
    subject_id: int,
    payload: SubjectUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubjectOut:
    subject = db.query(Subject).filter(Subject.id == subject_id, Subject.owner_id == user.id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(subject, field, value)
    db.commit()
    subject = (
        db.query(Subject)
        .options(joinedload(Subject.schedule_slots), joinedload(Subject.lectures))
        .filter(Subject.id == subject_id)
        .one()
    )
    return _subject_out(subject)


@router.delete("/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    subject = db.query(Subject).filter(Subject.id == subject_id, Subject.owner_id == user.id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    db.delete(subject)
    db.commit()


@router.post("/subjects/{subject_id}/schedule", response_model=ScheduleSlotOut)
def add_schedule_slot(
    subject_id: int,
    payload: ScheduleSlotCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ScheduleSlotOut:
    subject = db.query(Subject).filter(Subject.id == subject_id, Subject.owner_id == user.id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    slot = ScheduleSlot(
        subject_id=subject.id,
        weekday=payload.weekday,
        start_time=payload.start_time,
        end_time=payload.end_time,
        location=payload.location,
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return ScheduleSlotOut.model_validate(slot)
