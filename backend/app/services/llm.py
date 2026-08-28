"""
LLM access layer for Synapse.

Order of engines:
1. OpenAI-compatible HTTP API (OpenRouter / Groq / DeepSeek / Ollama / LM Studio)
   when AI_BASE_URL + AI_API_KEY are configured. Deterministic, works from any region.
2. GPT4Free auto-probe: many free providers, each called with ITS OWN default model.
   The first provider that answers is cached, so later requests are fast.

Anything above may be blocked by region or rate limits, so callers must handle
LLMUnavailable and degrade gracefully.
"""

from __future__ import annotations

import json
import logging
import threading
import time
import warnings
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout, as_completed
from dataclasses import dataclass
from pathlib import Path

import httpx

from app.core.config import BASE_DIR, settings

logger = logging.getLogger("synapse.llm")

# pydub (optional g4f extra) warns when ffmpeg is absent; irrelevant for text.
warnings.filterwarnings("ignore", message=r".*Couldn't find ffmpeg or avconv.*", category=RuntimeWarning)


class LLMUnavailable(RuntimeError):
    """Raised when no engine could produce an answer."""


@dataclass
class Answer:
    content: str
    engine: str


# Providers that generate images/audio or need a browser session: never useful here.
_SKIP_PROVIDERS = {
    "BlackForestLabs_Flux1Dev",
    "BlackForestLabs_Flux1KontextDev",
    "StabilityAI_SD35Large",
    "PollinationsImage",
    "PollinationsAudio",
    "OpenAIFM",
    "CachedSearch",
    "Custom",
    "LMArena",
    "AnyProvider",
}

# Tried first: fast and historically reliable without auth.
_PREFERRED_ORDER = [
    "Gemini",
    "Cloudflare",
    "CohereForAI_C4AI_Command",
    "HuggingSpace",
    "Yqcloud",
    "OpenCode",
    "KiloCode",
    "Perplexity",
    "PollinationsAI",
    "Pollinations",
    "DeepInfra",
    "Qwen",
    "GLM",
    "TeachAnything",
]

_cache_lock = threading.Lock()
_cached_provider: tuple[str, str, float] | None = None  # (provider, model, timestamp)
_CACHE_FILE = BASE_DIR / "data" / "ai_cache.json"


def _openai_configured() -> bool:
    return bool(settings.ai_base_url and settings.ai_model)


def _openai_chat(messages: list[dict], temperature: float) -> str:
    url = settings.ai_base_url.rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if settings.ai_api_key:
        headers["Authorization"] = f"Bearer {settings.ai_api_key}"
    payload = {
        "model": settings.ai_model,
        "messages": messages,
        "temperature": temperature,
    }
    retry_statuses = {429, 502, 503, 504}
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            with httpx.Client(timeout=settings.ai_timeout_seconds) as client:
                r = client.post(url, json=payload, headers=headers)
                if r.status_code in retry_statuses and attempt < 2:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                r.raise_for_status()
                data = r.json()
            choices = data.get("choices") or []
            if not choices:
                raise LLMUnavailable(f"OpenAI-compatible API returned no choices: {str(data)[:200]}")
            return (choices[0].get("message", {}).get("content") or "").strip()
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt < 2:
                time.sleep(1.0 * (attempt + 1))
                continue
            raise
    raise LLMUnavailable(str(last_exc) if last_exc else "custom API failed")


def _g4f_candidates() -> list[tuple[str, str]]:
    """(provider_name, model) pairs, best-effort ordered."""
    if settings.ai_disable_g4f:
        return []
    try:
        from g4f import Provider
    except Exception as exc:  # noqa: BLE001
        logger.warning("g4f import failed: %s", exc)
        return []

    available = {}
    for prov in getattr(Provider, "__providers__", []):
        name = getattr(prov, "__name__", "")
        if not name or name in _SKIP_PROVIDERS:
            continue
        if not getattr(prov, "working", False) or getattr(prov, "needs_auth", False):
            continue
        available[name] = getattr(prov, "default_model", "") or ""

    configured = [n.strip() for n in settings.g4f_providers.split(",") if n.strip()]
    ordered_names: list[str] = []
    for name in [*configured, *_PREFERRED_ORDER, *sorted(available)]:
        if name in available and name not in ordered_names:
            ordered_names.append(name)

    pairs: list[tuple[str, str]] = []
    for name in ordered_names:
        model = available[name]
        # Honour an explicitly configured model only for providers that list it.
        if name == "Gemini" and settings.g4f_model.startswith("gemini"):
            model = settings.g4f_model
        pairs.append((name, model))
    return pairs


