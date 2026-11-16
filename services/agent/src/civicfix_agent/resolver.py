from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from civicfix_agent.bijnor_directory import BijnorWardDirectory
from civicfix_agent.up_directory import UPWardDirectory
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
    bijnor_directory: BijnorWardDirectory | None = None,
    up_directory: UPWardDirectory | None = None,
) -> LocationResolution:
    ward = _first_value(address, 'ward', 'ward_zone', 'suburb') or 'Unknown'

    if bijnor_directory is not None:
        bijnor_contact = bijnor_directory.lookup(address)
        if bijnor_contact is not None:
            return LocationResolution(
                municipality=bijnor_contact.municipality,
                ward=f'Ward {bijnor_contact.ward_number}',
                department=bijnor_contact.municipality_type,
                email=bijnor_contact.email,
                confidence=0.95,
                sources=[bijnor_contact.source_url],
                needs_user_review=False,
                contact_source='bijnor_csv',
                verification_status=bijnor_contact.verification_status,
            )
        if bijnor_directory.has_city(address):
            resolved_city = _first_value(address, 'city', 'town', 'municipality') or 'Bijnor'
            return _discover_contact(
                _fallback(f'No verified Bijnor CSV email matched {resolved_city}', ward),
                resolved_city,
                ward,
                issue_type,
                contact_discovery,
            )

    # UP 75-district directory (covers all UP districts except Bijnor which has its own).
    if up_directory is not None:
        up_contact = up_directory.lookup(address)
        if up_contact is not None:
            district_label = up_contact.district
            muni_label = f'{district_label} {up_contact.municipality_type}'
            email = up_contact.email or up_contact.fallback_email
            return LocationResolution(
                municipality=muni_label,
                ward=f'Ward {up_contact.ward_number}' if up_contact.ward_number else ward,
                department=up_contact.municipality_type,
                email=email,
                confidence=0.95 if up_contact.email else 0.7,
                sources=[up_contact.source_url],
                needs_user_review=not bool(up_contact.email),
                contact_source='up_csv',
                verification_status=up_contact.verification_status,
            )
        if up_directory.has_district(address):
            resolved_city = _first_value(address, 'city', 'town', 'municipality',
                                         'county', 'state_district', 'district') or 'Unknown'
            return _discover_contact(
                _fallback(f'No UP CSV email matched {resolved_city}', ward),
                resolved_city,
                ward,
                issue_type,
                contact_discovery,
            )

    city = _first_value(address, 'city', 'town', 'municipality', 'county', 'district', 'suburb')
    road = _first_value(address, 'road', 'street')
    search_query = ' '.join(filter(None, [city, road, issue_type]))
    if not search_query:
        return _fallback('No location details were returned by geocoding', ward)

    # First try querying with city filter if city is known
    results = vector_store.query(
        search_query,
        limit=5,
        metadata_filter={'city': city} if city else None,
    )
    # If no results with strict filter, run semantic search across all indexed municipalities
    if not results:
        results = vector_store.query(search_query, limit=5)

    if not results:
        resolution = _fallback(f'No jurisdiction documents matched query: {search_query}', ward)
        return _discover_contact(resolution, city or 'Unknown', ward, issue_type, contact_discovery)

    match = results[0]
    metadata = match.metadata
    confidence = _confidence(city, issue_type, match.text, match.distance)
    needs_review = confidence < confidence_threshold
    verified_local_contact = (
        metadata.get('verification_status') == 'verified' and bool(metadata.get('official_email'))
    )
    # Map municipality and email from semantic search match
    matched_municipality = metadata.get('district') or metadata.get('city') or city or 'Local Authority'
    if metadata.get('department'):
        matched_municipality = f"{matched_municipality} {metadata.get('department')}"
    matched_email = metadata.get('official_email') or None

    resolution = LocationResolution(
        municipality=matched_municipality,
        ward=metadata.get('ward', ward) or ward,
        department=metadata.get('department', 'Municipal Administration'),
        email=matched_email,
        confidence=confidence,
        sources=_sources(match.metadata, match.document_id),
        needs_user_review=needs_review,
        contact_source='vector_store',
        verification_status=metadata.get('verification_status', 'unverified'),
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


def _confidence(city: str | None, issue_type: str, text: str, distance: float) -> float:
    score = 0.35
    if city and city.casefold() in text.casefold():
        score += 0.25
    if issue_type and issue_type.casefold() in text.casefold():
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
