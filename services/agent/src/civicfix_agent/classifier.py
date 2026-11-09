from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError

if TYPE_CHECKING:
    from civicfix_agent.graph import ComplaintState


class ClassifierOutput(BaseModel):
    """Validated structured output from the complaint classifier."""

    model_config = ConfigDict(extra='forbid')

    issue_type: str = Field(
        pattern=r'^(pothole|streetlight|garbage|drainage|other|not_an_issue)$'
    )
    severity: int = Field(ge=1, le=5)
    confidence: float = Field(ge=0, le=1)
    visible_details: str = Field(min_length=1, max_length=2000)
    safety_risk: bool


PROMPT_PATH = Path(__file__).resolve().parents[2] / 'prompts' / 'classifier.md'
CLASSIFIER_PROMPT = PROMPT_PATH.read_text(encoding='utf-8')


class StructuredClassifier(Protocol):
    def classify(self, image_url: str, description: str) -> object: ...


def normalise_classifier_output(response: object) -> object:
    if not isinstance(response, dict):
        return response

    normalised = response.copy()
    issue_type = normalised.get('issue_type')
    if isinstance(issue_type, str):
        issue_type = issue_type.strip().lower()
        issue_type = {
            'pothole': 'pothole',
            'potholes': 'pothole',
            'road damage': 'pothole',
            'street light': 'streetlight',
            'streetlight': 'streetlight',
            'lamp': 'streetlight',
            'garbage': 'garbage',
            'trash': 'garbage',
            'waste': 'garbage',
            'drain': 'drainage',
            'drainage': 'drainage',
            'sewage': 'drainage',
            'not_an_issue': 'not_an_issue',
        }.get(issue_type, 'other')
        normalised['issue_type'] = issue_type

    severity = normalised.get('severity')
    try:
        if isinstance(severity, str):
            severity = int(float(severity.strip()))
        elif isinstance(severity, (int, float)) and not isinstance(severity, bool):
            severity = int(severity)
        if isinstance(severity, int):
            normalised['severity'] = max(1, min(5, severity))
    except (TypeError, ValueError):
        pass

    confidence = normalised.get('confidence')
    try:
        if isinstance(confidence, str):
            confidence = float(confidence.strip().rstrip('%'))
        if isinstance(confidence, (int, float)) and not isinstance(confidence, bool):
            if confidence > 1:
                confidence /= 100
            normalised['confidence'] = max(0, min(1, confidence))
    except (TypeError, ValueError):
        pass

    safety_risk = normalised.get('safety_risk')
    if isinstance(safety_risk, str):
        if safety_risk.strip().lower() == 'true':
            normalised['safety_risk'] = True
        elif safety_risk.strip().lower() == 'false':
            normalised['safety_risk'] = False

    return normalised


def classify_with_retry(
    model: StructuredClassifier,
    state: ComplaintState,
    *,
    attempts: int = 2,
) -> ClassifierOutput:
    """Invoke a structured classifier and retry malformed output."""

    if attempts < 1:
        raise ValueError('attempts must be at least 1')

    last_error: Exception | None = None

    for _ in range(attempts):
        try:
            response = model.classify(state['photo_url'], state['description'])
            return ClassifierOutput.model_validate(normalise_classifier_output(response))
        except ValidationError as error:
            last_error = error
        except ValueError as error:
            last_error = error
            error_text = str(error).lower()
            if 'malformed json' not in error_text and 'not valid json' not in error_text:
                break

    reason = str(last_error).strip().splitlines()[0][:200] if last_error else 'unknown error'
    raise ValueError(f'Classifier failed after {attempts} attempts: {reason}') from last_error
