import base64
import logging
from typing import Any, Protocol

import httpx

from civicfix_agent.classifier import CLASSIFIER_PROMPT, ClassifierOutput
from civicfix_agent.config import Settings

logger = logging.getLogger(__name__)


class LLMClient(Protocol):
    def classify(self, image_url: str, description: str) -> object: ...


class VisionLLMClient:
    def __init__(self, settings: Settings, client: httpx.Client | None = None) -> None:
        if not settings.llm_api_key:
            raise ValueError('AGENT_LLM_API_KEY is required for vision classification')
        self.settings = settings
        self.http = client or httpx.Client(timeout=settings.llm_timeout_seconds)

    def close(self) -> None:
        self.http.close()

    def classify(self, image_url: str, description: str) -> ClassifierOutput:
        image_data, content_type = self._fetch_image(image_url)
        if self.settings.llm_provider == 'openai':
            response = self._call_openai(image_data, content_type, description)
        else:
            response = self._call_gemini(image_data, content_type, description)
        return ClassifierOutput.model_validate(response)

    def _fetch_image(self, image_url: str) -> tuple[bytes, str]:
        try:
            response = self.http.get(image_url)
            response.raise_for_status()
        except httpx.TimeoutException as error:
            raise TimeoutError('Timed out while fetching complaint photo') from error
        except httpx.HTTPError as error:
            raise ValueError('Could not fetch complaint photo') from error

        content_type = response.headers.get('content-type', 'image/jpeg').split(';', 1)[0]
        if not content_type.startswith('image/'):
            raise ValueError('Complaint photo URL did not return an image')
        if len(response.content) > self.settings.llm_max_image_bytes:
            raise ValueError('Complaint photo exceeds the configured size limit')
        return response.content, content_type

    def _call_openai(self, image_data: bytes, content_type: str, description: str) -> Any:
        payload = {
            'model': self.settings.llm_model,
            'messages': [
                {'role': 'system', 'content': CLASSIFIER_PROMPT},
                {
                    'role': 'user',
                    'content': [
                        {'type': 'text', 'text': description},
                        {
                            'type': 'image_url',
                            'image_url': {
                                'url': f'data:{content_type};base64,{base64.b64encode(image_data).decode()}'
                            },
                        },
                    ],
                },
            ],
            'response_format': {'type': 'json_object'},
        }
        body = self._post(
            'https://api.openai.com/v1/chat/completions',
            payload,
            {'Authorization': f'Bearer {self.settings.llm_api_key}'},
        )
        usage = body.get('usage', {})
        logger.info(
            'vision classification completed',
            extra={
                'provider': 'openai',
                'model': self.settings.llm_model,
                'prompt_tokens': usage.get('prompt_tokens'),
                'completion_tokens': usage.get('completion_tokens'),
            },
        )
        return self._parse_json_content(body['choices'][0]['message']['content'])

    def _call_gemini(self, image_data: bytes, content_type: str, description: str) -> Any:
        payload = {
            'contents': [
                {
                    'parts': [
                        {'text': f'{CLASSIFIER_PROMPT}\n\nDescription:\n{description}'},
                        {
                            'inline_data': {
                                'mime_type': content_type,
                                'data': base64.b64encode(image_data).decode(),
                            }
                        },
                    ]
                }
            ],
            'generationConfig': {'responseMimeType': 'application/json'},
        }
        endpoint = (
            f'https://generativelanguage.googleapis.com/v1beta/models/'
            f'{self.settings.llm_model}:generateContent?key={self.settings.llm_api_key}'
        )
        body = self._post(endpoint, payload, {})
        usage = body.get('usageMetadata', {})
        logger.info(
            'vision classification completed',
            extra={
                'provider': 'gemini',
                'model': self.settings.llm_model,
                'prompt_tokens': usage.get('promptTokenCount'),
                'completion_tokens': usage.get('candidatesTokenCount'),
            },
        )
        content = body['candidates'][0]['content']['parts'][0]['text']
        return self._parse_json_content(content)

    def _post(self, url: str, payload: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
        try:
            response = self.http.post(url, json=payload, headers=headers)
            response.raise_for_status()
            return response.json()
        except httpx.TimeoutException as error:
            raise TimeoutError('Vision provider request timed out') from error
        except (httpx.HTTPError, ValueError) as error:
            raise ValueError('Vision provider returned an invalid response') from error

    @staticmethod
    def _parse_json_content(content: str) -> Any:
        import json

        try:
            return json.loads(content)
        except json.JSONDecodeError as error:
            raise ValueError('Vision provider returned malformed JSON') from error
