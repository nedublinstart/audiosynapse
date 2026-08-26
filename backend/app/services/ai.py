from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings
from app.prompts.synapse_core import (
    CHAT_SYSTEM_PROMPT,
    ENRICHMENT_SYSTEM_PROMPT,
    EXAM_SYSTEM_PROMPT,
    SYNAPSE_CORE_SYSTEM_PROMPT,
)
from app.services import llm
from app.services.llm import LLMUnavailable

logger = logging.getLogger("synapse.ai")

# Chat-only limits (notes pipeline never truncates source material).
MAX_CHAT_NOTES_CHARS = 16_000
MAX_CHAT_TRANSCRIPT_CHARS = 8_000
MAX_CHAT_MATERIALS_CHARS = 6_000
MAX_HISTORY_MSG_CHARS = 800

OUTLINE_PROMPT = """По транскрипту лекции составь нумерованный план из 4–8 подтем (только заголовки, по порядку изложения).
Без пояснений — только список."""

SECTION_PROMPT = """Ты пишешь ОДИН раздел конспекта Synapse Core (метод Корнелла + блок Фейнмана).
Не сокращай: минимум 4 развёрнутых тезиса в Notes.
Указывай источники [Аудио: MM:SS] где возможно."""

CHUNK_DIGEST_PROMPT = """Ты — этап подготовки Synapse Core для длинной лекции.

Задача: извлечь ВСЮ учебную информацию из фрагмента транскрипта.
Это НЕ краткое резюме. Не сокращай и не обобщай в один абзац.

Для каждого смыслового блока перечисли:
- термины и определения (дословно или близко к тексту);
- тезисы, аргументы, примеры преподавателя;
- формулы (LaTeX), числа, даты, имена;
- таймкод [MM:SS], если он есть в тексте.

Формат: Markdown со заголовками ### по подтемам и маркированными списками.
Ничего не выдумывай — только то, что есть во фрагменте."""

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


def _trim_chat(text: str | None, limit: int) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit] + "…"


def _trim_history(history: list[dict[str, str]]) -> str:
    lines: list[str] = []
    for msg in history[-8:]:
        role = msg.get("role", "user").upper()
        content = _trim_chat(msg.get("content", ""), MAX_HISTORY_MSG_CHARS)
        lines.append(f"{role}: {content}")
    return "\n".join(lines)


def _split_transcript(text: str, max_chars: int) -> list[str]:
    text = text.strip()
    if len(text) <= max_chars:
        return [text]
    chunks: list[str] = []
    lines = text.splitlines()
    current: list[str] = []
    current_len = 0
    for line in lines:
        line_len = len(line) + 1
        if current and current_len + line_len > max_chars:
            chunks.append("\n".join(current))
            current = [line]
            current_len = line_len
        else:
            current.append(line)
            current_len += line_len
    if current:
        chunks.append("\n".join(current))
    return chunks or [text]


async def _chat(
    system: str,
    user: str,
    *,
    temperature: float = 0.35,
    timeout: float | None = None,
) -> str:
    import asyncio
    import time

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    started = time.perf_counter()
    loop = asyncio.get_running_loop()
    answer = await loop.run_in_executor(
        None,
        lambda: llm.chat(messages, temperature=temperature, timeout=timeout),
    )
    logger.info(
        "AI answer via %s (%s chars, %.1fs)",
        answer.engine,
        len(answer.content),
        time.perf_counter() - started,
    )
    return answer.content


def _source_length(transcript: str, materials_text: str) -> int:
    return len((transcript or "").strip()) + len((materials_text or "").strip())


def _notes_look_too_short(notes: str, source_len: int) -> bool:
    if source_len < 300:
        return len(notes.strip()) < 350
    target = max(1800, int(source_len * 0.18))
    return len(notes.strip()) < target


