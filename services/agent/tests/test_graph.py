from civicfix_agent.classifier import ClassifierOutput
from civicfix_agent.graph import build_complaint_graph, run_complaint
from civicfix_agent.ingestion import municipality_documents
from civicfix_agent.resolver import LocationResolution
from civicfix_agent.vector_store import SearchResult
from civicfix_agent.writer import DraftOutput


class FakeVectorStore:
    def query(
        self,
        text: str,
        limit: int = 5,
        metadata_filter: dict[str, str] | None = None,
    ) -> list[SearchResult]:
        document = municipality_documents()[0]
        return [
            SearchResult(
                document_id=document.document_id,
                text=document.text,
                metadata=document.metadata,
                distance=0.1,
            )
        ]


class HappyPathClassifier:
    def classify(self, image_url: str, description: str) -> object:
        return {
            'issue_type': 'pothole',
            'severity': 4,
            'confidence': 0.95,
            'visible_details': 'A pothole is visible.',
            'safety_risk': True,
        }


class NotAnIssueClassifier:
    def classify(self, image_url: str, description: str) -> object:
        return {
            'issue_type': 'not_an_issue',
            'severity': 1,
            'confidence': 0.99,
            'visible_details': 'No civic issue is visible.',
            'safety_risk': False,
        }


def test_graph_routes_low_confidence_to_needs_input() -> None:
    graph = build_complaint_graph()

    state = run_complaint(
        {
            'photo_url': 'https://example.com/photo.jpg',
            'coords': (18.5204, 73.8567),
            'description': 'A pothole is blocking the lane.',
        },
        thread_id='test-complaint',
        graph=graph,
    )

    assert state['classification'].issue_type == 'other'
    assert 'jurisdiction' not in state
    assert state['needs_input'] is True

    snapshot = graph.get_state({'configurable': {'thread_id': 'test-complaint'}})
    assert snapshot.next == ()


def test_graph_happy_path_interrupts_before_approval() -> None:
    graph = build_complaint_graph(
        llm_client=HappyPathClassifier(),
        vector_store=FakeVectorStore(),
    )

    state = run_complaint(
        {
            'photo_url': 'https://example.com/photo.jpg',
            'coords': (18.5204, 73.8567),
            'description': 'A pothole is blocking the lane.',
            'geocoded_address': {'city': 'Pune', 'suburb': 'Shivajinagar'},
        },
        thread_id='test-happy-path',
        graph=graph,
    )

    assert isinstance(state['classification'], ClassifierOutput)
    assert isinstance(state['draft'], DraftOutput)
    assert state.get('needs_input') is None
    assert state.get('approval') is None
    assert graph.get_state({'configurable': {'thread_id': 'test-happy-path'}}).next == (
        'await_approval',
    )


def test_graph_routes_not_an_issue_to_needs_input() -> None:
    graph = build_complaint_graph(llm_client=NotAnIssueClassifier())

    state = run_complaint(
        {
            'photo_url': 'https://example.com/photo.jpg',
            'coords': (18.5204, 73.8567),
            'description': 'An ordinary street scene.',
        },
        thread_id='test-not-an-issue',
        graph=graph,
    )

    assert state['classification'].issue_type == 'not_an_issue'
    assert state['needs_input'] is True


def test_graph_uses_rag_resolver_when_address_and_store_are_available() -> None:
    graph = build_complaint_graph(
        llm_client=HappyPathClassifier(),
        vector_store=FakeVectorStore(),
    )

    state = run_complaint(
        {
            'photo_url': 'https://example.com/photo.jpg',
            'coords': (18.5204, 73.8567),
            'description': 'A pothole is blocking the lane.',
            'geocoded_address': {'city': 'Pune', 'suburb': 'Shivajinagar'},
        },
        thread_id='test-rag-resolver',
        graph=graph,
    )

    assert isinstance(state['jurisdiction'], LocationResolution)
    assert state['jurisdiction'].department == 'Pune Municipal Corporation'
