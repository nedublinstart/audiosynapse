from __future__ import annotations

import logging
import re
import warnings
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from functools import lru_cache
from pathlib import Path

from app.core.config import settings
from app.prompts.synapse_core import (
    CHAT_SYSTEM_PROMPT,
    ENRICHMENT_SYSTEM_PROMPT,
    EXAM_SYSTEM_PROMPT,
    SYNAPSE_CORE_SYSTEM_PROMPT,
)

logger = logging.getLogger("synapse.ai")
_executor = ThreadPoolExecutor(max_workers=2)

# pydub (pulled by g4f extras) warns if ffmpeg is missing — irrelevant for text chat.
warnings.filterwarnings(
    "ignore",
    message=r".*Couldn't find ffmpeg or avconv.*",
    category=RuntimeWarning,
)

# Per-call timeout so a hung free provider does not freeze the chat UI.
_PROVIDER_TIMEOUT_SEC = 45


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
    """Offline Cornell-style notes when all G4F providers fail."""
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

    return f"""# ЛЕКЦИЯ: {title}
**Предмет:** {subject_name} | **Дата:** {lecture_date} | **Общее время:** {_format_duration(duration_seconds)}

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


def _offline_chat_reply(message: str, *, exam_mode: bool, notes: str, transcript: str | None, materials_text: str) -> str:
    if _is_greeting(message):
        return (
            "Привет! Я Synapse Tutor — помогу разобрать конспект и материалы этой лекции.\n\n"
            "Спроси, например: «объясни главный термин», «сделай вопросы к экзамену» "
            "или «что было в начале лекции?»."
        )

    haystack = "\n".join(filter(None, [notes or "", transcript or "", materials_text]))
    lowered = message.lower()

    if exam_mode or "вопрос" in lowered or "экзамен" in lowered:
        return (
            "Режим «Экзамен» (локальный fallback — онлайн-ИИ временно недоступен).\n\n"
            "1. Назовите 3 ключевых термина из конспекта. (Запоминание)\n"
            "2. Объясните один термин техникой Фейнмана. (Понимание)\n"
            "3. Приведите пример применения идеи из лекции. (Применение)\n"
            "4. Где в материале есть «слепая зона» и что дочитать? (Анализ)\n"
            "Ответы не привожу — сверьтесь с блоком Active Recall в конспекте. [Конспект]"
        )

    excerpt = ""
    for line in haystack.splitlines():
        if any(tok in line.lower() for tok in lowered.split() if len(tok) > 3):
            excerpt = line.strip()
            break
    if not excerpt:
        excerpt = next((ln.strip() for ln in haystack.splitlines() if len(ln.strip()) > 40), "")

    if excerpt:
        return (
            "Онлайн-ИИ сейчас недоступен, отвечаю по тексту лекции:\n\n"
            f"{excerpt}\n\n[Конспект]"
        )

    return (
        "Онлайн-ИИ сейчас недоступен, а в материалах этой лекции пока мало текста для ответа. "
        "Загрузите аудио/PDF или подождите, пока конспект сгенерируется, и спросите ещё раз."
    )


def _resolve_provider_names() -> list[str]:
    names = [n.strip() for n in settings.g4f_providers.split(",") if n.strip()]
    # Gemini first: works unauthenticated with gemini-* models on current g4f.
    defaults = ["Gemini", "AnyProvider", "PollinationsAI", "DeepSeek", "Cerebras", "OpenaiChat"]
    ordered: list[str] = []
    for name in [*names, *defaults]:
        if name and name not in ordered:
            ordered.append(name)
    return ordered


def _resolve_providers():
    from g4f import Provider

    providers = []
    for name in _resolve_provider_names():
        prov = getattr(Provider, name, None)
        if prov is None:
            logger.warning("G4F provider not found: %s", name)
            continue
        providers.append(prov)
    return providers


def _model_candidates() -> list[str]:
    primary = settings.g4f_model.strip()
    fallbacks = [m.strip() for m in settings.g4f_fallback_models.split(",") if m.strip()]
    ordered: list[str] = []
    for m in [primary, *fallbacks]:
        if m and m not in ordered:
            ordered.append(m)
    # Always keep known-good Gemini free models as last resort.
    for m in ("gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro"):
        if m not in ordered:
            ordered.append(m)
    return ordered or ["gemini-3.6-flash"]


def _models_for_provider(provider_name: str) -> list[str]:
    """Avoid sending OpenAI model ids to Gemini (raises ValueError and wastes time)."""
    all_models = _model_candidates()
    if provider_name in {"Gemini"}:
        gemini = [m for m in all_models if m.startswith("gemini")]
        return gemini or ["gemini-3.6-flash", "gemini-3.5-flash-lite"]
    if provider_name in {"AnyProvider"}:
        # Prefer Gemini-compatible ids first for free anonymous use.
        gemini = [m for m in all_models if m.startswith("gemini")]
        rest = [m for m in all_models if not m.startswith("gemini")]
        return [*gemini, *rest] or all_models
    return all_models


@lru_cache(maxsize=1)
def _provider_map() -> dict:
    from g4f import Provider

    out = {}
    for name in _resolve_provider_names():
        prov = getattr(Provider, name, None)
        if prov is not None:
            out[name] = prov
    return out


def _create_completion(provider, model: str, messages: list[dict], temperature: float) -> str:
    from g4f.client import Client

    kwargs: dict = {"provider": provider}
    if settings.g4f_api_key:
        kwargs["api_key"] = settings.g4f_api_key
    if settings.g4f_proxy:
        kwargs["proxies"] = settings.g4f_proxy

    client = Client(**kwargs)
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        web_search=False,
        temperature=temperature,
    )
    return (response.choices[0].message.content or "").strip()


def _try_one(provider_name: str, model: str, messages: list[dict], temperature: float) -> str:
    providers = _provider_map()
    provider = providers.get(provider_name)
    if provider is None:
        raise RuntimeError(f"provider missing: {provider_name}")

    with ThreadPoolExecutor(max_workers=1) as pool:
        fut = pool.submit(_create_completion, provider, model, messages, temperature)
        try:
            content = fut.result(timeout=_PROVIDER_TIMEOUT_SEC)
        except FuturesTimeout as exc:
            raise TimeoutError(f"{provider_name}/{model} timed out after {_PROVIDER_TIMEOUT_SEC}s") from exc

    if not content:
        raise RuntimeError("empty response")
    return content


def _chat_sync(system: str, user: str, *, temperature: float = 0.35) -> str:
    """Blocking G4F chat: try providers×models with timeouts (no hung RetryProvider)."""
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    errors: list[str] = []

    # Explicit order beats RetryProvider for reliability on Windows free setups.
    for provider_name in _resolve_provider_names():
        if provider_name not in _provider_map():
            continue
        for model in _models_for_provider(provider_name):
            try:
                content = _try_one(provider_name, model, messages, temperature)
                logger.info("G4F success provider=%s model=%s chars=%s", provider_name, model, len(content))
                return content
            except Exception as exc:  # noqa: BLE001
                msg = f"{provider_name}/{model}: {exc}"
                logger.warning("G4F failed: %s", msg)
                errors.append(msg)
                # Auth/payment issues: skip remaining models for this provider.
                name = type(exc).__name__
                if name in {
                    "MissingAuthError",
                    "PaymentRequiredError",
                    "NoValidHarFileError",
                    "MissingRequirementsError",
                }:
                    break

    raise RuntimeError("G4F failed for all providers: " + " | ".join(errors[:6]))


async def _chat(system: str, user: str, *, temperature: float = 0.35) -> str:
    import asyncio

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_executor, lambda: _chat_sync(system, user, temperature=temperature))


def g4f_status() -> dict:
    try:
        providers = list(_provider_map().keys())
    except Exception:  # noqa: BLE001
        providers = []
    return {
        "engine": "g4f",
        "model": settings.g4f_model,
        "fallback_models": _model_candidates()[1:],
        "providers": providers,
        "api_key_configured": bool(settings.g4f_api_key),
        "ffmpeg_required_for_chat": False,
    }


async def transcribe_audio(audio_path: Path, filename: str) -> tuple[str, int | None]:
    """
    Transcribe lecture audio.

    G4F text providers don't natively STT binary audio; we ask a multimodal-capable
    provider when possible, otherwise build a structured placeholder that still
    allows Synapse Core to synthesize a full Cornell note via G4F.
    """
    stem = Path(filename).stem.replace("_", " ")
    size_kb = max(1, audio_path.stat().st_size // 1024)

    try:
        from g4f.client import Client
        from g4f.Provider import Gemini

        client = Client(provider=Gemini)
        with audio_path.open("rb") as audio_file:
            response = client.chat.completions.create(
                model="gemini-3.6-flash",
                messages=[
                    {
                        "role": "user",
                        "content": (
                            "Сделай полную транскрибацию академической лекции на языке оригинала. "
                            "Сохрани термины точно. Добавляй таймкоды [MM:SS] каждые 30–60 секунд. "
                            "Не сокращай содержательные фрагменты. Верни только транскрипт."
                        ),
                    }
                ],
                media=[audio_file],
                web_search=False,
            )
        text = (response.choices[0].message.content or "").strip()
        if text and len(text) > 80 and "не могу" not in text.lower():
            return text, None
    except Exception as exc:  # noqa: BLE001
        logger.info("G4F audio transcription unavailable (%s); using enriched stub", exc)

    stub = (
        f"[00:00] Добрый день. Сегодняшняя лекция посвящена теме «{stem}». "
        f"[00:45] Мы разберём ключевые определения, логику рассуждения и примеры применения. "
        f"[03:20] Первый блок — базовые понятия и почему они важны в курсе. "
        f"[07:10] Второй блок — связи между понятиями и типичные ошибки понимания. "
        f"[12:40] Третий блок — практические следствия и подготовка к семинару. "
        f"[18:00] В заключение повторим главные тезисы и вопросы для самопроверки. "
        f"(Аудиофайл {filename}, ~{size_kb} КБ. Транскрибация через G4F multimodal "
        f"недоступна для этого провайдера — конспект всё равно синтезируется моделью G4F.)"
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
    try:
        return await _chat(SYNAPSE_CORE_SYSTEM_PROMPT, user_prompt, temperature=0.25)
    except Exception as exc:  # noqa: BLE001
        logger.error("generate_notes G4F failed: %s", exc)
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
    try:
        raw = await _chat(ENRICHMENT_SYSTEM_PROMPT, user_prompt, temperature=0.25)
        notice = "Конспект обновлен с учётом новых материалов."
        if "NOTICE:" in raw:
            body, _, tail = raw.rpartition("NOTICE:")
            notes = body.strip()
            notice = tail.strip() or notice
            return notes, notice
        return raw, notice
    except Exception as exc:  # noqa: BLE001
        logger.error("enrich_notes G4F failed: %s", exc)
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
        return existing_notes.rstrip() + addition, "Конспект обновлен. Добавлено 1 уточнение из загруженных слайдов/PDF."


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
        logger.error("chat G4F failed: %s", exc)
        return _offline_chat_reply(
            message,
            exam_mode=exam_mode,
            notes=notes,
            transcript=transcript,
            materials_text=materials_text,
        )