def _g4f_call(provider_name: str, model: str, messages: list[dict], temperature: float) -> str:
    from g4f import Provider
    from g4f.client import Client

    provider = getattr(Provider, provider_name, None)
    if provider is None:
        raise LLMUnavailable(f"provider missing: {provider_name}")

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


def _with_timeout(fn, *args, timeout: float | None = None):
    timeout = timeout or settings.ai_timeout_seconds
    with ThreadPoolExecutor(max_workers=1) as pool:
        fut = pool.submit(fn, *args)
        try:
            return fut.result(timeout=timeout)
        except FuturesTimeout as exc:
            raise TimeoutError(f"timed out after {timeout:.0f}s") from exc


def _cached_pair() -> tuple[str, str] | None:
    global _cached_provider
    with _cache_lock:
        if not _cached_provider:
            return None
        name, model, ts = _cached_provider
        if time.time() - ts > settings.ai_cache_seconds:
            _cached_provider = None
            return None
        return name, model


def _remember(name: str, model: str) -> None:
    global _cached_provider
    ts = time.time()
    with _cache_lock:
        _cached_provider = (name, model, ts)
        try:
            _CACHE_FILE.write_text(
                json.dumps({"provider": name, "model": model, "timestamp": ts}),
                encoding="utf-8",
            )
        except OSError as exc:
            logger.debug("could not persist ai cache: %s", exc)


def _race_g4f_providers(
    messages: list[dict],
    temperature: float,
    *,
    skip: set[str] | None = None,
    timeout: float | None = None,
) -> Answer | None:
    """Try several g4f providers in parallel; return the first that answers."""
    skip = skip or set()
    candidates = [(n, m) for n, m in _g4f_candidates() if n not in skip][
        : settings.ai_max_attempts
    ]
    if not candidates:
        return None

    probe_timeout = timeout or settings.ai_probe_timeout_seconds
    workers = min(settings.ai_probe_workers, len(candidates))

    def attempt(pair: tuple[str, str]) -> tuple[str, str, str] | None:
        name, model = pair
        try:
            content = _with_timeout(
                _g4f_call,
                name,
                model,
                messages,
                temperature,
                timeout=probe_timeout,
            )
            if content:
                return name, model, content
        except Exception as exc:  # noqa: BLE001
            logger.info("g4f %s/%s failed: %s", name, model, type(exc).__name__)
        return None

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(attempt, pair): pair for pair in candidates}
        try:
            for fut in as_completed(futures):
                hit = fut.result()
                if hit:
                    for pending in futures:
                        if pending is not fut and not pending.done():
                            pending.cancel()
                    name, model, content = hit
                    _remember(name, model)
                    logger.info(
                        "g4f race winner provider=%s model=%s chars=%s",
                        name,
                        model,
                        len(content),
                    )
                    return Answer(content, f"g4f:{name}")
        finally:
            for fut in futures:
                fut.cancel()
    return None


