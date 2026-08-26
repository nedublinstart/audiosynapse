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


def run_migrations() -> None:
    insp = inspect(engine)
    if not insp.has_table("lectures"):
        return
    existing = {c["name"] for c in insp.get_columns("lectures")}
    with engine.begin() as conn:
        for name, col_type in _LECTURE_COLUMNS.items():
            if name in existing:
                continue
            conn.execute(text(f"ALTER TABLE lectures ADD COLUMN {name} {col_type}"))
            logger.info("migration: added lectures.%s", name)
