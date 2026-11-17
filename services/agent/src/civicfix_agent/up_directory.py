"""UP Ward Directory – covers all 75 districts of Uttar Pradesh.

This module mirrors the ``BijnorWardDirectory`` pattern but operates on the
master CSV that contains every ward across every district in UP.  It is a
pure-CSV, dependency-free lookup: no embeddings, no network calls.
"""

from __future__ import annotations

import csv
import math
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
    'lucknow': 'Lucknow',
    'lkhnuu': 'Lucknow',
    'agra': 'Agra',
    'aagraa': 'Agra',
    'kanpur': 'Kanpur',
    'kaanpur': 'Kanpur',
    'varanasi': 'Varanasi',
    'vaaraanasii': 'Varanasi',
    'prayagraj': 'Prayagraj',
    'pryaagraaj': 'Prayagraj',
    'aligarh': 'Aligarh',
    'aliigdh': 'Aligarh',
}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute the great-circle distance in kilometers between two points."""
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


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
    match_level: Literal['municipality', 'district', 'nearest', 'none'] = 'district'


class UPWardDirectory:
    """Fast CSV-backed lookup for all 75 UP districts.

    Args:
        path: Path to ``up_ward_directory.csv`` (the merged master file).
        centroids_path: Optional path to ``up_municipality_centroids.csv``.
    """

    def __init__(self, path: Path, centroids_path: Path | None = None) -> None:
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

        # Load municipality centroids if available
        self._centroids: list[dict[str, object]] = []
        c_path = centroids_path or (path.parent / 'up_municipality_centroids.csv')
        if c_path.exists():
            with c_path.open('r', encoding='utf-8') as f:
                for r in csv.DictReader(f):
                    try:
                        lat_val = float(r['lat'])
                        lng_val = float(r['lng'])
                        self._centroids.append({
                            'district': r['district'],
                            'municipality_code': r['municipality_code'],
                            'municipality_name_en': r.get('municipality_name_en', ''),
                            'lat': lat_val,
                            'lng': lng_val,
                        })
                    except (ValueError, KeyError):
                        continue

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def lookup(
        self,
        address: dict[str, str | None],
        coords: tuple[float, float] | None = None,
        max_nearest_km: float = 25.0,
    ) -> UPWardContact | None:
        """Return the best ward contact for *address* or ``None``.

        Resolution order:
        1. Municipality-level match (city/town/village/suburb against
           English/Hindi municipality names within the resolved district).
        2. District-level fallback (best-priority municipality in district).
        3. Nearest municipality centroid (if coords are provided).
        """
        district_key = self._resolve_district_key(address)

        # --- Layer 1: municipality-level match ---
        city_hint = _first_value(address, 'city', 'town', 'village', 'suburb', 'municipality')
        if city_hint:
            contact = self._match_municipality(city_hint, district_key)
            if contact is not None:
                return contact

        # --- Layer 2: district-level fallback ---
        if district_key:
            rows = self._index.get(district_key, [])
            if rows:
                return _best_row(rows, match_level='district')

        # --- Layer 3: nearest municipality via coordinates ---
        lat = coords[0] if coords else _float_val(address.get('lat') or address.get('latitude'))
        lng = coords[1] if coords else _float_val(address.get('lng') or address.get('lon') or address.get('longitude'))
        if lat is not None and lng is not None:
            contact = self._nearest_municipality(lat, lng, max_km=max_nearest_km)
            if contact is not None:
                return contact

        return None

    def has_district(self, address: dict[str, str | None]) -> bool:
        """Return ``True`` if the address maps to any covered UP district."""
        return bool(self._resolve_district_key(address))

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _nearest_municipality(self, lat: float, lng: float, max_km: float = 25.0) -> UPWardContact | None:
        """Find the closest municipality within max_km using centroids."""
        if not self._centroids:
            return None

        best_dist = float('inf')
        best_candidate: dict[str, object] | None = None

        for c in self._centroids:
            d = haversine_km(lat, lng, c['lat'], c['lng'])
            if d < best_dist:
                best_dist = d
                best_candidate = c

        if best_candidate and best_dist <= max_km:
            dist_key = _normalise(str(best_candidate['district']))
            code = str(best_candidate['municipality_code'])
            rows = [
                r for r in self._index.get(dist_key, [])
                if r.get('municipality_code') == code
            ]
            if rows:
                return _best_row(rows, match_level='nearest')
            # fallback to district rows
            dist_rows = self._index.get(dist_key, [])
            if dist_rows:
                return _best_row(dist_rows, match_level='nearest')

        return None

    def _match_municipality(
        self,
        city_hint: str,
        district_key: str | None,
    ) -> UPWardContact | None:
        normalised = _normalise(city_hint)
        canonical = _MUNICIPALITY_ALIASES.get(normalised, city_hint)
        normalised_canonical = _normalise(canonical)

        candidate_rows: list[dict[str, str]] = []
        for key in [normalised, normalised_canonical]:
            candidate_rows.extend(self._muni_index.get(key, []))

        if not candidate_rows:
            return None

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
        false matches (e.g. "Agra-Lucknow Expressway" -> Agra instead of Auraiya).
        """
        candidates = [
            address.get('county'),
            address.get('state_district'),
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


def _first_value(address: dict[str, str | None], *keys: str) -> str | None:
    for key in keys:
        value = address.get(key)
        if value:
            return value
    return None


def _float_val(val: object) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _municipality_priority(row: dict[str, str]) -> int:
    """Lower number = higher priority."""
    return _MUNICIPALITY_TYPE_PRIORITY.get(
        _normalise(row.get('municipality_type', '')), 99
    )


def _best_row(
    rows: list[dict[str, str]],
    match_level: Literal['municipality', 'district', 'nearest', 'none'] = 'district',
) -> UPWardContact | None:
    if not rows:
        return None

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
