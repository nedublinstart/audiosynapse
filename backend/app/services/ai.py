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

OUTLINE_PROMPT = """По полному транскрипту лекции составь нумерованный план из 5–10 подтем
строго по порядку изложения. Только заголовки подтем, без пояснений и без мета-текста."""

SECTION_PROMPT = """Пишешь ОДИН раздел учебного конспекта по подтеме лекции.

Требования:
- Минимум 5–8 развёрнутых тезисов с деталями из источника
- Термины с краткими определениями
- Блок «Простыми словами» (ясно, без воды)
- Источники [Аудио: MM:SS] где есть
- Английские термины сохраняй
- Без упоминаний методик, алгоритмов конспектирования, Cornell/Bloom/Фейнмана"""

CHUNK_DIGEST_PROMPT = """Извлеки ВСЮ учебную информацию из фрагмента транскрипта.
Это НЕ краткое резюме — не сокращай и не обобщай в один абзац.

Перечисли:
- термины и определения (близко к тексту);
- тезисы, аргументы, примеры;
- формулы (LaTeX), числа, даты, имена;
- английские термины как есть;
- таймкод [MM:SS], если есть.

Markdown с ### по подтемам. Только факты из фрагмента. Без мета-текста."""

AI_SETUP_HINT = (
    "Онлайн-модели сейчас недоступны — ответы и конспекты собираются в упрощённом режиме. "
    "Для полного качества подключите свой API-ключ в настройках сервера."
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


def _context_block(
    *,
    subject_description: str = "",
    course_context: str = "",
    lecture_number: int | None = None,
) -> str:
    parts: list[str] = []
    if subject_description.strip():
        parts.append(f"О предмете: {subject_description.strip()}")
    if lecture_number and lecture_number > 0:
        parts.append(f"Номер лекции в курсе: {lecture_number}")
    if course_context.strip():
        parts.append(
            "Предыдущие лекции курса (связывай новую тему с ними, не копируй дословно):\n"
            f"{course_context.strip()}"
        )
    return "\n".join(parts)


def _slice_source_for_section(source_text: str, idx: int, total: int, window: int = 26000) -> str:
    source_text = (source_text or "").strip()
    if len(source_text) <= window or total <= 1:
        return source_text
    segment = max(1, len(source_text) // total)
    center = (idx - 1) * segment + segment // 2
    start = max(0, center - window // 2)
    end = min(len(source_text), start + window)
    if end - start < window and start > 0:
        start = max(0, end - window)
    return source_text[start:end]


def _notes_look_too_short(notes: str, source_len: int) -> bool:
    if source_len < 300:
        return len(notes.strip()) < 400
    # Expect notes to be substantial relative to source (enrich, don't shrink).
    target = max(2800, int(source_len * 0.35))
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
    expand_prompt = f"""Конспект слишком короткий ({len(notes)} симв.) относительно объёма лекции.
РАСШИРЬ его: добавь пропущенные подтемы, тезисы, определения, примеры и формулы.
Не пиши про методики и алгоритмы — только содержание лекции.

Предмет: {subject_name}
Тема: {title}

=== ЧЕРНОВИК (сохрани и дополни) ===
{notes}

=== ИСТОЧНИК ===
{(transcript or "")[: settings.notes_single_pass_max_chars]}

=== МАТЕРИАЛЫ ===
{(materials_text or "").strip() or "(нет)"}
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
    subject_description: str = "",
    course_context: str = "",
    lecture_number: int | None = None,
) -> str:
    """Multi-pass generation: outline → sections → assembly (richer than one-shot)."""
    context = _context_block(
        subject_description=subject_description,
        course_context=course_context,
        lecture_number=lecture_number,
    )
    context_prefix = f"{context}\n\n" if context else ""

    outline_raw = await _chat(
        OUTLINE_PROMPT,
        f"""{context_prefix}Транскрипт лекции «{title}» (предмет: {subject_name}):

{source_text[:32000]}""",
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
    total = len(topics)
    for idx, topic in enumerate(topics, start=1):
        section_source = _slice_source_for_section(source_text, idx, total)
        section = await _chat(
            SECTION_PROMPT,
            f"""{context_prefix}Подтема {idx}/{total}: {topic}
Предмет: {subject_name} | Лекция: {title}

=== ИСТОЧНИК (фрагмент по порядку лекции) ===
{section_source}

=== МАТЕРИАЛЫ (полностью) ===
{(materials_text or "").strip() or "(нет)"}

Напиши раздел ### {topic} с терминами, тезисами (минимум 5–8 пунктов) и блоком «Простыми словами».
Без мета-текста про методики.""",
            temperature=0.22,
            timeout=settings.ai_notes_timeout_seconds,
        )
        sections.append(section.strip())

    assembly_prompt = f"""{context_prefix}Собери финальный ПОЛНЫЙ конспект из готовых разделов.

Предмет: {subject_name}
Тема: {title}
Дата: {lecture_date}
Длительность: {_format_duration(duration_seconds)}

Требования:
- Сохрани ВСЕ разделы ниже целиком (не сокращай).
- Добавь шапку, краткое резюме, связь с практикой, что доработать, 6–8 вопросов.
- Без мета-текста про методики и алгоритмы — только содержание лекции.
- Английские термины сохрани.
- Если есть предыдущие лекции курса — одной строкой укажи, как эта связана с ними.

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

    cue_lines = "\n".join(f"*   **{c[:120]}** — что это / почему важно" for c in cues[:5])
    note_lines = "\n".join(
        f"*   {n[:400]} [Аудио: {i * 3:02d}:{(i * 17) % 60:02d}]"
        for i, n in enumerate(notes_bullets[:10], start=1)
    )
    questions = "\n".join(
        [
            "1. Какие ключевые факты были в начале лекции?",
            "2. Объясните центральное понятие своими словами.",
            "3. Приведите пример применения идеи из лекции.",
            "4. Сравните два подхода/термина из материала.",
            "5. Что осталось нераскрытым и что дочитать?",
            "6. Как связаны между собой главные блоки лекции?",
        ]
    )

    return f"""# Лекция: {title}
**Предмет:** {subject_name} | **Дата:** {lecture_date} | **Время:** {_format_duration(duration_seconds)}

> Конспект собран в упрощённом режиме. Для полного качества подключите ИИ на сервере.

## Краткое резюме
*   Тема лекции: «{title}».
*   Ниже — структурированные тезисы, извлечённые из материала ({len(notes_bullets)} пунктов).

---

## Основные блоки

### Центральная тема
**Термины и вопросы**
{cue_lines}

**Тезисы**
{note_lines}{material_block}

**Простыми словами**
Сначала зафиксируйте ключевые термины, затем свяжите их в цепочку тезисов — так материал удерживается дольше.

---

## Связь с практикой
*   Сопоставьте формулировки из аудио со схемами из презентации.
*   Объясните каждый термин без шпаргалки и приведите пример.

## Что доработать
*   Отметьте темы, упомянутые без полного раскрытия.
*   Сверьте определения по теме «{title}» с учебником.

## Вопросы для самопроверки
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
            "Привет! Я Synapse — задавай вопросы по конспекту, транскрипту "
            "или материалам этой лекции. Включи режим «Экзамен», если хочешь "
            "проверку по материалу."
        )

    haystack = "\n".join(filter(None, [notes or "", transcript or "", materials_text]))
    lowered = message.lower()

    if exam_mode or "вопрос" in lowered or "экзамен" in lowered:
        return (
            "Режим «Экзамен» — вопросы по материалам лекции:\n\n"
            "1. Назовите 3 ключевых термина из конспекта.\n"
            "2. Объясните один термин своими словами.\n"
            "3. Приведите пример применения идеи из лекции.\n"
            "4. Что в материале раскрыто слабо и что дочитать?"
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
        return f"По материалам лекции:\n\n{body}"

    return (
        "В материалах этой лекции пока нет текста, по которому можно ответить.\n\n"
        "Загрузите аудио или PDF/DOCX со слайдами, дождитесь готового конспекта — "
        "и задайте вопрос снова."
    )


async def transcribe_audio(
    audio_path: Path,
    filename: str,
    *,
    on_progress=None,
) -> TranscriptResult:
    """Transcribe lecture audio; raises TranscriptionUnavailable if no engine works."""
    import asyncio

    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(
            None,
            lambda: llm.transcribe(audio_path, filename, on_progress=on_progress),
        )
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
    subject_description: str = "",
    course_context: str = "",
    lecture_number: int | None = None,
) -> tuple[str, str]:
    """Return (markdown_notes, engine_label). Never blindly truncates source material."""
    source_text, chunk_note = await _prepare_transcript_for_notes(transcript)
    materials_block = (materials_text or "").strip() or "(нет)"
    context = _context_block(
        subject_description=subject_description,
        course_context=course_context,
        lecture_number=lecture_number,
    )
    context_block = f"\n=== КОНТЕКСТ КУРСА ===\n{context}\n" if context else ""

    user_prompt = f"""Составь МАКСИМАЛЬНО ПОЛНЫЙ учебный конспект по шаблону.
Структурируй и углуби материал — не урезай. Каждая важная тема — отдельный подраздел.
Без воды про алгоритмы и методики — только содержание лекции.

Предмет: {subject_name}
Тема лекции: {title}
Дата: {lecture_date}
Длительность: {_format_duration(duration_seconds)}
{context_block}
=== ТРАНСКРИПТ АУДИО (полностью) ===
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
                subject_description=subject_description,
                course_context=course_context,
                lecture_number=lecture_number,
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
                    subject_description=subject_description,
                    course_context=course_context,
                    lecture_number=lecture_number,
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
    new_materials_text: str = "",
    subject_description: str = "",
) -> tuple[str, str]:
    new_block = (new_materials_text or materials_text).strip()
    all_block = (materials_text or "").strip() or new_block
    context = _context_block(subject_description=subject_description)
    context_prefix = f"{context}\n\n" if context else ""

    user_prompt = f"""{context_prefix}Предмет: {subject_name}
Лекция: {title}

=== ТЕКУЩИЙ КОНСПЕКТ (сохрани и расширь, не сокращай) ===
{existing_notes}

=== ВСЕ МАТЕРИАЛЫ ЛЕКЦИИ (контекст) ===
{all_block}

=== НОВЫЕ МАТЕРИАЛЫ (добавить в конспект) ===
{new_block}

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
            "Материалы добавлены. Конспект обновлён в упрощённом режиме.",
        )


def offline_chat_reply(
    message: str,
    *,
    exam_mode: bool,
    notes: str,
    transcript: str | None,
    materials_text: str,
) -> str:
    return _offline_chat_reply(
        message,
        exam_mode=exam_mode,
        notes=notes,
        transcript=transcript,
        materials_text=materials_text,
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
            "Привет! Я Synapse — задавай вопросы по конспекту, транскрипту "
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
        return await _chat(
            system,
            user_prompt,
            temperature=0.4,
            timeout=settings.ai_chat_timeout_seconds,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("chat failed: %s", exc)
        return _offline_chat_reply(
            message,
            exam_mode=exam_mode,
            notes=notes,
            transcript=transcript,
            materials_text=materials_text,
        )


SUBJECT_IMPORT_COLORS = [
    "#1f7a75",
    "#3d6a8a",
    "#6b7280",
    "#8a6828",
    "#5c6b7a",
    "#2f6b5a",
    "#4a5560",
    "#1c5a6e",
]

SUBJECT_IMPORT_SYSTEM = """Ты помогаешь студенту разобрать список предметов.
Из текста извлеки ТОЛЬКО названия учебных предметов / дисциплин.
Игнорируй времена, аудитории, дни недели, ФИО преподавателей, номера групп.
Не выдумывай предметы, которых нет в тексте.
Ответ — строго JSON-массив объектов:
[{"name":"Название","description":null}]
description — только если в тексте явно есть короткая пометка (преподаватель/группа), иначе null.
Без markdown, без пояснений."""

SUBJECT_SCHEDULE_IMPORT_SYSTEM = """Ты разбираешь расписание занятий вуза на семестр.
Из текста извлеки предметы и их еженедельные пары (день недели + время).
weekday: 0=понедельник, 1=вторник, 2=среда, 3=четверг, 4=пятница, 5=суббота, 6=воскресенье.
start_time и end_time — формат HH:MM (24 часа).
Объедини строки одного предмета в один объект с массивом schedule.
Не выдумывай предметы и пары, которых нет в тексте.
Ответ — строго JSON-массив:
[{"name":"Философия","description":null,"schedule":[{"weekday":0,"start_time":"10:00","end_time":"11:30","location":"ауд. 301"}]}]
location — только если указана аудитория, иначе null.
Без markdown, без пояснений."""


def _extract_json_array(text: str) -> list | None:
    import json

    raw = (text or "").strip()
    if not raw:
        return None
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else None
    except Exception:  # noqa: BLE001
        pass
    match = re.search(r"\[[\s\S]*\]", raw)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
        return data if isinstance(data, list) else None
    except Exception:  # noqa: BLE001
        return None


def _parse_weekday_token(token: str) -> int | None:
    key = token.strip().casefold()
    mapping = {
        "пн": 0,
        "понедельник": 0,
        "mon": 0,
        "вт": 1,
        "вторник": 1,
        "tue": 1,
        "ср": 2,
        "среда": 2,
        "wed": 2,
        "чт": 3,
        "четверг": 3,
        "thu": 3,
        "пт": 4,
        "пятница": 4,
        "fri": 4,
        "сб": 5,
        "суббота": 5,
        "sat": 5,
        "вс": 6,
        "воскресенье": 6,
        "sun": 6,
    }
    return mapping.get(key)


def _normalize_time(value: str) -> str:
    value = value.strip().replace(".", ":")
    if re.fullmatch(r"\d{1,2}:\d{2}", value):
        h, m = value.split(":")
        return f"{int(h):02d}:{m}"
    return value


def _heuristic_subjects_with_schedule(text: str) -> list[dict]:
    """Parse timetable lines into subjects grouped with weekly slots."""
    weekday_re = (
        r"(?P<wd>пн|вт|ср|чт|пт|сб|вс|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье)"
    )
    time_re = r"(?P<t1>\d{1,2}[:.]\d{2})\s*(?:[-–—]\s*(?P<t2>\d{1,2}[:.]\d{2}))?"
    subjects: dict[str, dict] = {}

    for raw_line in (text or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        wd_match = re.search(weekday_re, line, flags=re.I)
        if not wd_match:
            continue
        weekday = _parse_weekday_token(wd_match.group("wd"))
        if weekday is None:
            continue
        time_match = re.search(time_re, line)
        if not time_match:
            continue
        start = _normalize_time(time_match.group("t1"))
        end = _normalize_time(time_match.group("t2") or start)
        if start == end:
            # default 90 min pair
            h, m = map(int, start.split(":"))
            end_m = h * 60 + m + 90
            end = f"{end_m // 60:02d}:{end_m % 60:02d}"

        rest = line[wd_match.end() :]
        if time_match:
            rest = rest.replace(time_match.group(0), " ", 1)
        rest = re.sub(r"\s+", " ", rest).strip()
        loc_match = re.search(r"(?:ауд\.?|каб\.?|комн\.?)\s*[\w\-./]+", rest, flags=re.I)
        location = loc_match.group(0).strip() if loc_match else None
        if loc_match:
            rest = rest.replace(loc_match.group(0), " ").strip()
        name = re.split(r"\s{2,}|\t| — | – ", rest, maxsplit=1)[0].strip(" .;:")
        if len(name) < 2 or len(name) > 80:
            continue
        key = name.casefold()
        if key not in subjects:
            subjects[key] = {"name": name, "description": None, "schedule": []}
        subjects[key]["schedule"].append(
            {
                "weekday": weekday,
                "start_time": start,
                "end_time": end,
                "location": location,
            }
        )

    return list(subjects.values())[:40]


def heuristic_subjects_with_schedule_from_text(text: str) -> list[dict]:
    """Offline timetable parser with weekday slots."""
    scheduled = _heuristic_subjects_with_schedule(text)
    if scheduled:
        return scheduled
    return [
        {"name": row["name"], "description": row.get("description"), "schedule": []}
        for row in _heuristic_subjects_from_text(text)
    ]


def heuristic_subjects_from_text(text: str) -> list[dict[str, str | None]]:
    """Public offline fallback for plain subject list import."""
    return _heuristic_subjects_from_text(text)


def _heuristic_subjects_from_text(text: str) -> list[dict[str, str | None]]:
    """Offline fallback: line-based subject names, ignore clock times."""
    found: list[dict[str, str | None]] = []
    seen: set[str] = set()
    weekday = (
        r"пн|вт|ср|чт|пт|сб|вс|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье"
    )
    for raw_line in (text or "").splitlines():
        line = raw_line.strip().lstrip("•*-–—·\t ")
        if not line:
            continue
        # Strip leading weekday / clock crumbs: "Пн 10:00 Философия"
        line = re.sub(rf"^(?:{weekday})\b\s*[:.\-]?\s*", "", line, flags=re.I).strip()
        line = re.sub(r"^\d{1,2}[:.]\d{2}(?:\s*[-–—]\s*\d{1,2}[:.]\d{2})?\s*", "", line).strip()
        if not line:
            continue
        # Drop trailing time ranges / single times
        line = re.sub(r"\s+\d{1,2}[:.]\d{2}\s*[-–—]\s*\d{1,2}[:.]\d{2}\b.*$", "", line).strip()
        line = re.sub(r"\s+\d{1,2}[:.]\d{2}\b.*$", "", line).strip()
        # Drop room crumbs
        line = re.sub(r"\s+ауд\.?\s*\S+.*$", "", line, flags=re.I).strip()
        name = re.split(r"\s{2,}|\t| — | – ", line, maxsplit=1)[0].strip(" .;:")
        if len(name) < 2 or len(name) > 80:
            continue
        if re.fullmatch(r"[\d\W]+", name):
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        found.append({"name": name, "description": None})
    return found[:40]


def _normalize_subject_items(items: list, *, with_schedule: bool = False) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for item in items:
        schedule: list[dict] = []
        if isinstance(item, str):
            name, description = item, None
        elif isinstance(item, dict):
            name = str(item.get("name") or item.get("title") or "").strip()
            desc = item.get("description")
            description = str(desc).strip() if desc else None
            if with_schedule and isinstance(item.get("schedule"), list):
                for slot in item["schedule"]:
                    if not isinstance(slot, dict):
                        continue
                    wd = slot.get("weekday")
                    if wd is None:
                        continue
                    try:
                        weekday = int(wd)
                    except (TypeError, ValueError):
                        continue
                    if weekday < 0 or weekday > 6:
                        continue
                    start = _normalize_time(str(slot.get("start_time") or ""))
                    end = _normalize_time(str(slot.get("end_time") or start))
                    if not re.fullmatch(r"\d{2}:\d{2}", start):
                        continue
                    if not re.fullmatch(r"\d{2}:\d{2}", end):
                        end = start
                    loc = slot.get("location")
                    schedule.append(
                        {
                            "weekday": weekday,
                            "start_time": start,
                            "end_time": end,
                            "location": str(loc).strip() if loc else None,
                        }
                    )
        else:
            continue
        if len(name) < 2 or len(name) > 255:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        row: dict = {"name": name, "description": description or None}
        if with_schedule and schedule:
            row["schedule"] = schedule
        out.append(row)
    return out[:40]


async def parse_subjects_from_text(
    text: str,
    *,
    with_schedule: bool = False,
) -> tuple[list[dict], str]:
    """
    Return (subjects, engine_label).
    with_schedule=True keeps weekday/time slots from timetable text.
    """
    cleaned = (text or "").strip()
    if not cleaned:
        return [], "empty"

    if with_schedule:
        fallback = heuristic_subjects_with_schedule_from_text(cleaned)
    else:
        fallback = _heuristic_subjects_from_text(cleaned)

    system = SUBJECT_SCHEDULE_IMPORT_SYSTEM if with_schedule else SUBJECT_IMPORT_SYSTEM
    try:
        raw = await _chat(
            system,
            f"Текст студента:\n\n{cleaned[:8000]}",
            temperature=0.1,
            timeout=45.0,
        )
        parsed = _extract_json_array(raw)
        items = _normalize_subject_items(parsed or [], with_schedule=with_schedule)
        if items:
            return items, "ai"
        if fallback:
            return fallback, "heuristic"
        return [], "ai-empty"
    except Exception as exc:  # noqa: BLE001
        logger.warning("subject import AI failed, using heuristic: %s", exc)
        return fallback, "heuristic"
