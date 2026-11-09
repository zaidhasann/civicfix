import base64
import logging
from typing import Any, Protocol

import httpx

from civicfix_agent.classifier import (
    CLASSIFIER_PROMPT,
    ClassifierOutput,
    normalise_classifier_output,
)
from civicfix_agent.config import Settings

logger = logging.getLogger(__name__)


def _parse_json_content(content: str | list[dict[str, Any]] | None) -> Any:
    import json

    if isinstance(content, list):
        text = ''.join(
            part.get('text', '')
            for part in content
            if isinstance(part, dict) and isinstance(part.get('text'), str)
        )
    elif isinstance(content, str):
        text = content
    else:
        text = ''

    text = text.strip()
    if not text:
        raise ValueError('Vision provider returned an empty reply')

    if text.startswith('```') and text.endswith('```'):
        text = text[3:-3].strip()
        if text.lower().startswith('json'):
            text = text[4:].lstrip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass

    preview = text[:200].replace('\n', ' ').replace('\r', ' ')
    raise ValueError(f'Vision provider reply was not valid JSON (reply began: {preview})')


def _provider_error_message(response: httpx.Response) -> str:
    """Short, key-safe description of a failed vision provider call."""

    code = response.status_code
    if code in (401, 403):
        return f'Vision provider rejected the API key or access (HTTP {code}); check AGENT_LLM_API_KEY'
    if code == 429:
        return 'Vision provider rate limit or quota exceeded (HTTP 429); check billing/credit'
    detail = ''
    try:
        body = response.json()
        error = body.get('error', body) if isinstance(body, dict) else body
        detail = error.get('message', '') if isinstance(error, dict) else str(error)
    except ValueError:
        detail = response.text
    return f'Vision provider error (HTTP {code}): {detail[:160]}'.strip()


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
        if self.settings.llm_provider in {'openai', 'groq'}:
            response = self._call_openai_compatible(image_data, content_type, description)
        else:
            response = self._call_gemini(image_data, content_type, description)
        return ClassifierOutput.model_validate(normalise_classifier_output(response))

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

    def _call_openai_compatible(
        self, image_data: bytes, content_type: str, description: str
    ) -> Any:
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
            f'{self.settings.llm_base_url.rstrip("/")}/chat/completions',
            payload,
            {'Authorization': f'Bearer {self.settings.llm_api_key}'},
        )
        usage = body.get('usage', {})
        logger.info(
            'vision classification completed',
            extra={
                'provider': self.settings.llm_provider,
                'model': self.settings.llm_model,
                'prompt_tokens': usage.get('prompt_tokens'),
                'completion_tokens': usage.get('completion_tokens'),
            },
        )
        choices = body.get('choices')
        if not choices:
            raise ValueError('Vision provider returned no choices')
        choice = choices[0]
        message = choice.get('message', {}) if isinstance(choice, dict) else {}
        content = message.get('content') if isinstance(message, dict) else None
        if content is None or (isinstance(content, str) and not content.strip()):
            raise ValueError(
                'Vision provider returned an empty reply '
                f"(finish_reason={choice.get('finish_reason') if isinstance(choice, dict) else None}, "
                f"refusal={message.get('refusal') if isinstance(message, dict) else None})"
            )
        return _parse_json_content(content)

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
            f'{self.settings.llm_model}:generateContent'
        )
        body = self._post(
            endpoint,
            payload,
            {'x-goog-api-key': self.settings.llm_api_key},
        )
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
        candidates = body.get('candidates')
        candidate = candidates[0] if candidates else {}
        candidate_content = candidate.get('content', {}) if isinstance(candidate, dict) else {}
        parts = candidate_content.get('parts', []) if isinstance(candidate_content, dict) else []
        content = (
            ''.join(
                part.get('text', '')
                for part in parts
                if isinstance(part, dict) and isinstance(part.get('text'), str)
            )
            if isinstance(parts, list)
            else ''
        )
        if not content.strip():
            prompt_feedback = body.get('promptFeedback', {})
            block_reason = (
                prompt_feedback.get('blockReason')
                if isinstance(prompt_feedback, dict)
                else None
            )
            raise ValueError(
                'Vision provider returned an empty reply '
                f"(finishReason={candidate.get('finishReason') if isinstance(candidate, dict) else None}, "
                f'blockReason={block_reason})'
            )
        return _parse_json_content(parts)

    def _post(self, url: str, payload: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
        try:
            response = self.http.post(url, json=payload, headers=headers)
            response.raise_for_status()
        except httpx.TimeoutException as error:
            raise TimeoutError('Vision provider request timed out') from error
        except httpx.HTTPStatusError as error:
            raise ValueError(_provider_error_message(error.response)) from error
        except httpx.HTTPError as error:
            raise ValueError('Vision provider request failed') from error
        try:
            body = response.json()
        except ValueError as error:
            raise ValueError('Vision provider returned invalid JSON') from error
        if not isinstance(body, dict):
            raise ValueError('Vision provider returned an invalid response')
        return body
