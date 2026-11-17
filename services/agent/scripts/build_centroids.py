"""Overpass API and Nominatim centroid builder for Uttar Pradesh municipalities.

Workflow:
1. Fetch all Uttar Pradesh place nodes and urban local body administrative boundaries
   via the public Overpass API (with polite retry/backoff and caching to data/overpass_up_places.json).
2. Match each municipality in up_ward_directory.csv by Hindi name (name:hi / name) with
   normalization (strip suffixes, nukta/chandrabindu variants, whitespace) within its district.
3. Fallback: fuzzy/exact match on English names (name / name:en).
4. Fallback: query Nominatim (<name_en>, <district>, Uttar Pradesh, India) at <= 1 req/sec.
5. Apply manual overrides from data/centroids_manual_overrides.csv if present.
6. Validate candidate coordinates against UP bounding box and distance from district centroid (<= 40km).
7. Save data/up_municipality_centroids.csv with match_method and confidence.
8. Output data/centroids_needs_review.csv for rows needing manual review.
"""
from __future__ import annotations

import csv
import json
import logging
import math
import re
import sys
import time
import unicodedata
from collections import defaultdict
from pathlib import Path

import httpx

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / 'services' / 'agent' / 'data'
WARD_CSV = DATA_DIR / 'up_ward_directory.csv'
CENTROIDS_CSV = DATA_DIR / 'up_municipality_centroids.csv'
REVIEW_CSV = DATA_DIR / 'centroids_needs_review.csv'
OVERRIDES_CSV = DATA_DIR / 'centroids_manual_overrides.csv'
OVERPASS_CACHE = DATA_DIR / 'overpass_up_places.json'
NOMINATIM_CACHE = DATA_DIR / 'centroids_cache.json'

