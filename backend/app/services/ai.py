from __future__ import annotations

import re
from pathlib import Path

from app.core.config import settings
from app.prompts.synapse_core import (
    CHAT_SYSTEM_PROMPT,
    ENRICHMENT_SYSTEM_PROMPT,
    EXAM_SYSTEM_PROMPT,
    SYNAPSE_CORE_SYSTEM_PROMPT,
)


def _gemini_available() -> bool:
    return bool(settings.gemini_api_key)


def _generate_with_gemini(system: str, user: str) -> str:
    import google.generativeai as genai

    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel(
        model_name=settings.gemini_model,
        system_instruction=system,
    )
    response = model.generate_content(user)
    return (response.text or "").strip()


def _format_duration(seconds: int | None) -> str:
    if not seconds:
        return "н/д"
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h} ч {m} мин"
    return f"{m} мин"


def build_demo_notes(
    *,
    subject_name: str,
    title: str,
    lecture_date: str,
    duration_seconds: int | None,
    transcript: str,
    materials_text: str = "",
) -> str:
    """Deterministic Cornell-style notes when Gemini API key is absent."""
    cleaned = re.sub(r"\s+", " ", transcript).strip()
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

    return f"""# 🎓 ЛЕКЦИЯ: {title}
**Предмет:** {subject_name} | **Дата:** {lecture_date} | **Общее время:** {_format_duration(duration_seconds)}

## 🎯 Краткое резюме (Executive Summary)
*   Лекция структурирована вокруг центральной темы «{title}».
*   Преподаватель последовательно вводит термины и связывает их в логическую цепочку.
*   Для закрепления важны определения, причинно-следственные связи и примеры.
*   Ниже — конспект по методу Корнелла с блоками Фейнмана и Active Recall.

---

## 🧠 Основные блоки (Метод Корнелла)

### Центральная тема
**Ключевые вопросы и термины (Cues):**
{cue_lines}

**Развернутые тезисы (Notes):**
{note_lines}{material_block}

💡 **Блок Фейнмана (Простыми словами):**
Представьте, что сложная идея — это карта города: термины — названия улиц, а тезисы — маршруты между ними. Сначала выучите «улицы», потом пройдите «маршрут» целиком — так материал удерживается дольше.

---

## 🔗 Синтез и Инсайты (Связь теории с практикой)
*   Теоретические формулировки из аудио стоит сопоставлять со схемами/списками из презентации.
*   Практический фокус: уметь объяснить термин без шпаргалки и привести хотя бы один пример применения.

## ⚠️ Слепые зоны и Что почитать дополнительно
*   Преподаватель мог упомянуть смежные теории без полного раскрытия — зафиксируйте их как точки для доработки.
*   Рекомендуется перечитать базовый учебник по теме «{title}» и сверить определения.
*   Если есть презентация, отдельно просмотрите слайды с формулами/схемами.

## 🏆 Active Recall (Вопросы для самопроверки)
{questions}
"""


async def transcribe_audio(audio_path: Path, filename: str) -> tuple[str, int | None]:
    """Transcribe audio via Gemini when available; otherwise return a stub transcript."""
    if _gemini_available():
        import google.generativeai as genai

        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(settings.gemini_model)
        uploaded = genai.upload_file(str(audio_path))
        prompt = (
            "Сделай полную транскрибацию академической лекции на языке оригинала. "
            "Сохрани термины точно. Добавляй таймкоды вида [MM:SS] примерно каждые 30–60 секунд. "
            "Не сокращай содержательные фрагменты."
        )
        response = model.generate_content([uploaded, prompt])
        text = (response.text or "").strip()
        # Duration unknown without probing; leave None
        return text, None

    stem = Path(filename).stem.replace("_", " ")
    stub = (
        f"[00:00] Добрый день. Сегодняшняя лекция посвящена теме «{stem}». "
        f"[00:45] Мы разберём ключевые определения, логику рассуждения и примеры применения. "
        f"[03:20] Первый блок — базовые понятия и почему они важны в курсе. "
        f"[07:10] Второй блок — связи между понятиями и типичные ошибки понимания. "
        f"[12:40] Третий блок — практические следствия и подготовка к семинару. "
        f"[18:00] В заключение повторим главные тезисы и вопросы для самопроверки. "
        f"(Демо-режим: задайте GEMINI_API_KEY для реальной транскрибации файла {filename}.)"
    )
    return stub, 20 * 60


