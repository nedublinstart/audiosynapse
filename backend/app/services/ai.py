from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path

from app.prompts.synapse_core import (
    CHAT_SYSTEM_PROMPT,
    ENRICHMENT_SYSTEM_PROMPT,
    EXAM_SYSTEM_PROMPT,
    SYNAPSE_CORE_SYSTEM_PROMPT,
)
from app.services import llm
from app.services.llm import LLMUnavailable

logger = logging.getLogger("synapse.ai")

AI_SETUP_HINT = (
    "Похоже, бесплатные ИИ-провайдеры недоступны из твоей сети. "
    "Проверь командой `npm run ai-check` и при необходимости добавь свой ключ "
    "(AI_BASE_URL / AI_API_KEY / AI_MODEL в backend/.env) — см. FIX_WINDOWS.txt."
)


class TranscriptionUnavailable(RuntimeError):
    """Audio could not be transcribed by any engine."""


@dataclass
class TranscriptResult:
    text: str
    duration_seconds: int | None
    engine: str


def _format_duration(seconds: int | None) -> str:
    if not seconds:
        return "н/д"
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h} ч {m} мин"
    return f"{m} мин"


async def _chat(system: str, user: str, *, temperature: float = 0.35) -> str:
    import asyncio

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    loop = asyncio.get_running_loop()
    answer = await loop.run_in_executor(None, lambda: llm.chat(messages, temperature=temperature))
    logger.info("AI answer via %s (%s chars)", answer.engine, len(answer.content))
    return answer.content


def ai_status() -> dict:
    return {"engine": "synapse-ai", **llm.status()}


# Kept for backwards compatibility with earlier /api/health consumers.
def g4f_status() -> dict:
    return ai_status()


def diagnose() -> dict:
    return llm.diagnose()


# --------------------------------------------------------------------------- #
# Offline fallbacks
# --------------------------------------------------------------------------- #


def build_demo_notes(
    *,
    subject_name: str,
    title: str,
    lecture_date: str,
    duration_seconds: int | None,
    transcript: str,
    materials_text: str = "",
) -> str:
    """Cornell-style notes assembled locally when every AI engine fails."""
    source = f"{transcript}\n{materials_text}".strip()
    cleaned = re.sub(r"\s+", " ", source).strip()
    sentences = [s.strip() for s in re.split(r"[.!?]+", cleaned) if len(s.strip()) > 20]
    cues = sentences[:4] or [
        "Основная идея лекции",
        "Ключевые определения",
        "Логика рассуждения преподавателя",
    ]
    notes_bullets = sentences[4:10] or cues
    material_block = ""
    if materials_text.strip():
        material_block = (
            "\n*   Доп. материалы связаны с тезисами лекции "
            f"[Слайд: 1]. Фрагмент: {materials_text[:280].strip()}…"
        )

    cue_lines = "\n".join(f"*   **{c[:80]}** *(Что это и почему важно?)*" for c in cues[:3])
    note_lines = "\n".join(
        f"*   {n[:220]} [Аудио: {i * 3:02d}:{(i * 17) % 60:02d}]"
        for i, n in enumerate(notes_bullets[:5], start=1)
    )
    questions = "\n".join(
        [
            "1. Какие ключевые факты были названы в начале лекции? (Запоминание)",
            "2. Объясните центральное понятие своими словами. (Понимание)",
            "3. Приведите пример применения идеи из лекции. (Применение)",
            "4. Сравните два подхода/термина, упомянутых преподавателем. (Анализ)",
            "5. Какие пробелы остались и что нужно дочитать? (Синтез)",
        ]
    )

    return f"""# ЛЕКЦИЯ: {title}
**Предмет:** {subject_name} | **Дата:** {lecture_date} | **Общее время:** {_format_duration(duration_seconds)}

> Конспект собран локально: ИИ-провайдеры были недоступны. {AI_SETUP_HINT}

## Краткое резюме (Executive Summary)
*   Лекция структурирована вокруг центральной темы «{title}».
*   Преподаватель последовательно вводит термины и связывает их в логическую цепочку.
*   Для закрепления важны определения, причинно-следственные связи и примеры.
*   Ниже — конспект по методу Корнелла с блоками Фейнмана и Active Recall.

---

## Основные блоки (Метод Корнелла)

### Центральная тема
**Ключевые вопросы и термины (Cues):**
{cue_lines}

**Развернутые тезисы (Notes):**
{note_lines}{material_block}

**Блок Фейнмана (Простыми словами):**
Представьте, что сложная идея — это карта города: термины — названия улиц, а тезисы — маршруты между ними. Сначала выучите «улицы», потом пройдите «маршрут» целиком — так материал удерживается дольше.

---

## Синтез и Инсайты (Связь теории с практикой)
*   Теоретические формулировки из аудио стоит сопоставлять со схемами/списками из презентации.
*   Практический фокус: уметь объяснить термин без шпаргалки и привести хотя бы один пример применения.

## Слепые зоны и Что почитать дополнительно
*   Преподаватель мог упомянуть смежные теории без полного раскрытия — зафиксируйте их как точки для доработки.
*   Рекомендуется перечитать базовый учебник по теме «{title}» и сверить определения.
*   Если есть презентация, отдельно просмотрите слайды с формулами/схемами.

## Active Recall (Вопросы для самопроверки)
{questions}
"""


