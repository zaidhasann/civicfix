from __future__ import annotations

import re
from typing import Protocol

from pydantic import BaseModel, ConfigDict


class PhotoPrivacyAssessment(BaseModel):
    model_config = ConfigDict(extra='forbid')

    face_detected: bool
    plate_detected: bool
    requires_blur: bool
    detector_available: bool


class PhotoPrivacyDetector(Protocol):
    def detect(self, image_url: str) -> PhotoPrivacyAssessment: ...


class UnavailablePhotoPrivacyDetector:
    """Explicit fallback when an image detector is not configured."""

    def detect(self, image_url: str) -> PhotoPrivacyAssessment:
        return PhotoPrivacyAssessment(
            face_detected=False,
            plate_detected=False,
            requires_blur=False,
            detector_available=False,
        )


_PII_PATTERNS = (
    (re.compile(r'\b[\w.+-]+@[\w-]+\.[\w.-]+\b'), '[redacted email]'),
    (re.compile(r'(?<!\d)(?:\+?\d[\d\s().-]{7,}\d)(?!\d)'), '[redacted phone]'),
    (re.compile(r'\b\d{4}\s?\d{4}\s?\d{4}\b'), '[redacted ID]'),
)
_INJECTION_PATTERN = re.compile(
    r'(?:ignore|disregard|forget)\b[^.!?\n]*(?:instructions|prompt|rules)[^.!?\n]*[.!?]?'
    r'|^\s*(?:system|developer|assistant)\s*:\s*.*?$',
    re.IGNORECASE | re.MULTILINE,
)


def redact_untrusted_description(description: str) -> str:
    """Treat report text as data: remove PII and instruction-like control text."""

    sanitized = _INJECTION_PATTERN.sub('[removed instruction-like text]', description)
    for pattern, replacement in _PII_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized.strip()


def assess_photo_privacy(
    image_url: str,
    detector: PhotoPrivacyDetector | None = None,
) -> PhotoPrivacyAssessment:
    return (detector or UnavailablePhotoPrivacyDetector()).detect(image_url)
