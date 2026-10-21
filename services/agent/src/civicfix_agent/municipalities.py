from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl

VerificationStatus = Literal['verified', 'unverified']


class MunicipalityEntry(BaseModel):
    model_config = ConfigDict(extra='forbid')

    city: str = Field(min_length=1)
    ward_zone: str = Field(min_length=1)
    department: str = Field(min_length=1)
    category_responsibilities: dict[str, str] = Field(min_length=1)
    official_email: EmailStr | None
    notice_format_notes: str = Field(min_length=1)
    source_url: HttpUrl
    last_verified_date: date | None
    verification_status: VerificationStatus
    verification_notes: str = Field(min_length=1)


class MunicipalityDirectory(BaseModel):
    model_config = ConfigDict(extra='forbid')

    municipalities: list[MunicipalityEntry] = Field(min_length=1)


def load_municipalities(path: Path | None = None) -> MunicipalityDirectory:
    """Load and validate the municipality directory JSON."""

    data_path = path or Path(__file__).resolve().parents[2] / 'data' / 'municipalities.json'
    with data_path.open(encoding='utf-8') as data_file:
        return MunicipalityDirectory.model_validate(json.load(data_file))