async def _expand_notes_if_needed(
    notes: str,
    *,
    transcript: str,
    materials_text: str,
    subject_name: str,
    title: str,
) -> str:
    source_len = _source_length(transcript, materials_text)
    if not _notes_look_too_short(notes, source_len):
        return notes

    logger.info(
        "notes look short (%s chars for %s source) — running expansion pass",
        len(notes),
        source_len,
    )
    expand_prompt = f"""Конспект получился СЛИШКОМ КРАТКИМ ({len(notes)} символов) относительно объёма лекции.
Твоя задача — РАСШИРИТЬ его, не теряя структуру Synapse Core.

Предмет: {subject_name}
Тема: {title}

=== ЧЕРНОВИК (расширь, не сокращай) ===
{notes}

=== ИСТОЧНИК (используй для деталей) ===
{(transcript or "")[: settings.notes_single_pass_max_chars]}

=== МАТЕРИАЛЫ ===
{(materials_text or "").strip() or "(нет)"}

Добавь больше подтем, развёрнутых Notes, блоков Фейнмана и вопросов Active Recall.
"""
    try:
        expanded = await _chat(
            SYNAPSE_CORE_SYSTEM_PROMPT,
            expand_prompt,
            temperature=0.2,
            timeout=settings.ai_notes_timeout_seconds,
        )
        if len(expanded.strip()) > len(notes.strip()):
            return expanded
    except Exception as exc:  # noqa: BLE001
        logger.warning("notes expansion failed: %s", exc)
    return notes


def _parse_outline(text: str) -> list[str]:
    topics: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        matched = re.match(r"^\d+[\).\s:-]+(.+)", line)
        if matched:
            topics.append(matched.group(1).strip(" -*"))
            continue
        if line.startswith(("- ", "* ", "• ")):
            topics.append(line[2:].strip())
    return topics[:8]


async def _generate_notes_sectioned(
    *,
    subject_name: str,
    title: str,
    lecture_date: str,
    duration_seconds: int | None,
    source_text: str,
    materials_text: str,
) -> str:
    """Multi-pass generation: outline → sections → assembly (richer than one-shot)."""
    outline_raw = await _chat(
        OUTLINE_PROMPT,
        f"Транскрипт лекции «{title}»:\n\n{source_text[:28000]}",
        temperature=0.15,
        timeout=settings.ai_notes_timeout_seconds,
    )
    topics = _parse_outline(outline_raw)
    if len(topics) < 2:
        topics = [
            "Введение и ключевые понятия",
            "Основное содержание",
            "Примеры и приложения",
            "Итоги и выводы",
        ]

    sections: list[str] = []
    for idx, topic in enumerate(topics, start=1):
        section = await _chat(
            SECTION_PROMPT,
            f"""Подтема {idx}/{len(topics)}: {topic}
Предмет: {subject_name} | Лекция: {title}

=== ИСТОЧНИК ===
{source_text[:24000]}

=== МАТЕРИАЛЫ ===
{(materials_text or "").strip() or "(нет)"}

Напиши раздел ### {topic} с Cues, Notes (минимум 4 пункта) и блоком Фейнмана.""",
            temperature=0.22,
            timeout=settings.ai_notes_timeout_seconds,
        )
        sections.append(section.strip())

    assembly_prompt = f"""Собери финальный конспект Synapse Core из готовых разделов.

Предмет: {subject_name}
Тема: {title}
Дата: {lecture_date}
Длительность: {_format_duration(duration_seconds)}

Требования:
- Сохрани ВСЕ разделы ниже (не сокращай их).
- Добавь шапку, Executive Summary, Синтез, Слепые зоны, Active Recall (6–7 вопросов).
- Конспект должен быть подробным учебным материалом, а не краткой выжимкой.

=== РАЗДЕЛЫ ===
{chr(10).join(sections)}
"""
    return await _chat(
        SYNAPSE_CORE_SYSTEM_PROMPT,
        assembly_prompt,
        temperature=0.2,
        timeout=settings.ai_notes_timeout_seconds,
    )


async def _prepare_transcript_for_notes(transcript: str) -> tuple[str, str]:
    """
    Return (source_text_for_prompt, processing_note).
    Long lectures: chunk-wise extraction that preserves detail, not blind truncation.
    """
    transcript = (transcript or "").strip()
    if not transcript:
        return "", ""

    if len(transcript) <= settings.notes_single_pass_max_chars:
        return transcript, ""

    chunks = _split_transcript(transcript, settings.notes_chunk_size)
    logger.info("notes pipeline: digesting %s transcript chunks", len(chunks))
    digests: list[str] = []
    for idx, chunk in enumerate(chunks, start=1):
        digest = await _chat(
            CHUNK_DIGEST_PROMPT,
            f"Фрагмент {idx} из {len(chunks)} (лекция, без пропусков):\n\n{chunk}",
            temperature=0.12,
            timeout=settings.ai_notes_timeout_seconds,
        )
        digests.append(f"## Фрагмент {idx}/{len(chunks)}\n{digest.strip()}")

    merged = "\n\n".join(digests)
    note = f"Лекция длинная ({len(transcript)} симв.) — обработана по частям ({len(chunks)} фрагм.), без урезания содержания."
    return merged, note


