from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from civicfix_agent.contact_discovery import ContactDiscovery
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
    contact_source: str = 'local'
    verification_status: str = 'not_found'


def resolve_location(
    address: dict[str, str | None],
    issue_type: Literal['pothole', 'streetlight', 'garbage', 'drainage', 'other', 'not_an_issue'],
    vector_store: VectorStore,
    *,
    confidence_threshold: float = 0.65,
    contact_discovery: ContactDiscovery | None = None,
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
        resolution = _fallback(f'No jurisdiction documents matched city {city}', ward)
        return _discover_contact(resolution, city, ward, issue_type, contact_discovery)

    match = results[0]
    metadata = match.metadata
    confidence = _confidence(city, issue_type, match.text, match.distance)
    needs_review = confidence < confidence_threshold
    verified_local_contact = (
        metadata.get('verification_status') == 'verified' and bool(metadata.get('official_email'))
    )
    resolution = LocationResolution(
        municipality=metadata.get('city', city) if not needs_review else FallbackRecipient,
        ward=metadata.get('ward', ward) if not needs_review else ward,
        department=metadata.get('department', FallbackRecipient) if not needs_review else FallbackRecipient,
        email=metadata.get('official_email') if not needs_review and verified_local_contact else None,
        confidence=confidence,
        sources=_sources(match.metadata, match.document_id),
        needs_user_review=needs_review,
        contact_source='local',
        verification_status='verified' if verified_local_contact else 'not_found',
    )
    if needs_review:
        return _discover_contact(resolution, city, ward, issue_type, contact_discovery)
    return resolution


def _discover_contact(
    resolution: LocationResolution,
    city: str,
    geocoder_ward: str,
    issue_type: str,
    contact_discovery: ContactDiscovery | None,
) -> LocationResolution:
    if contact_discovery is None or issue_type == 'not_an_issue':
        return resolution
    result = contact_discovery.discover(city)
    if not result.email:
        return resolution
    return resolution.model_copy(
        update={
            'email': result.email,
            'needs_user_review': True,
            'confidence': min(0.6, max(resolution.confidence, 0.6)),
            'sources': result.sources,
            'contact_source': result.contact_source,
            'verification_status': 'unverified',
            'department': result.department,
            'municipality': result.authority,
            'ward': result.ward or geocoder_ward,
        }
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
        contact_source='local',
        verification_status='not_found',
    )


def _first_value(address: dict[str, str | None], *keys: str) -> str | None:
    for key in keys:
        value = address.get(key)
        if value:
            return value
    return None


def _sources(metadata: dict[str, str], document_id: str) -> list[str]:
    return [metadata.get('source_url', document_id)]
