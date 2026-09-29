from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the agent service."""

    model_config = SettingsConfigDict(env_file='.env', env_prefix='AGENT_', extra='ignore')

    environment: str = 'development'
    log_level: str = 'INFO'
    port: int = 8000


@lru_cache
def get_settings() -> Settings:
    return Settings()