"""Application settings, loaded from environment / .env."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # AWEAR API
    awear_api_key: str = ""
    awear_base_url: str = "https://awear-b2b-2026.vercel.app/api/v1"

    # Signal
    sample_rate_hz: int = 256
    # AWEAR data lands with a lag; live windows are shifted back by this much
    # so a "last 5 minutes" request hits data that has actually arrived.
    data_delay_seconds: int = 300

    # Tiredness FTR baseline: a fixed "calm" clock-time window (local to the
    # request tz) whose mean (theta+alpha)/beta ratio is the 0% reference the
    # FTR brackets are measured against. Demo placeholder — see
    # app/analysis/tiredness.py.
    baseline_start_time: str = "15:06:06"
    baseline_end_time: str = "15:08:05"

    # App
    app_name: str = "brainpace"
    artifacts_dir: str = "artifacts"

    # Demo cache: TTL (seconds) for the local SQLite cache that spares the
    # AWEAR API during polling. Set to 0 to disable caching entirely.
    cache_ttl_seconds: int = 60

    # CORS: comma-separated allowed origins for the Expo app. "*" = any origin.
    cors_origins: str = "*"

    @property
    def cors_allow_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
