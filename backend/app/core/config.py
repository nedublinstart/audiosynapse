from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Synapse"
    secret_key: str = "synapse-dev-secret-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    database_url: str = f"sqlite:///{BASE_DIR / 'data' / 'synapse.db'}"
    upload_dir: Path = BASE_DIR / "uploads"

    # Optional OpenAI-compatible endpoint (OpenRouter / Groq / DeepSeek / Ollama).
    # Configure this when free providers are blocked in your region.
    ai_base_url: str = ""
    ai_api_key: str = ""
    ai_model: str = ""
    ai_transcribe_model: str = ""

    # Shared AI behaviour
    ai_timeout_seconds: float = 30.0
    ai_probe_timeout_seconds: float = 12.0
    ai_probe_workers: int = 6
    ai_max_attempts: int = 8
    ai_cache_seconds: float = 3600.0
    ai_notes_timeout_seconds: float = 120.0
    transcribe_timeout_seconds: float = 600.0

    # Notes quality: single-pass below this size; longer lectures use chunked extraction.
    notes_single_pass_max_chars: int = 32_000
    notes_chunk_size: int = 12_000

    # Local speech-to-text — "small" for conference-grade Russian lecture accuracy.
    whisper_model: str = "small"
    whisper_beam_size: int = 3
    # Empty = autodetect. Set e.g. "ru" or "en" when detection picks the wrong one.
    whisper_language: str = ""
    # VAD is ~2x faster but sometimes silently drops speech, so it is opt-in.
    whisper_vad: bool = False
    whisper_device: str = "auto"
    whisper_compute_type: str = "int8"

    # Set to true to use only your own AI_BASE_URL endpoint.
    ai_disable_g4f: bool = False

    # GPT4Free (https://github.com/xtekky/gpt4free) — free fallback engine.
    # Each provider is called with its own default model, so this list is only a hint.
    g4f_model: str = "gemini-3.6-flash"
    g4f_providers: str = ""
    g4f_api_key: str = ""
    g4f_proxy: str = ""

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


settings = Settings()
settings.upload_dir.mkdir(parents=True, exist_ok=True)
(BASE_DIR / "data").mkdir(parents=True, exist_ok=True)
Path.home().joinpath(".g4f", "cookies").mkdir(parents=True, exist_ok=True)
