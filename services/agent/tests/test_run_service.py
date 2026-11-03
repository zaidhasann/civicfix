from pathlib import Path

from civicfix_agent.classifier import ClassifierOutput
from civicfix_agent.run_service import RunInput, create_run_service
from civicfix_agent.vector_store import SearchResult


class FakeLLM:
    def classify(self, image_url: str, description: str) -> ClassifierOutput:
        return ClassifierOutput(
            issue_type='pothole',
            severity=4,
            confidence=0.95,
            visible_details='A pothole is visible.',
            safety_risk=True,
        )


class FakeGeocoder:
    def __init__(self, address: dict[str, str | None] | None) -> None:
        self.address = address

    def reverse(self, lat: float, lng: float) -> dict[str, str | None] | None:
        return self.address


class FakeVectorStore:
    def query(
        self,
        text: str,
        limit: int = 5,
        metadata_filter: dict[str, str] | None = None,
    ) -> list[SearchResult]:
        return [
            SearchResult(
                document_id='pune-potholes',
                text='Pune pothole jurisdiction',
                metadata={
                    'city': 'Pune',
                    'ward': 'Citywide',
                    'department': 'Pune Municipal Corporation',
                    'official_email': 'roads@pune.example',
                    'doc_type': (metadata_filter or {}).get('doc_type', 'municipality_directory'),
                    'source_url': 'https://example.com/pune',
                    'act_name': 'Municipal Act',
                    'section': '12',
                },
                distance=0.1,
            )
        ]


def _payload() -> RunInput:
    return RunInput(
        photo_url='https://example.com/photo.jpg',
        coords=(18.5204, 73.8567),
        description='A pothole is blocking the lane.',
    )


def test_run_service_reaches_awaiting_approval_with_integrations(tmp_path: Path) -> None:
    with create_run_service(
        str(tmp_path / 'runs.sqlite'),
        llm_client=FakeLLM(),
        vector_store=FakeVectorStore(),
        geocoder=FakeGeocoder({'city': 'Pune', 'suburb': 'Shivajinagar'}),
    ) as service:
        run_id = service.start(_payload())
        result = service.get(run_id)

    assert result['status'] == 'awaiting_approval'
    assert result['state']['geocoded_address'] == {'city': 'Pune', 'suburb': 'Shivajinagar'}


def test_run_service_needs_input_when_geocoding_fails(tmp_path: Path) -> None:
    with create_run_service(
        str(tmp_path / 'runs.sqlite'),
        llm_client=FakeLLM(),
        vector_store=FakeVectorStore(),
        geocoder=FakeGeocoder(None),
    ) as service:
        run_id = service.start(_payload())
        result = service.get(run_id)

    assert result['status'] == 'needs_input'
