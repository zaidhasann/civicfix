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
municipality_name_hi    – municipality name in Hindi script
municipality_name_en    – municipality name in English (machine-transliterated, needs review)
ward_number             – ward number (integer as string)
municipal_contact_email – primary verified email for that municipality
fallback_contact_email  – state-level fallback when no municipality email exists
"""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

# Priority order: larger / more capable bodies first.
_MUNICIPALITY_TYPE_PRIORITY: dict[str, int] = {
    'nagar nigam': 0,
    'nagar palika parishad': 1,
    'nagar panchayat': 2,
}

# Spelling-variant alias map: normalised input → canonical English name.
# Applied during municipality matching so "Bidhuna", "Bilhuna", "Bidhuunaa"
# all resolve to the same row. Add entries here as variants are discovered.
_MUNICIPALITY_ALIASES: dict[str, str] = {
    'bidhuna': 'Bidhuna',
    'bilhuna': 'Bidhuna',
    'bidhuunaa': 'Bidhuna',
    'phaphund': 'Phaphund',
    'phphuud': 'Phaphund',
    'atasu': 'Atasu',
    'attsuu': 'Atasu',
    'dibiyapur': 'Dibiyapur',
    'dibiyaapur': 'Dibiyapur',
    'achhalda': 'Achhalda',
    'achldaa': 'Achhalda',
    'jais': 'Jais',
    'jayas': 'Jais',
    'allahabad': 'Prayagraj',
}


@dataclass(frozen=True)
class UPWardContact:
    district: str
    municipality_code: str
    municipality_type: str
    municipality_name_en: str
    ward_number: str
    email: str | None
    fallback_email: str | None
    source_url: str
    verification_status: str
    match_level: Literal['municipality', 'district', 'none'] = 'district'


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
        # Pre-build municipality_name_en → rows index for municipality-level match.
        self._muni_index: dict[str, list[dict[str, str]]] = {}
        for row in self._rows:
            en_name = _normalise(row.get('municipality_name_en', ''))
            hi_name = _normalise(row.get('municipality_name_hi', ''))
            if en_name:
                self._muni_index.setdefault(en_name, []).append(row)
            if hi_name and hi_name != en_name:
                self._muni_index.setdefault(hi_name, []).append(row)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def lookup(self, address: dict[str, str | None]) -> UPWardContact | None:
        """Return the best ward contact for *address* or ``None``.

        Resolution order:
        1. Municipality-level match (city/town/village/suburb against
           English/Hindi municipality names within the resolved district).
        2. District-level fallback (best-priority municipality in district).
        """
        district_key = self._resolve_district_key(address)

        # --- Layer 1: municipality-level match ---
        city_hint = _first_value(address, 'city', 'town', 'village', 'suburb', 'municipality')
        if city_hint:
            contact = self._match_municipality(city_hint, district_key)
            if contact is not None:
                return contact

        # --- Layer 2: district-level fallback ---
        if not district_key:
            return None
        rows = self._index.get(district_key, [])
        if not rows:
            return None

        contact = _best_row(rows, match_level='district')
        return contact

    def has_district(self, address: dict[str, str | None]) -> bool:
        """Return ``True`` if the address maps to any covered UP district."""
        return bool(self._resolve_district_key(address))

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _match_municipality(
        self,
        city_hint: str,
        district_key: str | None,
    ) -> UPWardContact | None:
        """Try to find a municipality row matching *city_hint*.

        Checks alias map first, then looks up normalised English/Hindi names.
        If *district_key* is known, restricts the search to that district.
        """
        normalised = _normalise(city_hint)
        # Apply alias map (e.g. "Bilhuna" → "Bidhuna")
        canonical = _MUNICIPALITY_ALIASES.get(normalised, city_hint)
        normalised_canonical = _normalise(canonical)

        # Collect candidate rows from the municipality index
        candidate_rows: list[dict[str, str]] = []
        for key in [normalised, normalised_canonical]:
            candidate_rows.extend(self._muni_index.get(key, []))

        if not candidate_rows:
            return None

        # Filter to district if known
        if district_key:
            district_rows = [
                r for r in candidate_rows
                if _normalise(r.get('district', '')) == district_key
            ]
            if district_rows:
                candidate_rows = district_rows

        return _best_row(candidate_rows, match_level='municipality')

    def _resolve_district_key(self, address: dict[str, str | None]) -> str | None:
        """Try multiple address fields to find a matching district key.

        NOTE: Road-name extraction has been intentionally removed to avoid
        false matches (e.g. "Agra-Lucknow Expressway" → Agra instead of Auraiya).
        """
        # Fields most likely to carry the district name, in priority order.
        candidates = [
            address.get('county'),          # Nominatim/OSM: district is often 'county'
            address.get('state_district'),  # Also used by some geocoders
            address.get('district'),
            address.get('city'),
            address.get('town'),
            address.get('municipality'),
            address.get('suburb'),
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


def _best_row(
    rows: list[dict[str, str]],
    match_level: Literal['municipality', 'district', 'none'] = 'district',
) -> UPWardContact | None:
    """Pick the highest-priority row that has a usable email."""
    if not rows:
        return None

    # Sort by municipality priority; prefer rows with an email.
    sorted_rows = sorted(
        rows,
        key=lambda r: (_municipality_priority(r), not bool(r.get('municipal_contact_email'))),
    )

    for row in sorted_rows:
        email = row.get('municipal_contact_email') or None
        fallback = row.get('fallback_contact_email') or None
        if email or fallback:
            return UPWardContact(
                district=row.get('district', ''),
                municipality_code=row.get('municipality_code', ''),
                municipality_type=row.get('municipality_type', ''),
                municipality_name_en=row.get('municipality_name_en', ''),
                ward_number=row.get('ward_number', ''),
                email=email,
                fallback_email=fallback,
                source_url='https://localbodies.up.nic.in/',
                verification_status='verified' if email else 'fallback',
                match_level=match_level,
            )
    return None