def _is_greeting(message: str) -> bool:
    text = re.sub(r"[^\w\sа-яА-ЯёЁ]", "", message.lower()).strip()
    greetings = {
        "привет",
        "приветик",
        "здравствуй",
        "здравствуйте",
        "добрый день",
        "доброе утро",
        "добрый вечер",
        "хай",
        "hello",
        "hi",
        "hey",
        "ку",
        "йо",
    }
    if text in greetings:
        return True
    return any(text.startswith(g + " ") for g in greetings)


def _offline_chat_reply(
    message: str,
    *,
    exam_mode: bool,
    notes: str,
    transcript: str | None,
    materials_text: str,
) -> str:
    if _is_greeting(message):
        return (
            "Привет! Я Synapse Tutor. Отвечаю пока в локальном режиме — "
            "онлайн-модели недоступны.\n\n"
            f"{AI_SETUP_HINT}\n\n"
            "Спросить по материалам лекции всё равно можно: например «главные термины» "
            "или «что было в начале лекции»."
        )

    haystack = "\n".join(filter(None, [notes or "", transcript or "", materials_text]))
    lowered = message.lower()

    if exam_mode or "вопрос" in lowered or "экзамен" in lowered:
        return (
            "Режим «Экзамен», локальный вариант (онлайн-модели недоступны).\n\n"
            "1. Назовите 3 ключевых термина из конспекта. (Запоминание)\n"
            "2. Объясните один термин техникой Фейнмана. (Понимание)\n"
            "3. Приведите пример применения идеи из лекции. (Применение)\n"
            "4. Где в материале «слепая зона» и что дочитать? (Анализ)\n\n"
            f"{AI_SETUP_HINT}"
        )

    keywords = [tok for tok in re.split(r"\W+", lowered) if len(tok) > 3]
    matches: list[str] = []
    for line in haystack.splitlines():
        low = line.lower()
        if any(tok in low for tok in keywords):
            stripped = line.strip()
            if len(stripped) > 15:
                matches.append(stripped)
        if len(matches) >= 3:
            break
    if not matches:
        matches = [ln.strip() for ln in haystack.splitlines() if len(ln.strip()) > 40][:2]

    if matches:
        body = "\n\n".join(matches)
        return f"Локальный режим (онлайн-модели недоступны). Нашёл в материалах лекции:\n\n{body}\n\n[Конспект]\n\n{AI_SETUP_HINT}"

    return (
        "Онлайн-модели сейчас недоступны, а в материалах этой лекции пока нет текста, "
        "по которому можно ответить.\n\n"
        "Что поможет: загрузи аудио или PDF/DOCX со слайдами, дождись готового конспекта — "
        "и спроси снова.\n\n"
        f"{AI_SETUP_HINT}"
    )


# --------------------------------------------------------------------------- #
# Public pipeline
# --------------------------------------------------------------------------- #


async def transcribe_audio(audio_path: Path, filename: str) -> TranscriptResult:
    """Transcribe lecture audio; raises TranscriptionUnavailable if no engine works."""
    import asyncio

    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(None, lambda: llm.transcribe(audio_path, filename))
    except LLMUnavailable as exc:
        raise TranscriptionUnavailable(str(exc)) from exc

    return TranscriptResult(
        text=result.text,
        duration_seconds=result.duration_seconds,
        engine=result.engine,
    )


