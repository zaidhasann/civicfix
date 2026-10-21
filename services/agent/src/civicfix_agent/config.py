from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the agent service."""

    model_config = SettingsConfigDict(env_file='.env', env_prefix='AGENT_', extra='ignore')

    environment: str = 'development'
    log_level: str = 'INFO'
    port: int = 8000
    llm_provider: Literal['openai', 'gemini'] = 'openai'
    llm_api_key: str = ''
    llm_model: str = 'gpt-4o'
    llm_timeout_seconds: float = 20.0
    llm_max_image_bytes: int = 10 * 1024 * 1024
    geocode_provider: Literal['nominatim', 'google'] = 'nominatim'
    geocode_user_agent: str = 'CivicFix/0.1 (contact@example.com)'
    geocode_timeout_seconds: float = 10.0
    geocode_rate_limit_seconds: float = 1.0
    geocode_cache_precision: int = 4


@lru_cache
def get_settings() -> Settings:
    return Settings()