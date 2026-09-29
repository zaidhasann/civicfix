import asyncio

from civicfix_agent.main import health


def test_health_response() -> None:
    assert asyncio.run(health()) == {'status': 'ok'}