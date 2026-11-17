"""Build municipality centroids using Nominatim geocoding with local caching and rate limiting.

Usage:
    python services/agent/scripts/build_centroids.py [--limit N]

This script:
1. Reads all distinct (district, municipality_code, municipality_name_en) from up_ward_directory.csv.
2. For each municipality, queries Nominatim (at <= 1 req/sec) or loads from disk cache.
3. Saves services/agent/data/up_municipality_centroids.csv.
"""
from __future__ import annotations

import csv
import json
import logging
import sys
import time
from pathlib import Path

import httpx

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / 'services' / 'agent' / 'data'
CSV_PATH = DATA_DIR / 'up_ward_directory.csv'
CENTROIDS_CSV = DATA_DIR / 'up_municipality_centroids.csv'
CACHE_FILE = DATA_DIR / 'centroids_cache.json'

USER_AGENT = 'CivicFixAgent/1.0 (civicfix-dev-team@example.com)'


def load_cache() -> dict[str, dict[str, float]]:
    if CACHE_FILE.exists():
        try:
            with CACHE_FILE.open('r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_cache(cache: dict[str, dict[str, float]]) -> None:
    with CACHE_FILE.open('w', encoding='utf-8') as f:
        json.dump(cache, f, indent=2)


def main() -> None:
    if not CSV_PATH.exists():
        logger.error('up_ward_directory.csv not found at %s', CSV_PATH)
        sys.exit(1)

    with CSV_PATH.open('r', encoding='utf-8-sig') as f:
        rows = list(csv.DictReader(f))

    # Distinct municipalities by (district, municipality_code)
    munis: dict[tuple[str, str], dict[str, str]] = {}
    for r in rows:
        key = (r['district'], r['municipality_code'])
        if key not in munis:
            munis[key] = {
                'district': r['district'],
                'municipality_code': r['municipality_code'],
                'municipality_name_en': r.get('municipality_name_en', ''),
                'municipality_type': r.get('municipality_type', ''),
            }

    logger.info('Found %d distinct municipalities across UP', len(munis))
    cache = load_cache()

    results: list[dict[str, str | float]] = []
    client = httpx.Client(timeout=10.0, headers={'User-Agent': USER_AGENT})

    try:
        for idx, ((district, code), info) in enumerate(munis.items(), start=1):
            name = info['municipality_name_en']
            cache_key = f"{district}::{code}::{name}"

            if cache_key in cache:
                coords = cache[cache_key]
                lat = coords.get('lat')
                lng = coords.get('lng')
            else:
                # Query Nominatim
                query = f"{name}, {district}, Uttar Pradesh, India"
                logger.info('[%d/%d] Geocoding %s...', idx, len(munis), query)
                lat, lng = None, None
                try:
                    time.sleep(1.05)  # Strict rate limit (<= 1 req/sec)
                    res = client.get(
                        'https://nominatim.openstreetmap.org/search',
                        params={'q': query, 'format': 'json', 'limit': 1},
                    )
                    if res.status_code == 200:
                        data = res.json()
                        if data and isinstance(data, list):
                            lat = float(data[0]['lat'])
                            lng = float(data[0]['lon'])
                    elif res.status_code == 429:
                        logger.warning('Rate limited by Nominatim, waiting 5s...')
                        time.sleep(5)
                except Exception as e:
                    logger.warning('Failed to geocode %s: %s', query, e)

                cache[cache_key] = {'lat': lat, 'lng': lng}
                if idx % 10 == 0:
                    save_cache(cache)

            results.append({
                'district': district,
                'municipality_code': code,
                'municipality_name_en': name,
                'municipality_type': info['municipality_type'],
                'lat': lat if lat is not None else '',
                'lng': lng if lng is not None else '',
            })
    finally:
        client.close()
        save_cache(cache)

    # Write out centroids CSV
    fieldnames = ['district', 'municipality_code', 'municipality_name_en', 'municipality_type', 'lat', 'lng']
    with CENTROIDS_CSV.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)

    logger.info('Wrote %d centroids to %s', len(results), CENTROIDS_CSV)


if __name__ == '__main__':
    main()