def chat(messages: list[dict], *, temperature: float = 0.35, timeout: float | None = None) -> Answer:
    started = time.perf_counter()
    errors: list[str] = []
    call_timeout = timeout or settings.ai_timeout_seconds

    if _openai_configured():
        try:
            content = _with_timeout(_openai_chat, messages, temperature, timeout=call_timeout)
            if content:
                logger.info("chat via custom API in %.1fs", time.perf_counter() - started)
                return Answer(content, f"api:{settings.ai_model}")
            errors.append("custom API: empty response")
        except Exception as exc:  # noqa: BLE001
            logger.warning("custom API failed: %s", exc)
            errors.append(f"custom API: {exc}")

    cached = _cached_pair()
    skip: set[str] = set()
    if cached:
        name, model = cached
        skip.add(name)
        try:
            content = _with_timeout(
                _g4f_call,
                name,
                model,
                messages,
                temperature,
                timeout=call_timeout,
            )
            if content:
                logger.info("chat via cached %s in %.1fs", name, time.perf_counter() - started)
                return Answer(content, f"g4f:{name}")
            errors.append(f"{name}: empty response")
        except Exception as exc:  # noqa: BLE001
            logger.info("cached provider %s failed, re-probing: %s", name, exc)
            errors.append(f"{name}: {exc}")
            forget_cached_provider()

    raced = _race_g4f_providers(messages, temperature, skip=skip, timeout=call_timeout)
    if raced:
        logger.info("chat via g4f race in %.1fs", time.perf_counter() - started)
        return raced

    raise LLMUnavailable("; ".join(errors[:8]) or "no engines configured")


def forget_cached_provider() -> None:
    global _cached_provider
    with _cache_lock:
        _cached_provider = None
        try:
            if _CACHE_FILE.exists():
                _CACHE_FILE.unlink()
        except OSError:
            pass


def load_disk_cache() -> None:
    """Restore last working g4f provider from disk (fast restart)."""
    global _cached_provider
    if not _CACHE_FILE.exists():
        return
    try:
        data = json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
        name = data.get("provider") or ""
        model = data.get("model") or ""
        ts = float(data.get("timestamp") or 0)
        if name and model and time.time() - ts <= settings.ai_cache_seconds:
            with _cache_lock:
                _cached_provider = (name, model, ts)
            logger.info("restored g4f cache from disk: %s/%s", name, model)
    except (OSError, json.JSONDecodeError, TypeError, ValueError) as exc:
        logger.debug("ai cache load skipped: %s", exc)


def diagnose(limit: int = 14, workers: int = 6) -> dict:
    """Probe engines in parallel; used by /api/ai/diagnose and npm run ai-check."""
    import concurrent.futures as cf

    result: dict = {
        "custom_api": {"configured": _openai_configured(), "model": settings.ai_model or None},
        "providers": [],
        "working": [],
    }

    if _openai_configured():
        try:
            content = _with_timeout(
                _openai_chat,
                [{"role": "user", "content": "Ответь одним словом: привет"}],
                0.2,
                timeout=min(settings.ai_timeout_seconds, 30),
            )
            result["custom_api"]["status"] = "ok" if content else "empty"
            result["custom_api"]["sample"] = content[:80]
        except Exception as exc:  # noqa: BLE001
            result["custom_api"]["status"] = f"fail: {type(exc).__name__}: {str(exc)[:120]}"

    candidates = _g4f_candidates()[:limit]

    def probe(pair):
        name, model = pair
        try:
            content = _with_timeout(
                _g4f_call,
                name,
                model,
                [{"role": "user", "content": "Ответь одним словом: привет"}],
                0.2,
                timeout=settings.ai_probe_timeout_seconds,
            )
            return {"provider": name, "model": model, "status": "ok" if content else "empty", "sample": content[:60]}
        except Exception as exc:  # noqa: BLE001
            return {"provider": name, "model": model, "status": "fail", "error": f"{type(exc).__name__}: {str(exc)[:110]}"}

    if candidates:
        with cf.ThreadPoolExecutor(max_workers=workers) as pool:
            for item in pool.map(probe, candidates):
                result["providers"].append(item)
                if item["status"] == "ok":
                    result["working"].append(item["provider"])

    return result


def status() -> dict:
    cached = _cached_pair()
    return {
        "custom_api_configured": _openai_configured(),
        "custom_api_model": settings.ai_model or None,
        "cached_provider": cached[0] if cached else None,
        "timeout_seconds": settings.ai_timeout_seconds,
        "max_attempts": settings.ai_max_attempts,
        "candidate_providers": [name for name, _ in _g4f_candidates()[: settings.ai_max_attempts]],
        "transcription": transcription_status(),
    }


# --------------------------------------------------------------------------- #
# Audio transcription
# --------------------------------------------------------------------------- #


def _faster_whisper_available() -> bool:
    try:
        import faster_whisper  # noqa: F401

        return True
    except Exception:  # noqa: BLE001
        return False


