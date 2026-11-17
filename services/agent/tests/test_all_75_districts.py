"""Exhaustive sanity test across all 75 Uttar Pradesh districts."""
from __future__ import annotations

import csv
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


def _get_all_75_districts() -> list[str]:
    if not _CSV.exists():
        return []
    with _CSV.open('r', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    return sorted(list(set(r['district'] for r in rows)))


ALL_DISTRICTS = _get_all_75_districts()


@pytest.mark.parametrize('district_name', ALL_DISTRICTS)
def test_all_75_districts_resolve_valid_non_empty_email(up_dir: UPWardDirectory, district_name: str) -> None:
    """Every single UP district must resolve to a valid email (verified or fallback), never None or .invalid."""
    address = {
        'district': district_name,
        'state': 'Uttar Pradesh',
    }
    result = resolve_location(address, 'pothole', _EmptyVectorStore(), up_directory=up_dir)

    assert result is not None, f"Failed to resolve district {district_name}"
    assert result.email and '@' in result.email, f"District {district_name} resolved to invalid email: {result.email!r}"
    assert '.invalid' not in result.email, f"District {district_name} returned placeholder: {result.email}"
    assert result.match_level in ('municipality', 'district', 'nearest'), (
        f"District {district_name} unexpected match_level: {result.match_level}"
    )
