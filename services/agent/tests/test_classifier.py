import pytest
from civicfix_agent.classifier import ClassifierOutput, classify_with_retry
from pydantic import ValidationError


def test_classifier_schema_accepts_valid_output() -> None:
    result = ClassifierOutput(
        issue_type='pothole',
        severity=4,
        confidence=0.9,
        visible_details='Deep pothole in the traffic lane.',
        safety_risk=True,
    )

    assert result.issue_type == 'pothole'


@pytest.mark.parametrize(
    'field,value',
    [
        ('issue_type', 'graffiti'),
        ('severity', 6),
        ('confidence', 1.1),
    ],
)
def test_classifier_schema_rejects_invalid_values(field: str, value: object) -> None:
    with pytest.raises(ValidationError):
        ClassifierOutput(
            issue_type='other' if field != 'issue_type' else value,
            severity=2 if field != 'severity' else value,
            confidence=0.5 if field != 'confidence' else value,
            visible_details='Observed details',
            safety_risk=False,
        )


class FakeModel:
    def __init__(self) -> None:
        self.calls = 0

    def classify(self, _image_url: str, _description: str) -> object:
        self.calls += 1
        if self.calls == 1:
            return {'issue_type': 'invalid'}
        return {
            'issue_type': 'streetlight',
            'severity': 3,
            'confidence': 0.8,
            'visible_details': 'A lamp is not illuminated.',
            'safety_risk': False,
        }

def test_classifier_retries_malformed_structured_output() -> None:
    result = classify_with_retry(
        FakeModel(),
        {
            'photo_url': 'https://example.com/photo.jpg',
            'coords': (18.5204, 73.8567),
            'description': 'The lamp is out.',
        },
    )

    assert result.issue_type == 'streetlight'