async def generate_notes(
    *,
    subject_name: str,
    title: str,
    lecture_date: str,
    duration_seconds: int | None,
    transcript: str,
    materials_text: str = "",
) -> tuple[str, str]:
    """Return (markdown_notes, engine_label)."""
    user_prompt = f"""Сгенерируй конспект строго по шаблону Synapse Core.

Предмет: {subject_name}
Тема лекции: {title}
Дата: {lecture_date}
Длительность: {_format_duration(duration_seconds)}

=== ТРАНСКРИПТ АУДИО ===
{transcript or "(транскрипт недоступен — опирайся на дополнительные материалы)"}

=== ДОПОЛНИТЕЛЬНЫЕ МАТЕРИАЛЫ ===
{materials_text or "(нет)"}
"""
    try:
        notes = await _chat(SYNAPSE_CORE_SYSTEM_PROMPT, user_prompt, temperature=0.25)
        return notes, "ai"
    except Exception as exc:  # noqa: BLE001
        logger.error("generate_notes failed: %s", exc)
        return (
            build_demo_notes(
                subject_name=subject_name,
                title=title,
                lecture_date=lecture_date,
                duration_seconds=duration_seconds,
                transcript=transcript,
                materials_text=materials_text,
            ),
            "local",
        )


async def enrich_notes(
    *,
    existing_notes: str,
    materials_text: str,
    subject_name: str,
    title: str,
) -> tuple[str, str]:
    user_prompt = f"""Предмет: {subject_name}
Лекция: {title}

=== ТЕКУЩИЙ КОНСПЕКТ ===
{existing_notes}

=== НОВЫЕ МАТЕРИАЛЫ ===
{materials_text}

Верни обновлённый конспект целиком + строку NOTICE в конце.
"""
    try:
        raw = await _chat(ENRICHMENT_SYSTEM_PROMPT, user_prompt, temperature=0.25)
        notice = "Конспект обновлен с учётом новых материалов."
        if "NOTICE:" in raw:
            body, _, tail = raw.rpartition("NOTICE:")
            return body.strip(), (tail.strip() or notice)
        return raw, notice
    except Exception as exc:  # noqa: BLE001
        logger.error("enrich_notes failed: %s", exc)
        snippet = materials_text.strip()[:500] or "фрагменты слайдов"
        addition = f"""

---

### Обогащение из дополнительных материалов
**Ключевые вопросы и термины (Cues):**
*   **Связь слайдов с аудио** *(Где презентация дополняет речь преподавателя?)*

**Развернутые тезисы (Notes):**
*   Из загруженных материалов извлечены уточнения и схемы. [Слайд: 1]
*   Фрагмент: {snippet}

**Блок Фейнмана (Простыми словами):**
Слайды — это «иллюстрации» к рассказу преподавателя: они не заменяют аудио, а подсвечивают структуру.
"""
        return (
            existing_notes.rstrip() + addition,
            "Материалы добавлены локально: ИИ был недоступен. " + AI_SETUP_HINT,
        )


async def chat_about_lecture(
    *,
    message: str,
    exam_mode: bool,
    notes: str,
    transcript: str | None,
    materials_text: str,
    history: list[dict[str, str]],
) -> str:
    system = EXAM_SYSTEM_PROMPT if exam_mode else CHAT_SYSTEM_PROMPT
    history_txt = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in history[-8:])
    user_prompt = f"""=== КОНСПЕКТ ===
{notes or "(конспект ещё не готов)"}

=== ТРАНСКРИПТ ===
{transcript or "(нет)"}

=== МАТЕРИАЛЫ ===
{materials_text or "(нет)"}

=== ИСТОРИЯ ===
{history_txt or "(пусто)"}

=== ВОПРОС СТУДЕНТА ===
{message}
"""
    try:
        return await _chat(system, user_prompt, temperature=0.4)
    except Exception as exc:  # noqa: BLE001
        logger.error("chat failed: %s", exc)
        return _offline_chat_reply(
            message,
            exam_mode=exam_mode,
            notes=notes,
            transcript=transcript,
            materials_text=materials_text,
        )
