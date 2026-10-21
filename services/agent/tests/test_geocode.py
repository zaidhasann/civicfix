import httpx

from civicfix_agent.config import Settings
from civicfix_agent.geocode import NominatimGeocoder


def test_reverse_normalizes_and_caches_nominatim_results() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        assert request.headers['user-agent'].startswith('CivicFix/')
        return httpx.Response(
            200,
            json={
                'address': {
                    'road': 'Main Street',
                    'suburb': 'Central',
                    'town': 'Pune',
                    'county': 'Pune District',
                    'state': 'Maharashtra',
                    'postcode': '411001',
                }
            },
        )

    geocoder = NominatimGeocoder(
        Settings(geocode_rate_limit_seconds=0),
        httpx.Client(transport=httpx.MockTransport(handler)),
    )
    first = geocoder.reverse(18.52041, 73.85671)
    second = geocoder.reverse(18.52042, 73.85672)

    assert first == {
        'road': 'Main Street',
        'suburb': 'Central',
        'city': 'Pune',
        'district': 'Pune District',
        'state': 'Maharashtra',
        'pincode': '411001',
    }
    assert second == first
    assert calls == 1
    geocoder.close()


def test_reverse_degrades_gracefully_on_provider_failure() -> None:
    geocoder = NominatimGeocoder(
        Settings(geocode_rate_limit_seconds=0),
        httpx.Client(
            transport=httpx.MockTransport(lambda request: httpx.Response(503)),
        ),
    )

    assert geocoder.reverse(18.5204, 73.8567) is None
    assert geocoder.reverse(100, 73.8567) is None
    geocoder.close()
