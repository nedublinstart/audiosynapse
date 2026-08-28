"""Chat rate limits and lecture-context guards."""

from __future__ import annotations

import re
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, status

from app.core.config import settings
from app.models import Lecture, LectureStatus

# user_id -> deque[timestamp] of recent chat sends (global per user)
_user_timestamps: dict[int, deque[float]] = defaultdict(deque)
# (user_id, lecture_id) -> last send timestamp
_pair_last: dict[tuple[int, int], float] = {}
_lock = threading.Lock()

_GREETING = re.compile(
    r"^(?:привет|здравствуй|здравствуйте|hi|hello|hey|йо|ку|добрый\s+(?:день|вечер|утро))[\s!?.]*$",
    re.I,
)


def _is_greeting(message: str) -> bool:
    text = message.strip()
    return bool(text) and (len(text) < 48 and bool(_GREETING.match(text)))


def lecture_has_chat_context(lecture: Lecture, materials_text: str) -> bool:
    """True when there is something to answer from besides greetings."""
    if (lecture.notes_markdown or "").strip():
        return True
    if (lecture.transcript or "").strip():
        return True
    if materials_text.strip():
        return True
    return False


def assert_chat_allowed(
    *,
    user_id: int,
    lecture: Lecture,
    message: str,
    materials_text: str,
) -> None:
    """Raise HTTPException when chat must be blocked."""
    text = message.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Введите сообщение")

    if len(text) > settings.chat_max_message_chars:
        raise HTTPException(
            status_code=400,
            detail=f"Слишком длинное сообщение (максимум {settings.chat_max_message_chars} символов)",
        )

    if lecture.status == LectureStatus.processing:
        raise HTTPException(
            status_code=409,
            detail="Лекция ещё обрабатывается — дождитесь конспекта и попробуйте снова",
        )

    if not _is_greeting(text) and not lecture_has_chat_context(lecture, materials_text):
        raise HTTPException(
            status_code=409,
            detail="Нет материалов для ответа — загрузите аудио или PDF/DOCX и дождитесь конспекта",
        )

    now = time.monotonic()
    with _lock:
        pair_key = (user_id, lecture.id)
        last = _pair_last.get(pair_key)
        if last is not None and now - last < settings.chat_min_interval_seconds:
            wait = settings.chat_min_interval_seconds - (now - last)
            raise HTTPException(
                status_code=429,
                detail=f"Подождите {max(1, int(wait + 0.5))} с перед следующим сообщением",
            )

        bucket = _user_timestamps[user_id]
        window = settings.chat_rate_window_seconds
        while bucket and now - bucket[0] > window:
            bucket.popleft()
        if len(bucket) >= settings.chat_rate_limit_per_window:
            raise HTTPException(
                status_code=429,
                detail="Слишком много сообщений — сделайте паузу на минуту",
            )

        bucket.append(now)
        _pair_last[pair_key] = now


def trim_chat_history_rows(rows: list, *, max_messages: int) -> list:
    """Keep only the most recent messages for context (excluding current)."""
    if len(rows) <= max_messages:
        return rows
    return rows[-max_messages:]