def transcription_status() -> dict:
    return {
        "api": bool(_openai_configured() and settings.ai_transcribe_model),
        "api_model": settings.ai_transcribe_model or None,
        "local_whisper": _faster_whisper_available(),
        "local_whisper_model": settings.whisper_model,
        "language": settings.whisper_language or "auto",
        "beam_size": settings.whisper_beam_size,
        "prefer_local": settings.whisper_prefer_local,
    }


def _transcribe_via_api(audio_path: Path, filename: str) -> str:
    url = settings.ai_base_url.rstrip("/") + "/audio/transcriptions"
    headers = {}
    if settings.ai_api_key:
        headers["Authorization"] = f"Bearer {settings.ai_api_key}"
    with audio_path.open("rb") as fh:
        files = {"file": (filename, fh, "application/octet-stream")}
        data = {"model": settings.ai_transcribe_model, "response_format": "text"}
        with httpx.Client(timeout=settings.transcribe_timeout_seconds) as client:
            r = client.post(url, headers=headers, files=files, data=data)
            r.raise_for_status()
            body = r.text.strip()
    if body.startswith("{"):
        import json

        try:
            body = (json.loads(body).get("text") or "").strip()
        except Exception:  # noqa: BLE001
            pass
    return body


@dataclass
class Transcript:
    text: str
    engine: str
    duration_seconds: int | None = None


_whisper_model = None
_whisper_model_name: str | None = None


def _load_whisper():
    global _whisper_model, _whisper_model_name
    if _whisper_model is None or _whisper_model_name != settings.whisper_model:
        from faster_whisper import WhisperModel

        logger.info(
            "loading faster-whisper model=%s device=%s compute=%s",
            settings.whisper_model,
            settings.whisper_device,
            settings.whisper_compute_type,
        )
        _whisper_model = WhisperModel(
            settings.whisper_model,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
        )
        _whisper_model_name = settings.whisper_model
    return _whisper_model


def _stamp(seconds: float) -> str:
    total = max(0, int(seconds))
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def _decode(
    model,
    audio_path: Path,
    *,
    language: str | None,
    use_vad: bool,
    on_progress=None,
) -> tuple[str, int | None, float, str | None]:
    """
    High-coverage lecture transcription.
    Returns (text, duration_seconds, coverage_ratio, detected_language).
    """
    # Thresholds tuned for completeness (prefer keeping speech over skipping).
    options: dict = {
        "task": "transcribe",
        "beam_size": max(1, settings.whisper_beam_size),
        "best_of": max(1, settings.whisper_beam_size),
        "patience": 1.0,
        "temperature": 0.0,
        "condition_on_previous_text": False,
        "word_timestamps": False,
        "language": language or None,
        "language_detection_segments": 4,
        "language_detection_threshold": 0.35,
        # Keep borderline speech instead of marking as silence/noise.
        "no_speech_threshold": 0.45,
        "log_prob_threshold": -1.15,
        "compression_ratio_threshold": 2.6,
        "vad_filter": bool(use_vad),
    }
    if settings.whisper_initial_prompt.strip():
        options["initial_prompt"] = settings.whisper_initial_prompt.strip()
    if use_vad:
        options["vad_parameters"] = {
            "min_silence_duration_ms": 1200,
            "speech_pad_ms": 500,
            "threshold": 0.35,
        }

    segments_iter, info = model.transcribe(str(audio_path), **options)
    duration = float(getattr(info, "duration", 0) or 0) or None
    duration_int = int(duration) if duration else None
    detected = getattr(info, "language", None)

    parts: list[str] = []
    covered = 0.0
    for seg in segments_iter:
        text = (seg.text or "").strip()
        if not text:
            continue
        parts.append(f"[{_stamp(seg.start)}] {text}")
        covered += max(0.0, float(seg.end) - float(seg.start))
        if on_progress and duration and duration > 0:
            try:
                on_progress(
                    min(0.99, covered / duration),
                    f"Расшифровка… {_stamp(covered)} / {_stamp(duration)}",
                )
            except Exception:  # noqa: BLE001
                pass

    text = "\n".join(parts).strip()
    coverage = (covered / duration) if duration else (1.0 if text else 0.0)
    if on_progress:
        try:
            on_progress(1.0, f"Готово: {len(text)} симв., покрытие ~{int(coverage * 100)}%")
        except Exception:  # noqa: BLE001
            pass
    return text, duration_int, coverage, detected


