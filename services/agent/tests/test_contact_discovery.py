import httpx

from civicfix_agent.contact_discovery import TavilyContactDiscovery


def test_tavily_accepts_email_only_from_government_source() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == 'api.tavily.com'
        return httpx.Response(
            200,
            json={
                'results': [
                    {
                        'title': 'Jaipur Municipal Corporation',
                        'url': 'https://jaipurmc.gov.in/contact',
                        'content': 'Road complaints: roads@jaipurmc.gov.in',
                    }
                ]
            },
        )

    discovery = TavilyContactDiscovery(
        'test-key',
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    result = discovery.discover('Jaipur pothole official email')

    assert result.email == 'roads@jaipurmc.gov.in'
    assert result.verification_status == 'verified'
    discovery.close()


def test_tavily_rejects_unofficial_email() -> None:
    discovery = TavilyContactDiscovery(
        'test-key',
        client=httpx.Client(
            transport=httpx.MockTransport(
                lambda _: httpx.Response(
                    200,
                    json={
                        'results': [
                            {
                                'title': 'Contact',
                                'url': 'https://example.com',
                                'content': 'help@example.com',
                            }
                        ]
                    },
                )
            )
        ),
    )

    result = discovery.discover('unrelated result')

    assert result.email is None
    assert result.verification_status == 'not_found'
    discovery.close()


def test_tavily_returns_not_found_on_http_error() -> None:
    discovery = TavilyContactDiscovery(
        'test-key',
        client=httpx.Client(
            transport=httpx.MockTransport(lambda _: httpx.Response(500, text='server error'))
        ),
    )

    result = discovery.discover('official government email')

    assert result.email is None
    assert result.verification_status == 'not_found'
    discovery.close()


def test_tavily_deobfuscates_official_email() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        payload = request.read()
        assert b'"include_raw_content":true' in payload
        assert b'"include_domains":["nic.in","gov.in"]' in payload
        return httpx.Response(
            200,
            json={
                'results': [
                    {
                        'title': 'Jaipur Municipal Corporation',
                        'url': 'https://jaipur.gov.in/contact',
                        'content': 'Jaipur grievance email roads [at] jaipur [dot] gov.in',
                    }
                ]
            },
        )

    discovery = TavilyContactDiscovery(
        'test-key',
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    result = discovery.discover('Jaipur')

    assert result.email == 'roads@jaipur.gov.in'
    discovery.close()


def test_tavily_reads_raw_content() -> None:
    discovery = TavilyContactDiscovery(
        'test-key',
        client=httpx.Client(
            transport=httpx.MockTransport(
                lambda _: httpx.Response(
                    200,
                    json={
                        'results': [
                            {
                                'title': 'Jaipur Municipal Corporation',
                                'url': 'https://jaipur.gov.in/contact',
                                'content': 'Jaipur municipal contact',
                                'raw_content': 'Email: roads@jaipur.gov.in',
                            }
                        ]
                    },
                )
            )
        ),
    )

    result = discovery.discover('Jaipur')

    assert result.email == 'roads@jaipur.gov.in'
    discovery.close()


def test_tavily_skips_unrelated_city() -> None:
    discovery = TavilyContactDiscovery(
        'test-key',
        client=httpx.Client(
            transport=httpx.MockTransport(
                lambda _: httpx.Response(
                    200,
                    json={
                        'results': [
                            {
                                'title': 'Delhi Municipal Corporation',
                                'url': 'https://delhi.gov.in/contact',
                                'content': 'Delhi roads@delhi.gov.in',
                            }
                        ]
                    },
                )
            )
        ),
    )

    result = discovery.discover('Jaipur')

    assert result.email is None
    discovery.close()


def test_tavily_returns_official_grievance_portal_source_without_email() -> None:
    discovery = TavilyContactDiscovery(
        'test-key',
        client=httpx.Client(
            transport=httpx.MockTransport(
                lambda _: httpx.Response(
                    200,
                    json={
                        'results': [
                            {
                                'title': 'Jaipur grievance portal',
                                'url': 'https://jaipur.gov.in/grievance',
                                'content': 'Jaipur municipal complaints can be submitted online.',
                            }
                        ]
                    },
                )
            )
        ),
    )

    result = discovery.discover('Jaipur')

    assert result.email is None
    assert result.sources == ['https://jaipur.gov.in/grievance']
    discovery.close()


def test_tavily_uses_fallback_search_without_domains() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        payload = request.read()
        if calls == 1:
            assert b'"include_domains"' in payload
            return httpx.Response(200, json={'results': []})
        assert b'"include_domains"' not in payload
        return httpx.Response(
            200,
            json={
                'results': [
                    {
                        'title': 'Jaipur Municipal Corporation',
                        'url': 'https://jaipur.gov.in/contact',
                        'content': 'Jaipur contact roads@jaipur.gov.in',
                    }
                ]
            },
        )

    discovery = TavilyContactDiscovery(
        'test-key',
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    result = discovery.discover('Jaipur')

    assert calls == 2
    assert result.email == 'roads@jaipur.gov.in'
    discovery.close()
