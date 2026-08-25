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

import logging
import time
import warnings
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from dataclasses import dataclass
from pathlib import Path

import httpx

from app.core.config import settings

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

_cache_lock_free = True
_cached_provider: tuple[str, str, float] | None = None  # (provider, model, timestamp)


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
    with httpx.Client(timeout=settings.ai_timeout_seconds) as client:
        r = client.post(url, json=payload, headers=headers)
        r.raise_for_status()
        data = r.json()
    choices = data.get("choices") or []
    if not choices:
        raise LLMUnavailable(f"OpenAI-compatible API returned no choices: {str(data)[:200]}")
    return (choices[0].get("message", {}).get("content") or "").strip()


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
    if not _cached_provider:
        return None
    name, model, ts = _cached_provider
    if time.time() - ts > settings.ai_cache_seconds:
        _cached_provider = None
        return None
    return name, model


def _remember(name: str, model: str) -> None:
    global _cached_provider
    _cached_provider = (name, model, time.time())


def forget_cached_provider() -> None:
    global _cached_provider
    _cached_provider = None


def chat(messages: list[dict], *, temperature: float = 0.35) -> Answer:
    errors: list[str] = []

    if _openai_configured():
        try:
            content = _with_timeout(_openai_chat, messages, temperature)
            if content:
                return Answer(content, f"api:{settings.ai_model}")
            errors.append("custom API: empty response")
        except Exception as exc:  # noqa: BLE001
            logger.warning("custom API failed: %s", exc)
            errors.append(f"custom API: {exc}")

    cached = _cached_pair()
    if cached:
        name, model = cached
        try:
            content = _g4f_call(name, model, messages, temperature)
            if content:
                return Answer(content, f"g4f:{name}")
            errors.append(f"{name}: empty response")
        except Exception as exc:  # noqa: BLE001
            logger.info("cached provider %s failed, re-probing: %s", name, exc)
            errors.append(f"{name}: {exc}")
            forget_cached_provider()

    attempts = 0
    for name, model in _g4f_candidates():
        if cached and name == cached[0]:
            continue
        if attempts >= settings.ai_max_attempts:
            break
        attempts += 1
        try:
            content = _with_timeout(_g4f_call, name, model, messages, temperature)
            if content:
                _remember(name, model)
                logger.info("g4f success provider=%s model=%s chars=%s", name, model, len(content))
                return Answer(content, f"g4f:{name}")
            errors.append(f"{name}: empty response")
        except Exception as exc:  # noqa: BLE001
            logger.warning("g4f %s/%s failed: %s", name, model, exc)
            errors.append(f"{name}: {type(exc).__name__}")

    raise LLMUnavailable("; ".join(errors[:8]) or "no engines configured")


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
                timeout=25,
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


def _load_whisper():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel

        logger.info("loading faster-whisper model %s", settings.whisper_model)
        _whisper_model = WhisperModel(
            settings.whisper_model,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
        )
    return _whisper_model


def _decode(model, audio_path: Path, *, use_vad: bool) -> tuple[str, int | None]:
    # condition_on_previous_text=False stops the repetition loops Whisper falls
    # into on lecture audio; extra detection segments avoid picking a wrong
    # language from a two-word greeting at the start.
    options = {
        "beam_size": 5,
        "condition_on_previous_text": False,
        "language": settings.whisper_language or None,
        "language_detection_segments": 3,
    }
    if use_vad:
        options["vad_filter"] = True
        # Defaults clip real speech in lecture recordings.
        options["vad_parameters"] = {"min_silence_duration_ms": 1000, "speech_pad_ms": 400}
    else:
        options["vad_filter"] = False

    segments, info = model.transcribe(str(audio_path), **options)
    parts = []
    covered = 0.0
    for seg in segments:
        stamp = time.strftime("%M:%S", time.gmtime(max(0, seg.start)))
        parts.append(f"[{stamp}] {seg.text.strip()}")
        covered += max(0.0, seg.end - seg.start)
    duration = int(getattr(info, "duration", 0) or 0) or None
    coverage = covered / duration if duration else 1.0
    return "\n".join(parts).strip(), duration, coverage


def _transcribe_local(audio_path: Path) -> tuple[str, int | None]:
    model = _load_whisper()
    use_vad = settings.whisper_vad
    try:
        text, duration, coverage = _decode(model, audio_path, use_vad=use_vad)
    except Exception as exc:  # noqa: BLE001
        if not use_vad:
            raise
        logger.info("whisper with VAD failed (%s); retrying without VAD", exc)
        text, duration, coverage = _decode(model, audio_path, use_vad=False)
        return text, duration

    # Low coverage means whole passages were skipped (VAD or language misdetect).
    if use_vad and coverage < 0.6:
        logger.info("transcript covers only %.0f%% of audio; retrying without VAD", coverage * 100)
        try:
            alt_text, alt_duration, alt_coverage = _decode(model, audio_path, use_vad=False)
            if alt_coverage > coverage or len(alt_text) > len(text):
                return alt_text, alt_duration or duration
        except Exception as exc:  # noqa: BLE001
            logger.info("retry without VAD failed: %s", exc)
    return text, duration


def transcribe(audio_path: Path, filename: str) -> Transcript:
    """Transcribe audio; raises LLMUnavailable when no engine works."""
    errors: list[str] = []

    if _openai_configured() and settings.ai_transcribe_model:
        try:
            text = _transcribe_via_api(audio_path, filename)
            if len(text) > 40:
                return Transcript(text, f"api:{settings.ai_transcribe_model}")
            errors.append("api: too short")
        except Exception as exc:  # noqa: BLE001
            logger.warning("API transcription failed: %s", exc)
            errors.append(f"api: {type(exc).__name__}")

    if _faster_whisper_available():
        try:
            text, duration = _transcribe_local(audio_path)
            if len(text) > 20:
                return Transcript(text, f"faster-whisper:{settings.whisper_model}", duration)
            errors.append("local whisper: empty result")
        except Exception as exc:  # noqa: BLE001
            logger.warning("local whisper failed: %s", exc)
            errors.append(f"local whisper: {type(exc).__name__}: {str(exc)[:120]}")

    # Last try: multimodal free provider (works only on some g4f builds).
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
                            "Сделай полную транскрибацию лекции на языке оригинала. "
                            "Добавляй таймкоды [MM:SS] каждые 30–60 секунд. Верни только транскрипт."
                        ),
                    }
                ],
                media=[audio_file],
                web_search=False,
            )
        text = (response.choices[0].message.content or "").strip()
        if len(text) > 80 and "не могу" not in text.lower():
            return Transcript(text, "g4f:Gemini(multimodal)")
        errors.append("g4f multimodal: unsupported")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"g4f multimodal: {type(exc).__name__}")

    raise LLMUnavailable("; ".join(errors))
