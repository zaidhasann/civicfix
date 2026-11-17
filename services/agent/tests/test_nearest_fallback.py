"""Tests: nearest-municipality centroid lookup and road-name removal."""
from __future__ import annotations

from pathlib import Path
import pytest

from civicfix_agent.up_directory import UPWardDirectory
from civicfix_agent.resolver import resolve_location
from civicfix_agent.vector_store import SearchResult, VectorDocument


_DATA_DIR = Path(__file__).resolve().parents[3] / 'services' / 'agent' / 'data'
_CSV = _DATA_DIR / 'up_ward_directory.csv'
_CENTROIDS = _DATA_DIR / 'up_municipality_centroids.csv'


@pytest.fixture(scope='module')
def up_dir() -> UPWardDirectory:
    if not _CSV.exists():
        pytest.skip(f'UP CSV not found at {_CSV}')
    return UPWardDirectory(_CSV, centroids_path=_CENTROIDS)


class _EmptyVectorStore:
    def upsert(self, documents: list[VectorDocument]) -> None:
        pass

    def query(self, text: str, limit: int = 5, metadata_filter=None) -> list[SearchResult]:
        return []


def test_expressway_point_resolves_to_nearest_bidhuna_centroid(up_dir: UPWardDirectory) -> None:
    """A point along Agra-Lucknow Expressway near Bidhuna with no city/district in address

    should resolve via nearest centroid to Bidhuna (Auraiya district), NOT Agra.
    Coordinates for Bidhuna area: lat=26.77, lng=79.53.
    """
    address = {
        'road': 'Agra-Lucknow Expressway',
        'state': 'Uttar Pradesh',
    }
    coords = (26.77, 79.53)

    result = resolve_location(
        address,
        'pothole',
        _EmptyVectorStore(),
        coords=coords,
        up_directory=up_dir,
    )

    assert result.match_level == 'nearest', f'Expected match_level=nearest, got {result.match_level}'
    assert 'auraiya' in result.municipality.lower() or 'bidhuna' in result.municipality.lower(), (
        f'Expected Auraiya/Bidhuna, got municipality={result.municipality}'
    )
    assert 'agra' not in result.municipality.lower()
    assert result.email and '@' in result.email
    assert '.invalid' not in result.email


def test_road_without_coords_and_without_district_does_not_match(up_dir: UPWardDirectory) -> None:
    """Without coords and without district/city hint, expressway address cannot guess Agra."""
    address = {
        'road': 'Agra-Lucknow Expressway',
        'state': 'Uttar Pradesh',
    }
    contact = up_dir.lookup(address, coords=None)
    assert contact is None
