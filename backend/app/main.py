from contextlib import asynccontextmanager
from pathlib import Path
import logging
import threading

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.api import auth, lectures, subjects  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import Base, engine  # noqa: E402
from app.core.migrations import run_migrations  # noqa: E402
from app.models import (  # noqa: E402, F401
    ChatMessage,
    Lecture,
    Material,
    ScheduleSlot,
    Semester,
    Subject,
    User,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_migrations()
    from app.services.pipeline import recover_stale_processing_lectures

    recovered = recover_stale_processing_lectures()
    if recovered:
        logging.getLogger("synapse").warning("startup: recovered %s stale lecture job(s)", recovered)
    threading.Thread(target=_warmup_services, daemon=True, name="synapse-warmup").start()
    yield


def _warmup_services() -> None:
    from app.services import llm

    llm.startup_warmup()


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(subjects.router, prefix="/api")
app.include_router(lectures.router, prefix="/api")


@app.get("/api/health")
def health() -> dict:
    from app.services import ai

    return {
        "status": "ok",
        "app": settings.app_name,
        "ai": ai.ai_status(),
    }


@app.get("/api/ai/diagnose")
def ai_diagnose() -> dict:
    """Probe every AI engine and report what actually answers from this network."""
    from app.services import ai

    return ai.diagnose()
