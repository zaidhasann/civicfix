"""UP Ward Directory – covers all 75 districts of Uttar Pradesh.

This module mirrors the ``BijnorWardDirectory`` pattern but operates on the
master CSV that contains every ward across every district in UP.  It is a
pure-CSV, dependency-free lookup: no embeddings, no network calls.

CSV columns used
----------------
ward_id                 – unique row key (e.g. ``UP_agra_nagar_nigam_1_1``)
district                – district name in English (e.g. ``Agra``)
municipality_type       – ``Nagar Nigam`` / ``Nagar Palika Parishad`` / ``Nagar Panchayat``
municipality_code       – numeric code that groups wards inside the same municipality
ward_number             – ward number (integer as string)
municipal_contact_email – primary verified email for that municipality
fallback_contact_email  – state-level fallback when no municipality email exists
"""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from pathlib import Path

# Priority order: larger / more capable bodies first.
_MUNICIPALITY_TYPE_PRIORITY: dict[str, int] = {
    'nagar nigam': 0,
    'nagar palika parishad': 1,
    'nagar panchayat': 2,
}


@dataclass(frozen=True)
class UPWardContact:
    district: str
    municipality_code: str
    municipality_type: str
    ward_number: str
    email: str | None
    fallback_email: str | None
    source_url: str
    verification_status: str


class UPWardDirectory:
    """Fast CSV-backed lookup for all 75 UP districts.

    Args:
        path: Path to ``up_ward_directory.csv`` (the merged master file).
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        self._rows = self._load(path)
        # Pre-build a normalised district → rows index for fast lookup.
        self._index: dict[str, list[dict[str, str]]] = {}
        for row in self._rows:
            key = _normalise(row.get('district', ''))
            self._index.setdefault(key, []).append(row)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def lookup(self, address: dict[str, str | None]) -> UPWardContact | None:
        """Return the best ward contact for *address* or ``None``."""

        district_key = self._resolve_district_key(address)
        if not district_key:
            return None

        rows = self._index.get(district_key, [])
        if not rows:
            return None

        ward_hint = _normalise_ward(_first_value(address, 'ward', 'ward_zone', 'suburb'))

        # Try to find a ward-level match first.
        if ward_hint:
            ward_rows = [r for r in rows if _normalise_ward(r.get('ward_number')) == ward_hint]
            contact = _best_row(ward_rows)
            if contact:
                return contact

        # Fall back to the best-priority municipality in that district.
        return _best_row(rows)

    def has_district(self, address: dict[str, str | None]) -> bool:
        """Return ``True`` if the address maps to any covered UP district."""
        return bool(self._resolve_district_key(address))

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _resolve_district_key(self, address: dict[str, str | None]) -> str | None:
        """Try multiple address fields to find a matching district key."""
        # Fields most likely to carry the district name, in priority order.
        candidates = [
            address.get('county'),          # Nominatim/OSM: district is often 'county'
            address.get('state_district'),  # Also used by some geocoders
            address.get('district'),
            address.get('city'),
            address.get('town'),
            address.get('municipality'),
            address.get('suburb'),
            self._extract_district_from_road(address.get('road') or address.get('street')),
        ]
        for raw in candidates:
            if not raw:
                continue
            key = _normalise(raw)
            if key in self._index:
                return key
            # Partial match: "Kanpur Nagar" → "kanpur nagar", "kanpur"
            for district_key in self._index:
                if district_key in key or key in district_key:
                    return district_key
        return None

    def _extract_district_from_road(self, road: str | None) -> str | None:
        if not road:
            return None
        # Check if any known UP district name appears in the road name (e.g. 'Agra Expressway' -> 'Agra')
        road_clean = _normalise(road)
        for district_key in sorted(self._index.keys(), key=len, reverse=True):
            pattern = rf'\b{re.escape(district_key)}\b'
            if re.search(pattern, road_clean):
                return district_key
        return None

    @staticmethod
    def _load(path: Path) -> list[dict[str, str]]:
        with path.open(encoding='utf-8-sig', newline='') as f:
            return list(csv.DictReader(f))


# ------------------------------------------------------------------
# Module-level helpers
# ------------------------------------------------------------------

def _normalise(value: str) -> str:
    return re.sub(r'\s+', ' ', value).strip().casefold()


def _normalise_ward(value: str | None) -> str | None:
    if not value:
        return None
    match = re.search(r'\d+', value)
    return str(int(match.group())) if match else _normalise(value)


def _first_value(address: dict[str, str | None], *keys: str) -> str | None:
    for key in keys:
        value = address.get(key)
        if value:
            return value
    return None


def _municipality_priority(row: dict[str, str]) -> int:
    """Lower number = higher priority."""
    return _MUNICIPALITY_TYPE_PRIORITY.get(
        _normalise(row.get('municipality_type', '')), 99
    )


def _best_row(rows: list[dict[str, str]]) -> UPWardContact | None:
    """Pick the highest-priority row that has a usable email."""
    if not rows:
        return None

    # Sort by municipality priority; prefer rows with an email.
    sorted_rows = sorted(rows, key=lambda r: (_municipality_priority(r), not bool(r.get('municipal_contact_email'))))

    for row in sorted_rows:
        email = row.get('municipal_contact_email') or None
        fallback = row.get('fallback_contact_email') or None
        if email or fallback:
            return UPWardContact(
                district=row.get('district', ''),
                municipality_code=row.get('municipality_code', ''),
                municipality_type=row.get('municipality_type', ''),
                ward_number=row.get('ward_number', ''),
                email=email,
                fallback_email=fallback,
                source_url='https://localbodies.up.nic.in/',
                verification_status='verified' if email else 'fallback',
            )
    return None