async def generate_notes(
    *,
    subject_name: str,
    title: str,
    lecture_date: str,
    duration_seconds: int | None,
    transcript: str,
    materials_text: str = "",
) -> str:
    user_prompt = f"""Сгенерируй конспект строго по шаблону Synapse Core.

Предмет: {subject_name}
Тема лекции: {title}
Дата: {lecture_date}
Длительность: {_format_duration(duration_seconds)}

=== ТРАНСКРИПТ АУДИО ===
{transcript}

=== ДОПОЛНИТЕЛЬНЫЕ МАТЕРИАЛЫ ===
{materials_text or "(нет)"}
"""
    if _gemini_available():
        return _generate_with_gemini(SYNAPSE_CORE_SYSTEM_PROMPT, user_prompt)
    return build_demo_notes(
        subject_name=subject_name,
        title=title,
        lecture_date=lecture_date,
        duration_seconds=duration_seconds,
        transcript=transcript,
        materials_text=materials_text,
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
    if _gemini_available():
        raw = _generate_with_gemini(ENRICHMENT_SYSTEM_PROMPT, user_prompt)
        notice = "Конспект обновлен с учётом новых материалов."
        if "NOTICE:" in raw:
            body, _, tail = raw.rpartition("NOTICE:")
            notes = body.strip()
            notice = tail.strip() or notice
            return notes, notice
        return raw, notice

    # Demo enrichment: append a Cornell subsection from materials
    snippet = materials_text.strip()[:500] or "фрагменты слайдов"
    addition = f"""

---

### Обогащение из дополнительных материалов
**Ключевые вопросы и термины (Cues):**
*   **Связь слайдов с аудио** *(Где презентация дополняет речь преподавателя?)*

**Развернутые тезисы (Notes):**
*   Из загруженных материалов извлечены уточнения и схемы. [Слайд: 1]
*   Фрагмент: {snippet}

💡 **Блок Фейнмана (Простыми словами):**
Слайды — это «иллюстрации» к рассказу преподавателя: они не заменяют аудио, а подсвечивают структуру.
"""
    notes = existing_notes.rstrip() + addition
    notice = "Конспект обновлен. Добавлено 1 уточнение из загруженных слайдов/PDF."
    return notes, notice


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
    if _gemini_available():
        return _generate_with_gemini(system, user_prompt)

    # Demo grounded reply
    haystack = "\n".join(filter(None, [notes or "", transcript or "", materials_text]))
    lowered = message.lower()
    if exam_mode or "вопрос" in lowered or "экзамен" in lowered:
        return (
            "Режим «Экзамен» (демо).\n\n"
            "1. Назовите 3 ключевых термина из конспекта. (Запоминание)\n"
            "2. Объясните один термин техникой Фейнмана. (Понимание)\n"
            "3. Приведите пример применения идеи из лекции. (Применение)\n"
            "4. Где в материале есть «слепая зона» и что дочитать? (Анализ)\n"
            "Ответы не привожу — сверьтесь с блоком Active Recall в конспекте. [Конспект]"
        )

    # Pull a short relevant excerpt
    excerpt = ""
    for line in haystack.splitlines():
        if any(tok in line.lower() for tok in lowered.split() if len(tok) > 3):
            excerpt = line.strip()
            break
    if not excerpt:
        excerpt = next((ln.strip() for ln in haystack.splitlines() if len(ln.strip()) > 40), "")

    if not excerpt:
        return (
            "В загруженных материалах этой лекции недостаточно данных для ответа. "
            "Загрузите аудио/PDF или уточните вопрос по конспекту."
        )

    return (
        f"По материалам этой лекции:\n\n{excerpt}\n\n"
        f"[Конспект] (демо-режим без GEMINI_API_KEY — ответ ограничен локальным контекстом)."
    )
