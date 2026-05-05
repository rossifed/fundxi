from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = Field(default="postgresql+asyncpg://fundxi:fundxi@localhost:5432/fundxi")
    sportmonks_api_token: str = Field(default="")
    sportmonks_base_url: str = Field(default="https://api.sportmonks.com/v3/football")
    # The Sportmonks season_id we currently bootstrap. WC2022 during dev,
    # WC2026 once the tournament starts. Same pipeline either way.
    active_season_id: int = Field(default=0)
    log_level: str = Field(default="INFO")


@lru_cache
def get_settings() -> Settings:
    return Settings()
