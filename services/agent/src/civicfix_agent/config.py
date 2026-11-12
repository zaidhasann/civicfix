from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the agent service."""

    model_config = SettingsConfigDict(
        env_file=(
            str(Path(__file__).resolve().parents[2] / '.env'),
            '.env',
        ),
        env_prefix='AGENT_',
        extra='ignore',
    )

    environment: str = 'development'
    log_level: str = 'INFO'
    port: int = 8000
    llm_provider: Literal['openai', 'groq', 'gemini'] = 'openai'
    llm_api_key: str = ''
    llm_model: str = 'gpt-4o'
    llm_base_url: str = 'https://api.openai.com/v1'
    llm_timeout_seconds: float = 60.0
    llm_max_image_bytes: int = 10 * 1024 * 1024
    geocode_provider: Literal['nominatim', 'google'] = 'nominatim'
    geocode_user_agent: str = 'CivicFix/0.1 (contact@example.com)'
    geocode_timeout_seconds: float = 10.0
    geocode_rate_limit_seconds: float = 1.0
    geocode_cache_precision: int = 4
    run_secret: str = ''
    checkpoint_db: str = '.civicfix/runs.sqlite'
    tavily_api_key: str = ''
    tavily_timeout_seconds: float = 15.0
    bijnor_csv_path: Path = Path(__file__).resolve().parents[2] / 'data' / 'bijnor_ward_email_directory.csv'


@lru_cache
def get_settings() -> Settings:
    return Settings()
