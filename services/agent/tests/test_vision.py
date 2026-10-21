import httpx
import pytest

from civicfix_agent.config import Settings
from civicfix_agent.vision import VisionLLMClient


def test_vision_client_fetches_image_and_parses_provider_output() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == 'photo.example':
            return httpx.Response(200, headers={'content-type': 'image/jpeg'}, content=b'jpeg')
        return httpx.Response(
            200,
            json={
                'choices': [
                    {
                        'message': {
                            'content': '{"issue_type":"pothole","severity":4,"confidence":0.9,"visible_details":"Road damage","safety_risk":true}'
                        }
                    }
                ],
                'usage': {'prompt_tokens': 10, 'completion_tokens': 8},
            },
        )

    client = VisionLLMClient(
        Settings(llm_api_key='test-key'),
        httpx.Client(transport=httpx.MockTransport(handler)),
    )
    result = client.classify('https://photo.example/pothole.jpg', 'Road is damaged')

    assert result.issue_type == 'pothole'
    client.close()


def test_vision_client_rejects_non_images() -> None:
    client = VisionLLMClient(
        Settings(llm_api_key='test-key'),
        httpx.Client(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(200, headers={'content-type': 'text/plain'}, content=b'no')
            )
        ),
    )

    with pytest.raises(ValueError, match='did not return an image'):
        client.classify('https://photo.example/file', 'Description')
    client.close()