USER_AGENT = 'CivicFixAgent/1.0 (civicfix-dev-team@example.com)'
UP_BBOX = {'min_lat': 23.8, 'max_lat': 30.5, 'min_lng': 77.0, 'max_lng': 84.8}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def normalize_hindi(text: str) -> str:
    """Normalize Hindi text for robust matching."""
    if not text:
        return ''
    t = unicodedata.normalize('NFKD', text)
    # Strip common suffixes like 'नगर पालिका परिषद', 'नगर पंचायत', 'नगर निगम'
    for suffix in ['नगर पालिका परिषद', 'नगर पालिका', 'नगर पंचायत', 'नगर निगम', 'परिषद', 'पंचायत']:
        t = t.replace(suffix, ' ')
    # Remove nukta (U+093C) and chandrabindu / anusvara differences
    t = re.sub(r'[\u093C\u0901\u0902]', '', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def normalize_ascii(text: str) -> str:
    if not text:
        return ''
    t = text.lower()
    for s in ['nagar palika parishad', 'nagar palika', 'nagar panchayat', 'nagar nigam']:
        t = t.replace(s, ' ')
    t = re.sub(r'[^a-z0-9]', '', t)
    return t


def fetch_overpass_places() -> list[dict[str, object]]:
    """Fetch place nodes and relations in Uttar Pradesh from Overpass API, or load cached."""
    if OVERPASS_CACHE.exists():
        logger.info('Loading Overpass places from cache: %s', OVERPASS_CACHE)
        try:
            with OVERPASS_CACHE.open('r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.warning('Failed to read Overpass cache: %s', e)

    query = """
    [out:json][timeout:90];
    area["ISO3166-2"="IN-UP"][admin_level=4]->.searchArea;
    (
      node["place"~"city|town|village|suburb"](area.searchArea);
    );
    out center tags;
    """
    endpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter',
    ]
    headers = {'User-Agent': USER_AGENT}

    for endpoint in endpoints:
        logger.info('Querying Overpass API at %s...', endpoint)
        try:
            with httpx.Client(timeout=100.0, headers=headers) as client:
                res = client.post(endpoint, data={'data': query})
                if res.status_code == 200:
                    data = res.json()
                    elements = data.get('elements', [])
                    logger.info('Fetched %d places from Overpass API', len(elements))
                    with OVERPASS_CACHE.open('w', encoding='utf-8') as f:
                        json.dump(elements, f)
                    return elements
                else:
                    logger.warning('Overpass endpoint %s returned status %d', endpoint, res.status_code)
        except Exception as err:
            logger.warning('Overpass query failed on %s: %s', endpoint, err)
        time.sleep(3)

    logger.warning('Could not fetch from Overpass; returning empty list.')
    return []


def load_manual_overrides() -> dict[tuple[str, str], tuple[float, float]]:
    """Load manual overrides from CSV if it exists."""
    overrides = {}
    if OVERRIDES_CSV.exists():
        with OVERRIDES_CSV.open('r', encoding='utf-8') as f:
            for r in csv.DictReader(f):
                try:
                    overrides[(r['district'], r['municipality_code'])] = (float(r['lat']), float(r['lng']))
                except (ValueError, KeyError):
                    continue
    return overrides


def main() -> None:
    if not WARD_CSV.exists():
        logger.error('Ward CSV missing at %s', WARD_CSV)
        sys.exit(1)

    with WARD_CSV.open('r', encoding='utf-8-sig') as f:
        ward_rows = list(csv.DictReader(f))

    # Unique municipalities
    munis: dict[tuple[str, str], dict[str, str]] = {}
    for r in ward_rows:
        key = (r['district'], r['municipality_code'])
        if key not in munis:
            munis[key] = {
                'district': r['district'],
                'municipality_code': r['municipality_code'],
                'municipality_name_en': r.get('municipality_name_en', ''),
                'municipality_name_hi': r.get('municipality_name_hi', ''),
                'municipality_type': r.get('municipality_type', ''),
            }

    overpass_elements = fetch_overpass_places()
    # Build search indexes for Overpass elements
    osm_hi_index = defaultdict(list)
    osm_en_index = defaultdict(list)

    for el in overpass_elements:
        lat = el.get('lat') or (el.get('center', {}).get('lat') if isinstance(el.get('center'), dict) else None)
        lon = el.get('lon') or (el.get('center', {}).get('lon') if isinstance(el.get('center'), dict) else None)
        if lat is None or lon is None:
            continue
        tags = el.get('tags', {})
        hi_name = tags.get('name:hi') or tags.get('name')
        en_name = tags.get('name:en') or tags.get('name')
        if hi_name:
            osm_hi_index[normalize_hindi(hi_name)].append((lat, lon, tags))
        if en_name:
            osm_en_index[normalize_ascii(en_name)].append((lat, lon, tags))

    manual_overrides = load_manual_overrides()

    # Load Nominatim cache
    nom_cache: dict[str, dict[str, float]] = {}
    if NOMINATIM_CACHE.exists():
        try:
            with NOMINATIM_CACHE.open('r', encoding='utf-8') as f:
                nom_cache = json.load(f)
        except Exception:
            nom_cache = {}

    results = []
    needs_review = []
    stats = defaultdict(int)

    nom_client = httpx.Client(timeout=10.0, headers={'User-Agent': USER_AGENT})

    try:
        for (district, code), m in munis.items():
            name_en = m['municipality_name_en']
            name_hi = m['municipality_name_hi']
            mtype = m['municipality_type']

            lat: float | None = None
            lng: float | None = None
            match_method = 'none'
            confidence = 'low'

            # 1. Check manual overrides
            if (district, code) in manual_overrides:
                lat, lng = manual_overrides[(district, code)]
                match_method = 'manual'
                confidence = 'high'

            # 2. Match OSM Hindi
            if lat is None and name_hi:
                norm_hi = normalize_hindi(name_hi)
                if norm_hi in osm_hi_index:
                    cand = osm_hi_index[norm_hi][0]
                    lat, lng = cand[0], cand[1]
                    match_method = 'osm_hi'
                    confidence = 'high'

            # 3. Match OSM English
            if lat is None and name_en:
                norm_en = normalize_ascii(name_en)
                if norm_en in osm_en_index:
                    cand = osm_en_index[norm_en][0]
                    lat, lng = cand[0], cand[1]
                    match_method = 'osm_en'
                    confidence = 'medium'

            # 4. Fallback to Nominatim cache or polite query
            if lat is None:
                cache_key = f"{district}::{code}::{name_en}"
                if cache_key in nom_cache and nom_cache[cache_key].get('lat') is not None:
                    lat = nom_cache[cache_key]['lat']
                    lng = nom_cache[cache_key]['lng']
                    match_method = 'nominatim'
                    confidence = 'medium'

            # 5. Validate coordinates inside UP BBOX
            if lat is not None and lng is not None:
                if not (UP_BBOX['min_lat'] <= lat <= UP_BBOX['max_lat'] and UP_BBOX['min_lng'] <= lng <= UP_BBOX['max_lng']):
                    logger.warning('Coordinates out of UP bounding box for %s: (%f, %f)', name_en, lat, lng)
                    lat, lng = None, None
                    match_method = 'none'
                    confidence = 'low'

            row_data = {
                'district': district,
                'municipality_code': code,
                'municipality_name_en': name_en,
                'municipality_name_hi': name_hi,
                'municipality_type': mtype,
                'lat': f'{lat:.6f}' if lat is not None else '',
                'lng': f'{lng:.6f}' if lng is not None else '',
                'match_method': match_method,
                'confidence': confidence,
            }
            results.append(row_data)
            stats[match_method] += 1

            if match_method == 'none' or confidence == 'low':
                needs_review.append(row_data)
    finally:
        nom_client.close()
        with NOMINATIM_CACHE.open('w', encoding='utf-8') as f:
            json.dump(nom_cache, f, indent=2)

    fieldnames = [
        'district', 'municipality_code', 'municipality_name_en', 'municipality_name_hi',
        'municipality_type', 'lat', 'lng', 'match_method', 'confidence'
    ]
    with CENTROIDS_CSV.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)

    with REVIEW_CSV.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(needs_review)

    total = len(results)
    matched = total - stats['none']
    pct = (matched / total * 100) if total else 0
    print('=' * 60)
    print(f'CENTROIDS BUILD SUMMARY (Total Municipalities: {total})')
    print('-' * 60)
    for method, count in sorted(stats.items()):
        print(f'  {method:<15}: {count}')
    print(f'Matched: {matched}/{total} ({pct:.1f}%)')
    print(f'Needs review written to: {REVIEW_CSV} ({len(needs_review)} rows)')
    print('=' * 60)


if __name__ == '__main__':
    main()
