import httpx
import pytest

from civicfix_agent.classifier import classify_with_retry
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


@pytest.mark.parametrize(
    'content',
    [
        '```json\n{"issue_type":"pothole","severity":4,"confidence":0.9,"visible_details":"Road damage","safety_risk":true}\n```',
        'The result is: {"issue_type":"pothole","severity":4,"confidence":0.9,"visible_details":"Road damage","safety_risk":true} Done.',
    ],
)
def test_vision_client_parses_wrapped_json(content: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == 'photo.example':
            return httpx.Response(200, headers={'content-type': 'image/jpeg'}, content=b'jpeg')
        return httpx.Response(200, json={'choices': [{'message': {'content': content}}]})

    client = VisionLLMClient(
        Settings(llm_api_key='test-key'),
        httpx.Client(transport=httpx.MockTransport(handler)),
    )

    result = client.classify('https://photo.example/pothole.jpg', 'Road is damaged')

    assert result.issue_type == 'pothole'
    client.close()


def test_vision_client_parses_list_content() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == 'photo.example':
            return httpx.Response(200, headers={'content-type': 'image/jpeg'}, content=b'jpeg')
        return httpx.Response(
            200,
            json={
                'choices': [
                    {
                        'message': {
                            'content': [
                                {'type': 'text', 'text': '{"issue_type":"pothole",'},
                                {
                                    'type': 'text',
                                    'text': '"severity":4,"confidence":0.9,"visible_details":"Road damage","safety_risk":true}',
                                },
                            ]
                        }
                    }
                ]
            },
        )

    client = VisionLLMClient(
        Settings(llm_api_key='test-key'),
        httpx.Client(transport=httpx.MockTransport(handler)),
    )

    result = client.classify('https://photo.example/pothole.jpg', 'Road is damaged')

    assert result.issue_type == 'pothole'
    client.close()


def test_vision_client_reports_empty_openai_reply_details() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == 'photo.example':
            return httpx.Response(200, headers={'content-type': 'image/jpeg'}, content=b'jpeg')
        return httpx.Response(
            200,
            json={'choices': [{'finish_reason': 'length', 'message': {'content': ''}}]},
        )

    client = VisionLLMClient(
        Settings(llm_api_key='test-key'),
        httpx.Client(transport=httpx.MockTransport(handler)),
    )

    with pytest.raises(ValueError, match='empty reply.*length'):
        client.classify('https://photo.example/pothole.jpg', 'Road is damaged')
    client.close()


def test_vision_client_reports_unparseable_reply_start() -> None:
    reply = 'This response does not contain structured classification data.'

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == 'photo.example':
            return httpx.Response(200, headers={'content-type': 'image/jpeg'}, content=b'jpeg')
        return httpx.Response(200, json={'choices': [{'message': {'content': reply}}]})

    client = VisionLLMClient(
        Settings(llm_api_key='test-key'),
        httpx.Client(transport=httpx.MockTransport(handler)),
    )

    with pytest.raises(ValueError, match='This response does not contain'):
        client.classify('https://photo.example/pothole.jpg', 'Road is damaged')
    client.close()


def test_vision_client_normalises_classifier_values() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == 'photo.example':
            return httpx.Response(200, headers={'content-type': 'image/jpeg'}, content=b'jpeg')
        return httpx.Response(
            200,
            json={
                'choices': [
                    {
                        'message': {
                            'content': '{"issue_type":"Potholes","severity":"3","confidence":95,"visible_details":"Road damage","safety_risk":"false"}'
                        }
                    }
                ]
            },
        )

    client = VisionLLMClient(
        Settings(llm_api_key='test-key'),
        httpx.Client(transport=httpx.MockTransport(handler)),
    )

    result = client.classify('https://photo.example/pothole.jpg', 'Road is damaged')

    assert result.issue_type == 'pothole'
    assert result.severity == 3
    assert result.confidence == 0.95
    assert result.safety_risk is False
    client.close()


def test_classifier_does_not_retry_empty_reply() -> None:
    class EmptyReplyModel:
        calls = 0

        def classify(self, _image_url: str, _description: str) -> object:
            self.calls += 1
            raise ValueError('Vision provider returned an empty reply (finish_reason=length, refusal=None)')

    model = EmptyReplyModel()

    with pytest.raises(ValueError, match='empty reply'):
        classify_with_retry(
            model,
            {
                'photo_url': 'https://example.com/photo.jpg',
                'coords': (18.5204, 73.8567),
                'description': 'The road is damaged.',
            },
        )

    assert model.calls == 1


def test_vision_client_uses_groq_openai_compatible_endpoint() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == 'photo.example':
            return httpx.Response(200, headers={'content-type': 'image/jpeg'}, content=b'jpeg')
        assert str(request.url) == 'https://api.groq.com/openai/v1/chat/completions'
        assert request.headers['authorization'] == 'Bearer test-key'
        return httpx.Response(
            200,
            json={
                'choices': [
                    {
                        'message': {
                            'content': '{"issue_type":"pothole","severity":4,"confidence":0.9,"visible_details":"Road damage","safety_risk":true}'
                        }
                    }
                ]
            },
        )

    client = VisionLLMClient(
        Settings(
            llm_api_key='test-key',
            llm_provider='groq',
            llm_model='meta-llama/llama-4-scout-17b-16e-instruct',
            llm_base_url='https://api.groq.com/openai/v1/',
        ),
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


def test_vision_client_uses_gemini_header_and_returns_classification() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == 'photo.example':
            return httpx.Response(200, headers={'content-type': 'image/jpeg'}, content=b'jpeg')
        assert 'key=' not in str(request.url)
        assert request.headers['x-goog-api-key'] == 'test-key'
        return httpx.Response(
            200,
            json={
                'candidates': [
                    {
                        'content': {
                            'parts': [
                                {
                                    'text': '{"issue_type":"pothole","severity":4,"confidence":0.9,"visible_details":"Road damage","safety_risk":true}'
                                }
                            ]
                        }
                    }
                ]
            },
        )

    client = VisionLLMClient(
        Settings(llm_api_key='test-key', llm_provider='gemini', llm_model='gemini-2.5-flash'),
        httpx.Client(transport=httpx.MockTransport(handler)),
    )
    result = client.classify('https://photo.example/pothole.jpg', 'Road is damaged')

    assert result.issue_type == 'pothole'
    client.close()


def test_vision_client_rejects_empty_gemini_result() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == 'photo.example':
            return httpx.Response(200, headers={'content-type': 'image/jpeg'}, content=b'jpeg')
        return httpx.Response(200, json={'candidates': []})

    client = VisionLLMClient(
        Settings(llm_api_key='test-key', llm_provider='gemini'),
        httpx.Client(transport=httpx.MockTransport(handler)),
    )

    with pytest.raises(ValueError, match='empty reply'):
        client.classify('https://photo.example/pothole.jpg', 'Road is damaged')
    client.close()


def test_vision_client_reports_gemini_quota_errors() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == 'photo.example':
            return httpx.Response(200, headers={'content-type': 'image/jpeg'}, content=b'jpeg')
        return httpx.Response(429, json={'error': {'message': 'quota exceeded'}})

    client = VisionLLMClient(
        Settings(llm_api_key='test-key', llm_provider='gemini'),
        httpx.Client(transport=httpx.MockTransport(handler)),
    )

    with pytest.raises(ValueError, match='quota'):
        client.classify('https://photo.example/pothole.jpg', 'Road is damaged')
    client.close()


def test_vision_client_reports_invalid_provider_json() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == 'photo.example':
            return httpx.Response(200, headers={'content-type': 'image/jpeg'}, content=b'jpeg')
        return httpx.Response(200, text='not-json')

    client = VisionLLMClient(
        Settings(llm_api_key='test-key', llm_provider='gemini'),
        httpx.Client(transport=httpx.MockTransport(handler)),
    )

    with pytest.raises(ValueError, match='invalid JSON'):
        client.classify('https://photo.example/pothole.jpg', 'Road is damaged')
    client.close()
