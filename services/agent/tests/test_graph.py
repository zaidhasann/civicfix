from civicfix_agent.graph import build_complaint_graph, run_complaint
from civicfix_agent.ingestion import municipality_documents
from civicfix_agent.resolver import LocationResolution
from civicfix_agent.vector_store import SearchResult


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


def test_graph_runs_until_approval_interrupt() -> None:
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
    assert state['jurisdiction'] == 'unresolved'
    assert state['draft'] == 'A pothole is blocking the lane.'
    assert state.get('approval') is None

    snapshot = graph.get_state({'configurable': {'thread_id': 'test-complaint'}})
    assert snapshot.next == ('await_approval',)


def test_graph_uses_rag_resolver_when_address_and_store_are_available() -> None:
    graph = build_complaint_graph(vector_store=FakeVectorStore())

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
