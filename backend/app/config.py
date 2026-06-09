from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "sqlite:///./data/mindmap.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    # Lighter, faster model used for the open-question discussion chats.
    anthropic_haiku_model: str = "claude-haiku-4-5-20251001"

    whisper_model: str = "large-v3"
    whisper_device: str = "cuda"
    whisper_compute_type: str = "float16"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
