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

    # GPT4Free (https://github.com/xtekky/gpt4free) — primary AI engine
    # gemini-3.6-flash works unauthenticated via g4f Provider.Gemini;
    # stronger models (3.1-pro / gpt-4o) need cookies or G4F_API_KEY.
    g4f_model: str = "gemini-3.6-flash"
    g4f_fallback_models: str = "gemini-3.1-pro,gpt-4o-mini,gpt-4o"
    g4f_providers: str = "Gemini,DeepSeek,Cerebras,Pollinations,OpenaiChat"
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