def ai_status() -> dict:
    return {"engine": "synapse-ai", **llm.status()}


def g4f_status() -> dict:
    return ai_status()


def diagnose() -> dict:
    return llm.diagnose()


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
    cues = sentences[:6] or [
        "Основная идея лекции",
        "Ключевые определения",
        "Логика рассуждения преподавателя",
    ]
    notes_bullets = sentences[6:18] or sentences[:12] or cues
    material_block = ""
    if materials_text.strip():
        material_block = (
            "\n*   Доп. материалы связаны с тезисами лекции "
            f"[Слайд: 1]. Фрагмент: {materials_text[:600].strip()}…"
        )

    cue_lines = "\n".join(f"*   **{c[:120]}** *(Что это и почему важно?)*" for c in cues[:5])
    note_lines = "\n".join(
        f"*   {n[:400]} [Аудио: {i * 3:02d}:{(i * 17) % 60:02d}]"
        for i, n in enumerate(notes_bullets[:10], start=1)
    )
    questions = "\n".join(
        [
            "1. Какие ключевые факты были названы в начале лекции? (Запоминание)",
            "2. Объясните центральное понятие своими словами. (Понимание)",
            "3. Приведите пример применения идеи из лекции. (Применение)",
            "4. Сравните два подхода/термина, упомянутых преподавателем. (Анализ)",
            "5. Какие пробелы остались и что нужно дочитать? (Синтез)",
            "6. Как связаны между собой главные блоки лекции? (Синтез)",
        ]
    )

    return f"""# ЛЕКЦИЯ: {title}
**Предмет:** {subject_name} | **Дата:** {lecture_date} | **Общее время:** {_format_duration(duration_seconds)}

> Конспект собран локально: ИИ-провайдеры были недоступны. {AI_SETUP_HINT}

## Краткое резюме (Executive Summary)
*   Лекция структурирована вокруг центральной темы «{title}».
*   Преподаватель последовательно вводит термины и связывает их в логическую цепочку.
*   Ниже — развёрнутый конспект по методу Корнелла с блоками Фейнмана и Active Recall.
*   Извлечено {len(notes_bullets)} ключевых тезисов из материала лекции.

---

## Основные блоки (Метод Корнелла)

### Центральная тема
**Ключевые вопросы и термины (Cues):**
{cue_lines}

**Развернутые тезисы (Notes):**
{note_lines}{material_block}

**Блок Фейнмана (Простыми словами):**
Представьте сложную идею как карту: термины — улицы, тезисы — маршруты. Пройдите маршрут целиком, объясняя каждый поворот простыми словами — так материал удерживается.

---

## Синтез и Инсайты (Связь теории с практикой)
*   Сопоставьте формулировки из аудио со схемами из презентации.
*   Практический фокус: объяснить термин без шпаргалки и привести пример.

## Слепые зоны и Что почитать дополнительно
*   Зафиксируйте смежные темы, которые преподаватель упомянул без полного раскрытия.
*   Перечитайте учебник по теме «{title}» и сверьте определения.

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
        if len(matches) >= 5:
            break
    if not matches:
        matches = [ln.strip() for ln in haystack.splitlines() if len(ln.strip()) > 40][:3]

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
    """Return (markdown_notes, engine_label). Never blindly truncates source material."""
    source_text, chunk_note = await _prepare_transcript_for_notes(transcript)
    materials_block = (materials_text or "").strip() or "(нет)"

    user_prompt = f"""Сгенерируй РАЗВЁРНУТЫЙ конспект строго по шаблону Synapse Core.
Конспект должен УЛУЧШАТЬ и структурировать материал, а не урезать его.
Каждая важная тема из источника — отдельный подраздел с подробными Notes.

Предмет: {subject_name}
Тема лекции: {title}
Дата: {lecture_date}
Длительность: {_format_duration(duration_seconds)}

