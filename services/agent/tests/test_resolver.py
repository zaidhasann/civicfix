from civicfix_agent.ingestion import municipality_documents
from civicfix_agent.resolver import FallbackRecipient, resolve_location
from civicfix_agent.vector_store import SearchResult, VectorDocument


class FakeVectorStore:
    def __init__(self) -> None:
        self.filters: list[dict[str, str] | None] = []
        self.documents = municipality_documents()

    def upsert(self, documents: list[VectorDocument]) -> None:
        self.documents = documents

    def query(
        self,
        text: str,
        limit: int = 5,
        metadata_filter: dict[str, str] | None = None,
    ) -> list[SearchResult]:
        self.filters.append(metadata_filter)
        documents = [
            document for document in self.documents
            if not metadata_filter or all(
                document.metadata.get(key) == value
                for key, value in metadata_filter.items()
            )
        ]
        return [
            SearchResult(
                document_id=document.document_id,
                text=document.text,
                metadata=document.metadata,
                distance=0.1,
            )
            for document in documents[:limit]
        ]


def test_pune_coordinates_resolve_city_first_to_pmc_department() -> None:
    store = FakeVectorStore()

    result = resolve_location(
        {'city': 'Pune', 'suburb': 'Shivajinagar'},
        'pothole',
        store,
    )

    assert result.municipality == 'Pune'
    assert result.department == 'Pune Municipal Corporation'
    assert result.ward == 'Citywide'
    assert result.needs_user_review is False
    assert store.filters == [{'city': 'Pune'}]


def test_unknown_city_uses_review_fallback() -> None:
    result = resolve_location({'city': 'Unknown'}, 'garbage', FakeVectorStore())

    assert result.municipality == FallbackRecipient
    assert result.department == FallbackRecipient
    assert result.needs_user_review is True