def _pick_best_transcript(candidates: list[tuple[str, int | None, float, str]]) -> tuple[str, int | None]:
    """Choose the longest high-coverage transcript (never prefer a truncated one)."""
    if not candidates:
        return "", None
    scored = []
    for text, duration, coverage, label in candidates:
        if not text:
            continue
        # Prefer coverage, then length.
        scored.append((coverage, len(text), text, duration, label))
    if not scored:
        return "", None
    scored.sort(reverse=True)
    best = scored[0]
    logger.info(
        "transcript pick: %s coverage=%.0f%% chars=%s",
        best[4],
        best[0] * 100,
        best[1],
    )
    return best[2], best[3]


def _transcribe_local(audio_path: Path, on_progress=None) -> tuple[str, int | None]:
    """
    Multi-pass local transcription for max content retention.
    Priority language: Russian; English terms preserved via initial_prompt.
    """
    model = _load_whisper()
    primary_lang = (settings.whisper_language or "ru").strip() or "ru"
    candidates: list[tuple[str, int | None, float, str]] = []

    # Pass 1: Russian-first (or configured language), no VAD — fullest capture.
    if on_progress:
        try:
            on_progress(0.02, f"Модель {settings.whisper_model}, язык: {primary_lang}…")
        except Exception:  # noqa: BLE001
            pass
    text, duration, coverage, detected = _decode(
        model,
        audio_path,
        language=primary_lang,
        use_vad=False,
        on_progress=on_progress,
    )
    candidates.append((text, duration, coverage, f"{primary_lang}/no-vad"))
    logger.info(
        "whisper pass %s: chars=%s coverage=%.0f%% detected=%s",
        primary_lang,
        len(text),
        coverage * 100,
        detected,
    )

    # Pass 2: if coverage weak, retry auto-detect (helps EN-heavy lectures).
    if coverage < 0.82 or len(text) < 80:
        if on_progress:
            try:
                on_progress(0.05, "Дополнительный проход: автоопределение языка…")
            except Exception:  # noqa: BLE001
                pass
        try:
            t2, d2, c2, det2 = _decode(
                model,
                audio_path,
                language=None,
                use_vad=False,
                on_progress=on_progress,
            )
            candidates.append((t2, d2 or duration, c2, f"auto/{det2 or '?'}"))
            logger.info("whisper pass auto: chars=%s coverage=%.0f%% detected=%s", len(t2), c2 * 100, det2)
        except Exception as exc:  # noqa: BLE001
            logger.info("auto-language pass failed: %s", exc)

    # Pass 3: optional VAD only if user enabled and we still look thin.
    if settings.whisper_vad:
        try:
            t3, d3, c3, _ = _decode(
                model,
                audio_path,
                language=primary_lang,
                use_vad=True,
                on_progress=on_progress,
            )
            candidates.append((t3, d3 or duration, c3, f"{primary_lang}/vad"))
        except Exception as exc:  # noqa: BLE001
            logger.info("vad pass failed: %s", exc)

    return _pick_best_transcript(candidates)


def _transcribe_g4f_multimodal(audio_path: Path) -> str:
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
                        "Сделай ПОЛНУЮ транскрибацию лекции на языке оригинала "
                        "(русский приоритет, английские термины сохрани). "
                        "Не сокращай. Таймкоды [MM:SS] каждые 30–60 секунд. "
                        "Верни только транскрипт."
                    ),
                }
            ],
            media=[audio_file],
            web_search=False,
        )
    return (response.choices[0].message.content or "").strip()


