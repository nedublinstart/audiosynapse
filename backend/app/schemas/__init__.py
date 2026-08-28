from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import LectureStatus


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORMModel):
    id: int
    email: EmailStr
    full_name: str
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class SemesterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class SemesterOut(ORMModel):
    id: int
    name: str
    created_at: datetime


class ScheduleSlotCreate(BaseModel):
    weekday: int = Field(ge=0, le=6)
    start_time: str
    end_time: str
    location: str | None = None


class ScheduleSlotOut(ORMModel):
    id: int
    weekday: int
    start_time: str
    end_time: str
    location: str | None


class SubjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    color: str = "#1f7a75"
    semester_id: int | None = None
    schedule: list[ScheduleSlotCreate] = []


class SubjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    color: str | None = None
    semester_id: int | None = None


class SubjectOut(ORMModel):
    id: int
    name: str
    description: str | None
    color: str
    semester_id: int | None
    created_at: datetime
    schedule_slots: list[ScheduleSlotOut] = []
    lecture_count: int = 0


class SubjectImportPreviewIn(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)
    with_schedule: bool = False


class SubjectImportItem(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    color: str | None = None
    selected: bool = True
    schedule: list[ScheduleSlotCreate] = []


class SubjectImportPreviewOut(BaseModel):
    engine: str
    items: list[SubjectImportItem]


class SubjectImportConfirmIn(BaseModel):
    items: list[SubjectImportItem] = Field(min_length=1, max_length=40)


class LectureCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    topic: str | None = None
    # Date-only preferred (YYYY-MM-DD). Time of day is ignored — students don't enter clock time.
    lecture_date: datetime | None = None


class CalendarLectureOut(BaseModel):
    id: int
    title: str
    topic: str | None
    lecture_date: datetime | None
    status: LectureStatus
    subject_id: int
    subject_name: str
    subject_color: str


class LectureUpdate(BaseModel):
    title: str | None = None
    topic: str | None = None
    lecture_date: datetime | None = None
    status: LectureStatus | None = None


class MaterialOut(ORMModel):
    id: int
    filename: str
    content_type: str
    created_at: datetime


class LectureOut(ORMModel):
    id: int
    subject_id: int
    title: str
    topic: str | None
    lecture_date: datetime | None
    status: LectureStatus
    audio_filename: str | None
    audio_size_bytes: int | None = None
    processing_stage: str | None = None
    processing_progress: int = 0
    processing_message: str | None = None
    notes_markdown: str | None
    enrichment_notice: str | None
    duration_seconds: int | None
    created_at: datetime
    updated_at: datetime
    materials: list[MaterialOut] = []


class LectureDetailOut(LectureOut):
    transcript: str | None = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    exam_mode: bool = False


class ChatMessageOut(ORMModel):
    id: int
    role: str
    content: str
    exam_mode: bool
    created_at: datetime


class EnrichmentResult(BaseModel):
    notice: str
    notes_markdown: str
