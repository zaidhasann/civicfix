from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from civicfix_agent.vector_store import VectorStore

FallbackRecipient = 'CivicFix review queue'


class LocationResolution(BaseModel):
    model_config = ConfigDict(extra='forbid')

    municipality: str
    ward: str
    department: str
    email: str | None
    confidence: float = Field(ge=0, le=1)
    sources: list[str]
    needs_user_review: bool


def resolve_location(
    address: dict[str, str | None],
    issue_type: Literal['pothole', 'streetlight', 'garbage', 'drainage', 'other', 'not_an_issue'],
    vector_store: VectorStore,
    *,
    confidence_threshold: float = 0.65,
) -> LocationResolution:
    city = _first_value(address, 'city', 'town', 'municipality')
    ward = _first_value(address, 'ward', 'ward_zone', 'suburb') or 'Unknown'
    if not city:
        return _fallback('No city was returned by geocoding', ward)

    results = vector_store.query(
        f'{city} {issue_type}',
        limit=5,
        metadata_filter={'city': city},
    )
    if not results:
        return _fallback(f'No jurisdiction documents matched city {city}', ward)

    match = results[0]
    metadata = match.metadata
    confidence = _confidence(city, issue_type, match.text, match.distance)
    needs_review = confidence < confidence_threshold
    return LocationResolution(
        municipality=metadata.get('city', city) if not needs_review else FallbackRecipient,
        ward=metadata.get('ward', ward) if not needs_review else ward,
        department=metadata.get('department', FallbackRecipient) if not needs_review else FallbackRecipient,
        email=metadata.get('official_email') if not needs_review else None,
        confidence=confidence,
        sources=_sources(match.metadata, match.document_id),
        needs_user_review=needs_review,
    )


def _confidence(city: str, issue_type: str, text: str, distance: float) -> float:
    score = 0.35
    if city.casefold() in text.casefold():
        score += 0.25
    if issue_type.casefold() in text.casefold():
        score += 0.25
    return min(0.99, max(0.0, score + max(0.0, 0.15 - distance * 0.05)))


def _fallback(reason: str, ward: str) -> LocationResolution:
    return LocationResolution(
        municipality=FallbackRecipient,
        ward=ward,
        department=FallbackRecipient,
        email=None,
        confidence=0,
        sources=[reason],
        needs_user_review=True,
    )


def _first_value(address: dict[str, str | None], *keys: str) -> str | None:
    for key in keys:
        value = address.get(key)
        if value:
            return value
    return None


def _sources(metadata: dict[str, str], document_id: str) -> list[str]:
    return [metadata.get('source_url', document_id)]