def transcribe(
    audio_path: Path,
    filename: str,
    *,
    on_progress=None,
) -> Transcript:
    """Transcribe audio with maximum content retention; raises LLMUnavailable."""
    started = time.perf_counter()
    errors: list[str] = []
    local_result: Transcript | None = None
    api_result: Transcript | None = None

    # Local first when preferred (complete lecture coverage on device).
    if settings.whisper_prefer_local and _faster_whisper_available():
        try:
            text, duration = _with_timeout(
                _transcribe_local,
                audio_path,
                on_progress=on_progress,
                timeout=settings.transcribe_timeout_seconds,
            )
            if len(text) > 20:
                local_result = Transcript(
                    text, f"faster-whisper:{settings.whisper_model}", duration
                )
                logger.info(
                    "transcribe local in %.1fs (%s chars)",
                    time.perf_counter() - started,
                    len(text),
                )
            else:
                errors.append("local whisper: empty result")
        except Exception as exc:  # noqa: BLE001
            logger.warning("local whisper failed: %s", exc)
            errors.append(f"local whisper: {type(exc).__name__}: {str(exc)[:120]}")

    if _openai_configured() and settings.ai_transcribe_model:
        try:
            if on_progress and not local_result:
                on_progress(0.1, "Облачная транскрибация…")
            text = _transcribe_via_api(audio_path, filename)
            if len(text) > 40:
                api_result = Transcript(text, f"api:{settings.ai_transcribe_model}")
                logger.info("transcribe via API in %.1fs (%s chars)", time.perf_counter() - started, len(text))
            else:
                errors.append("api: too short")
        except Exception as exc:  # noqa: BLE001
            logger.warning("API transcription failed: %s", exc)
            errors.append(f"api: {type(exc).__name__}")

    # If local was skipped (prefer_local false), try it now.
    if local_result is None and _faster_whisper_available():
        try:
            text, duration = _with_timeout(
                _transcribe_local,
                audio_path,
                on_progress=on_progress,
                timeout=settings.transcribe_timeout_seconds,
            )
            if len(text) > 20:
                local_result = Transcript(
                    text, f"faster-whisper:{settings.whisper_model}", duration
                )
            else:
                errors.append("local whisper: empty result")
        except Exception as exc:  # noqa: BLE001
            logger.warning("local whisper failed: %s", exc)
            errors.append(f"local whisper: {type(exc).__name__}: {str(exc)[:120]}")

    # Prefer the longer complete transcript.
    if local_result and api_result:
        if len(local_result.text) >= len(api_result.text) * 0.9:
            return local_result
        return api_result
    if local_result:
        return local_result
    if api_result:
        return api_result

    # Last try: multimodal free provider (bounded by transcribe timeout).
    try:
        if on_progress:
            on_progress(0.12, "Резервная облачная расшифровка…")
        text = _with_timeout(
            _transcribe_g4f_multimodal,
            audio_path,
            timeout=settings.transcribe_timeout_seconds,
        )
        if len(text) > 80 and "не могу" not in text.lower():
            return Transcript(text, "g4f:Gemini(multimodal)")
        errors.append("g4f multimodal: unsupported")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"g4f multimodal: {type(exc).__name__}")

    raise LLMUnavailable("; ".join(errors))


def preload_whisper() -> None:
    """Load whisper weights into memory (call from startup thread)."""
    if not _faster_whisper_available():
        return
    try:
        _load_whisper()
        logger.info("whisper model preloaded: %s", settings.whisper_model)
    except Exception as exc:  # noqa: BLE001
        logger.warning("whisper preload failed: %s", exc)


def warm_provider_cache() -> None:
    """Restore or discover a working g4f provider without blocking requests."""
    if settings.ai_disable_g4f or _openai_configured():
        return
    load_disk_cache()
    if _cached_pair():
        logger.info("g4f cache warm: using %s", _cached_pair()[0])
        return
    try:
        result = diagnose(limit=settings.ai_max_attempts, workers=settings.ai_probe_workers)
        for item in result.get("providers", []):
            if item.get("status") == "ok":
                _remember(item["provider"], item["model"])
                logger.info("g4f cache warm: selected %s", item["provider"])
                return
    except Exception as exc:  # noqa: BLE001
        logger.info("g4f warm probe skipped: %s", exc)


def startup_warmup() -> None:
    """Background preload for faster first request."""
    load_disk_cache()
    preload_whisper()
    warm_provider_cache()
