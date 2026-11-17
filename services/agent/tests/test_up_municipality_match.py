"""Tests: municipality-level matching in UPWardDirectory and resolver."""
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


def test_bidhuna_resolves_at_municipality_level(up_dir: UPWardDirectory) -> None:
    """Bidhuna (Auraiya district) should match at municipality level, not district level."""
    address = {
        'city': 'Bidhuna',
        'state': 'Uttar Pradesh',
    }
    contact = up_dir.lookup(address)
    assert contact is not None, 'Expected a contact for Bidhuna'
    assert contact.match_level == 'municipality', (
        f'Expected municipality match, got {contact.match_level}'
    )
    assert contact.district.lower() == 'auraiya', (
        f'Expected district=Auraiya, got {contact.district}'
    )
    # Must return a real email (verified or state fallback), never empty or placeholder
    email = contact.email or contact.fallback_email
    assert email and '@' in email, f'Expected a valid email, got {email!r}'


def test_bidhuna_via_resolver_returns_valid_email(up_dir: UPWardDirectory) -> None:
    """resolve_location for Bidhuna should return a real email and match_level=municipality."""
    address = {
        'road': 'Agra-Lucknow Expressway',
        'city': 'Bidhuna',
        'state': 'Uttar Pradesh',
    }
    result = resolve_location(address, 'pothole', _EmptyVectorStore(), up_directory=up_dir)
    assert result.match_level == 'municipality', (
        f'Expected municipality match, got {result.match_level}'
    )
    assert result.email and '@' in result.email, (
        f'Expected a valid email, got {result.email!r}'
    )
    assert result.email != 'unassigned@example.invalid', 'Must not return placeholder email'
    assert '.invalid' not in (result.email or ''), 'Must not return .invalid email'


def test_lucknow_resolves_at_municipality_level(up_dir: UPWardDirectory) -> None:
    address = {'city': 'Lucknow', 'district': 'Lucknow', 'state': 'Uttar Pradesh'}
    contact = up_dir.lookup(address)
    assert contact is not None
    assert contact.match_level == 'municipality'
    assert 'lucknow' in contact.district.lower()


def test_agra_resolves_at_municipality_level(up_dir: UPWardDirectory) -> None:
    address = {'city': 'Agra', 'district': 'Agra', 'state': 'Uttar Pradesh'}
    contact = up_dir.lookup(address)
    assert contact is not None
    assert contact.match_level == 'municipality'


def test_no_fake_email_returned(up_dir: UPWardDirectory) -> None:
    """Resolver must never return a .invalid address."""
    addresses = [
        {'city': 'Bidhuna', 'state': 'Uttar Pradesh'},
        {'city': 'Lucknow', 'district': 'Lucknow', 'state': 'Uttar Pradesh'},
        {'city': 'Agra', 'district': 'Agra', 'state': 'Uttar Pradesh'},
        {'city': 'Varanasi', 'district': 'Varanasi', 'state': 'Uttar Pradesh'},
    ]
    store = _EmptyVectorStore()
    for addr in addresses:
        result = resolve_location(addr, 'pothole', store, up_directory=up_dir)
        assert result.email != 'unassigned@example.invalid', (
            f'Got placeholder for {addr}'
        )
        assert '.invalid' not in (result.email or ''), (
            f'Got .invalid email for {addr}: {result.email}'
        )
