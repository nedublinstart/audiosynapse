"""Lightweight SQLite migrations for additive columns."""

from __future__ import annotations

import logging

from sqlalchemy import inspect, text

from app.core.database import engine

logger = logging.getLogger("synapse.migrations")

_LECTURE_COLUMNS: dict[str, str] = {
    "processing_stage": "VARCHAR(64)",
    "processing_progress": "INTEGER DEFAULT 0",
    "processing_message": "TEXT",
    "audio_size_bytes": "INTEGER",
}

_CHAT_COLUMNS: dict[str, str] = {
    "source": "VARCHAR(16) DEFAULT 'ai'",
}


def run_migrations() -> None:
    insp = inspect(engine)
    if insp.has_table("lectures"):
        existing = {c["name"] for c in insp.get_columns("lectures")}
        with engine.begin() as conn:
            for name, col_type in _LECTURE_COLUMNS.items():
                if name in existing:
                    continue
                conn.execute(text(f"ALTER TABLE lectures ADD COLUMN {name} {col_type}"))
                logger.info("migration: added lectures.%s", name)

    if not insp.has_table("chat_messages"):
        return
    existing_chat = {c["name"] for c in insp.get_columns("chat_messages")}
    with engine.begin() as conn:
        for name, col_type in _CHAT_COLUMNS.items():
            if name in existing_chat:
                continue
            conn.execute(text(f"ALTER TABLE chat_messages ADD COLUMN {name} {col_type}"))
            logger.info("migration: added chat_messages.%s", name)
