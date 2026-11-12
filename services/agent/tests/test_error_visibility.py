import httpx
from fastapi.testclient import TestClient
from langgraph.checkpoint.memory import MemorySaver

from civicfix_agent.config import Settings
from civicfix_agent.main import app, get_run_service, settings
from civicfix_agent.run_service import RunService
from civicfix_agent.vision import VisionLLMClient


def _client_for_provider_status(status_code: int) -> VisionLLMClient:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == 'api.openai.com':
            return httpx.Response(status_code, json={'error': {'message': 'provider failure'}})
        return httpx.Response(200, headers={'content-type': 'image/jpeg'}, content=b'jpeg')

    return VisionLLMClient(
        Settings(llm_api_key='sk-test', llm_provider='openai'),
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )


def test_provider_401_returns_readable_json_error() -> None:
    _assert_provider_error(401, 'AGENT_LLM_API_KEY')


def test_provider_429_returns_readable_json_error() -> None:
    _assert_provider_error(429, 'quota')


def _assert_provider_error(status_code: int, expected_detail: str) -> None:
    original_secret = settings.run_secret
    client = _client_for_provider_status(status_code)
    service = RunService(MemorySaver(), llm_client=client)
    app.dependency_overrides[get_run_service] = lambda: service
    settings.run_secret = 'test-secret'
    try:
        test_client = TestClient(app, raise_server_exceptions=False)
        response = test_client.post(
            '/run',
            headers={'X-Agent-Secret': 'test-secret'},
            json={
                'photo_url': 'https://photo.example/complaint.jpg',
                'coords': [18.52, 73.85],
                'description': 'Pothole',
            },
        )
        test_client.close()
        assert response.status_code == 502
        assert expected_detail in response.json()['detail']
    finally:
        app.dependency_overrides.clear()
        settings.run_secret = original_secret
        client.close()
