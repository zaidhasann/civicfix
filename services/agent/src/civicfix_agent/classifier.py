from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any, Protocol

from pydantic import BaseModel, ConfigDict, Field

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
    def with_structured_output(self, schema: type[ClassifierOutput]) -> Any: ...


def classify_with_retry(
    model: StructuredClassifier,
    state: ComplaintState,
    *,
    attempts: int = 2,
) -> ClassifierOutput:
    """Invoke a structured classifier and retry malformed output."""

    if attempts < 1:
        raise ValueError('attempts must be at least 1')

    structured_model = model.with_structured_output(ClassifierOutput)
    input_text = f"Description:\n{state['description']}\nPhoto URL: {state['photo_url']}"
    last_error: Exception | None = None

    for _ in range(attempts):
        try:
            response = structured_model.invoke(
                [
                    ('system', CLASSIFIER_PROMPT),
                    ('human', input_text),
                ]
            )
            return ClassifierOutput.model_validate(response)
        except (TypeError, ValueError) as error:
            last_error = error

    raise ValueError(f'Classifier returned malformed output after {attempts} attempts') from last_error
