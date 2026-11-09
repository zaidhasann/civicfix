from civicfix_agent.contact_discovery import ContactDiscoveryResult
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


class FakeDiscovery:
    def __init__(self) -> None:
        self.calls = 0

    def discover(self, _query: str) -> ContactDiscoveryResult:
        self.calls += 1
        return ContactDiscoveryResult(
            email='roads@unknown.gov.in',
            department='Roads Department',
            authority='Unknown Municipal Corporation',
            sources=['https://unknown.gov.in/contact'],
            verification_status='verified',
            contact_source='online_search',
        )

    def close(self) -> None:
        return None


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


def test_local_match_does_not_call_contact_discovery() -> None:
    discovery = FakeDiscovery()

    result = resolve_location(
        {'city': 'Pune', 'suburb': 'Shivajinagar'},
        'pothole',
        FakeVectorStore(),
        contact_discovery=discovery,
    )

    assert result.email is None
    assert discovery.calls == 0


def test_unmatched_city_uses_unverified_discovered_contact() -> None:
    discovery = FakeDiscovery()

    result = resolve_location(
        {'city': 'Unknown', 'ward': 'Ward 7'},
        'garbage',
        FakeVectorStore(),
        contact_discovery=discovery,
    )

    assert result.email == 'roads@unknown.gov.in'
    assert result.needs_user_review is True
    assert result.confidence == 0.6
    assert result.ward == 'Ward 7'
    assert result.verification_status == 'unverified'
    assert result.sources == ['https://unknown.gov.in/contact']
    assert discovery.calls == 1
