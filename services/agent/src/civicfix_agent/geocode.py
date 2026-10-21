from __future__ import annotations

import logging
import threading
import time
from typing import Protocol

import httpx

from civicfix_agent.config import Settings

logger = logging.getLogger(__name__)

NormalizedAddress = dict[str, str | None]


class Geocoder(Protocol):
    def reverse(self, lat: float, lng: float) -> NormalizedAddress | None: ...


class NominatimGeocoder:
    """Nominatim reverse geocoder with process-local caching and rate limiting."""

    def __init__(
        self,
        settings: Settings,
        client: httpx.Client | None = None,
    ) -> None:
        self.settings = settings
        self.http = client or httpx.Client(timeout=settings.geocode_timeout_seconds)
        self._cache: dict[tuple[float, float], NormalizedAddress] = {}
        self._rate_lock = threading.Lock()
        self._last_request_at = 0.0

    def close(self) -> None:
        self.http.close()

    def reverse(self, lat: float, lng: float) -> NormalizedAddress | None:
        if not -90 <= lat <= 90 or not -180 <= lng <= 180:
            return None

        key = (round(lat, self.settings.geocode_cache_precision), round(lng, self.settings.geocode_cache_precision))
        cached = self._cache.get(key)
        if cached is not None:
            return cached.copy()

        try:
            self._wait_for_rate_limit()
            response = self.http.get(
                'https://nominatim.openstreetmap.org/reverse',
                params={
                    'lat': lat,
                    'lon': lng,
                    'format': 'jsonv2',
                    'addressdetails': 1,
                },
                headers={'User-Agent': self.settings.geocode_user_agent},
            )
            response.raise_for_status()
            address = response.json().get('address')
            if not isinstance(address, dict):
                raise TypeError('Nominatim response did not contain an address')
            normalized = self._normalize(address)
        except (httpx.HTTPError, ValueError, TypeError) as error:
            logger.warning('reverse geocoding failed', extra={'error': str(error)})
            return None

        self._cache[key] = normalized
        return normalized.copy()

    def _wait_for_rate_limit(self) -> None:
        with self._rate_lock:
            elapsed = time.monotonic() - self._last_request_at
            delay = self.settings.geocode_rate_limit_seconds - elapsed
            if delay > 0:
                time.sleep(delay)
            self._last_request_at = time.monotonic()

    @staticmethod
    def _normalize(address: dict[str, object]) -> NormalizedAddress:
        return {
            'road': _text(address.get('road')),
            'suburb': _text(address.get('suburb')),
            'city': _first_text(address, 'city', 'town', 'village', 'municipality'),
            'district': _first_text(address, 'state_district', 'county'),
            'state': _text(address.get('state')),
            'pincode': _text(address.get('postcode')),
        }


def _text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _first_text(address: dict[str, object], *keys: str) -> str | None:
    for key in keys:
        value = _text(address.get(key))
        if value:
            return value
    return None


def create_geocoder(settings: Settings, client: httpx.Client | None = None) -> Geocoder:
    if settings.geocode_provider == 'nominatim':
        return NominatimGeocoder(settings, client)
    raise ValueError(f'Unsupported geocode provider: {settings.geocode_provider}')
