from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class BijnorWardContact:
    municipality: str
    ward_number: str
    email: str | None
    source_url: str
    verification_status: str
    municipality_type: str


class BijnorWardDirectory:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._rows = self._load(path)
        self._municipalities = sorted({row['municipality'] for row in self._rows}, key=len, reverse=True)

    @staticmethod
    def _load(path: Path) -> list[dict[str, str]]:
        with path.open(encoding='utf-8-sig', newline='') as csv_file:
            return list(csv.DictReader(csv_file))

    def lookup(self, address: dict[str, str | None]) -> BijnorWardContact | None:
        city = _first_value(address, 'city', 'town', 'municipality')
        road = _first_value(address, 'road', 'street')

        # If road contains a specific municipality name (e.g. "Mandawar Road"),
        # extract it as a potential city override or fallback
        road_municipality = self._extract_municipality_from_road(road)

        if not city:
            if road_municipality:
                city = road_municipality
            else:
                return None

        ward = _normalise_ward(_first_value(address, 'ward', 'ward_zone', 'suburb'))
        city_key = _normalise_text(city)

        matched_municipalities = {
            row['municipality']
            for row in self._rows
            if _city_matches(row.get('municipality', ''), city_key)
        }

        # If city was generic Bijnor (or district) but road specifically mentions another town like Mandawar,
        # add the road's municipality to the candidate set for disambiguation
        if road_municipality:
            matched_municipalities.add(road_municipality)

        if not matched_municipalities:
            return None

        chosen_municipality = _disambiguate_municipality(matched_municipalities, city_key)

        matches = [
            row
            for row in self._rows
            if row.get('municipality') == chosen_municipality
            and (ward is None or _normalise_ward(row.get('ward_number')) == ward)
        ]
        if not matches:
            return None
        row = next((candidate for candidate in matches if candidate.get('municipal_contact_email')), None)
        if row is None:
            return None
        return BijnorWardContact(
            municipality=row['municipality'],
            ward_number=row['ward_number'],
            email=row['municipal_contact_email'],
            source_url='https://bijnor.nic.in/',
            verification_status='verified',
            municipality_type=row['municipality_type'],
        )

    def has_city(self, address: dict[str, str | None]) -> bool:
        city = _first_value(address, 'city', 'town', 'municipality')
        road = _first_value(address, 'road', 'street')
        if not city and road:
            city = self._extract_municipality_from_road(road)
        return bool(
            city
            and any(
                _city_matches(row.get('municipality', ''), _normalise_text(city))
                for row in self._rows
            )
        )

    def _extract_municipality_from_road(self, road: str | None) -> str | None:
        if not road:
            return None
        for mun in self._municipalities:
            # Match town name as a distinct word in the road name
            # e.g. "Mandawar Road", "Bijnor-Mandawar Marg" -> "Mandawar"
            pattern = rf'\b{re.escape(mun)}\b'
            if re.search(pattern, road, re.IGNORECASE):
                # If the town name found is generic "Bijnor", check if a more specific one exists
                if _normalise_text(mun) == 'bijnor':
                    continue
                return mun
        return None

    def documents(self) -> list[dict[str, str]]:
        return [
            {
                'city': row['municipality'],
                'ward': f'Ward {row["ward_number"]}',
                'department': row['municipality_type'],
                'doc_type': 'bijnor_ward_directory',
                'source_url': 'https://bijnor.nic.in/',
                'official_email': row['municipal_contact_email'],
                'verification_status': 'verified'
                if row['email_verification']
                else 'not_found',
                'district': row['district'],
                'state': row['state'],
            }
            for row in self._rows
        ]


def _first_value(address: dict[str, str | None], *keys: str) -> str | None:
    for key in keys:
        value = address.get(key)
        if value:
            return value
    return None


def _normalise_text(value: str) -> str:
    return re.sub(r'\s+', ' ', value).strip().casefold()


def _city_matches(municipality: str, city_key: str) -> bool:
    norm_mun = _normalise_text(municipality)
    if norm_mun == city_key:
        return True
    segments = [re.sub(r'\s+', ' ', seg).strip().casefold() for seg in re.split(r'[,;/\-]+', city_key)]
    if norm_mun in segments:
        return True
    pattern = rf'\b{re.escape(norm_mun)}\b'
    return bool(re.search(pattern, city_key))


def _disambiguate_municipality(candidates: set[str], city_key: str) -> str:
    if len(candidates) == 1:
        return next(iter(candidates))
    non_bijnor = [c for c in candidates if _normalise_text(c) != 'bijnor']
    if non_bijnor:
        return max(non_bijnor, key=lambda c: len(_normalise_text(c)))
    return next(iter(candidates))


def _normalise_ward(value: str | None) -> str | None:
    if not value:
        return None
    match = re.search(r'\d+', value)
    return str(int(match.group())) if match else _normalise_text(value)
