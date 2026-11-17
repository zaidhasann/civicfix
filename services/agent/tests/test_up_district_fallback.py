"""Tests: district-level fallback and road-name guard in UPWardDirectory."""
from __future__ import annotations

from pathlib import Path
import pytest

from civicfix_agent.up_directory import UPWardDirectory
from civicfix_agent.resolver import resolve_location
from civicfix_agent.vector_store import SearchResult, VectorDocument


_CSV = Path(__file__).resolve().parents[3] / 'services' / 'agent' / 'data' / 'up_ward_directory.csv'


@pytest.fixture(scope='module')
def up_dir() -> UPWardDirectory:
    if not _CSV.exists():
        pytest.skip(f'UP CSV not found at {_CSV}')
    return UPWardDirectory(_CSV)


class _EmptyVectorStore:
    def upsert(self, documents: list[VectorDocument]) -> None:
        pass

    def query(self, text: str, limit: int = 5, metadata_filter=None) -> list[SearchResult]:
        return []


def test_road_only_address_does_not_match_by_road_name(up_dir: UPWardDirectory) -> None:
    """An address with only a road name containing 'Agra' must NOT resolve to Agra district.

    The old _extract_district_from_road heuristic caused this bug.
    Without a district/city/county field, the resolver must return None from lookup()
    or fall through to the vector-store path.
    """
    address = {
        'road': 'Agra-Lucknow Expressway',
        'state': 'Uttar Pradesh',
        # Deliberately no 'city', 'district', 'county', etc.
    }
    contact = up_dir.lookup(address)
    # Without any city/district hint, lookup should return None (no road-based match)
    assert contact is None, (
        f'Expected None for road-only address, got district={contact.district if contact else "N/A"}'
    )


def test_district_field_gives_district_fallback(up_dir: UPWardDirectory) -> None:
    """When district is known but no city hint, we fall back to district-level."""
    address = {
        'district': 'Auraiya',
        'state': 'Uttar Pradesh',
        # No city/town
    }
    result = resolve_location(address, 'pothole', _EmptyVectorStore(), up_directory=up_dir)
    assert result.match_level == 'district', (
        f'Expected district match, got {result.match_level}'
    )
    email = result.email
    assert email and '@' in email, f'Expected a valid fallback email, got {email!r}'


def test_expressway_with_district_resolves_correctly(up_dir: UPWardDirectory) -> None:
    """Agra-Lucknow Expressway with district=Auraiya must NOT match Agra."""
    address = {
        'road': 'Agra-Lucknow Expressway',
        'city': 'Bidhuna',
        'district': 'Auraiya',
        'state': 'Uttar Pradesh',
    }
    result = resolve_location(address, 'pothole', _EmptyVectorStore(), up_directory=up_dir)
    assert 'agra' not in result.municipality.lower() or 'auraiya' in result.municipality.lower(), (
        f'Should not resolve to Agra district; got municipality={result.municipality}'
    )
    assert result.email and '@' in result.email, f'Expected a valid email, got {result.email!r}'
    assert '.invalid' not in (result.email or '')