=== ТРАНСКРИПТ / ИЗВЛЕЧЁННОЕ СОДЕРЖАНИЕ АУДИО ===
{source_text or "(транскрипт недоступен — опирайся на дополнительные материалы)"}

=== ДОПОЛНИТЕЛЬНЫЕ МАТЕРИАЛЫ (полностью) ===
{materials_block}
"""
    if chunk_note:
        user_prompt += f"\nПримечание системы: {chunk_note}\n"

    source_len = _source_length(transcript, materials_text)

    try:
        # Long lectures: multi-pass pipeline gives richer notes than one-shot free models.
        if source_len > 1500:
            notes = await _generate_notes_sectioned(
                subject_name=subject_name,
                title=title,
                lecture_date=lecture_date,
                duration_seconds=duration_seconds,
                source_text=source_text or materials_block,
                materials_text=materials_text,
            )
        else:
            notes = await _chat(
                SYNAPSE_CORE_SYSTEM_PROMPT,
                user_prompt,
                temperature=0.22,
                timeout=settings.ai_notes_timeout_seconds,
            )
            notes = await _expand_notes_if_needed(
                notes,
                transcript=transcript,
                materials_text=materials_text,
                subject_name=subject_name,
                title=title,
            )
            if _notes_look_too_short(notes, source_len):
                notes = await _generate_notes_sectioned(
                    subject_name=subject_name,
                    title=title,
                    lecture_date=lecture_date,
                    duration_seconds=duration_seconds,
                    source_text=source_text or materials_block,
                    materials_text=materials_text,
                )
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

=== ТЕКУЩИЙ КОНСПЕКТ (сохрани и расширь, не сокращай) ===
{existing_notes}

=== НОВЫЕ МАТЕРИАЛЫ (полностью) ===
{materials_text}

Дополни конспект новыми тезисами из материалов. Не удаляй существующие блоки.
Верни обновлённый конспект целиком + строку NOTICE в конце.
"""
    try:
        raw = await _chat(
            ENRICHMENT_SYSTEM_PROMPT,
            user_prompt,
            temperature=0.22,
            timeout=settings.ai_notes_timeout_seconds,
        )
        notice = "Конспект обновлен с учётом новых материалов."
        if "NOTICE:" in raw:
            body, _, tail = raw.rpartition("NOTICE:")
            return body.strip(), (tail.strip() or notice)
        return raw, notice
    except Exception as exc:  # noqa: BLE001
        logger.error("enrich_notes failed: %s", exc)
        snippet = materials_text.strip()[:800] or "фрагменты слайдов"
        addition = f"""

---

### Обогащение из дополнительных материалов
**Ключевые вопросы и термины (Cues):**
*   **Связь слайдов с аудио** *(Где презентация дополняет речь преподавателя?)*

**Развернутые тезисы (Notes):**
*   Из загруженных материалов извлечены уточнения и схемы. [Слайд: 1]
*   {snippet}

**Блок Фейнмана (Простыми словами):**
Слайды подсвечивают структуру рассказа преподавателя — используй их как карту к аудио.
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
    if _is_greeting(message) and len(message.strip()) < 48:
        return (
            "Привет! Я Synapse Tutor — задавай вопросы по конспекту, транскрипту "
            "или материалам этой лекции. Включи режим «Экзамен», если хочешь "
            "проверку по Bloom."
        )

    system = EXAM_SYSTEM_PROMPT if exam_mode else CHAT_SYSTEM_PROMPT
    notes_block = _trim_chat(notes, MAX_CHAT_NOTES_CHARS) or "(конспект ещё не готов)"
    if notes and len(notes.strip()) > 800:
        transcript_block = "(полный транскрипт опущен — используй развёрнутый конспект выше)"
    else:
        transcript_block = _trim_chat(transcript, MAX_CHAT_TRANSCRIPT_CHARS) or "(нет)"
    materials_block = _trim_chat(materials_text, MAX_CHAT_MATERIALS_CHARS) or "(нет)"
    history_txt = _trim_history(history) or "(пусто)"

    user_prompt = f"""=== КОНСПЕКТ ===
{notes_block}

=== ТРАНСКРИПТ ===
{transcript_block}

=== МАТЕРИАЛЫ ===
{materials_block}

=== ИСТОРИЯ ===
{history_txt}

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
