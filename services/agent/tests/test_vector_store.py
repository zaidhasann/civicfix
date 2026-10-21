from civicfix_agent.ingestion import chunk_text, ingest_municipalities
from civicfix_agent.vector_store import VectorDocument, embed_text


class FakeVectorStore:
    def __init__(self) -> None:
        self.documents: list[VectorDocument] = []

    def upsert(self, documents: list[VectorDocument]) -> None:
        self.documents.extend(documents)


def test_chunk_text_has_overlap() -> None:
    chunks = chunk_text('one two three four five', chunk_size=3, overlap=1)

    assert chunks == ['one two three', 'three four five']


def test_embedding_is_normalized_and_deterministic() -> None:
    first = embed_text('road maintenance')

    assert first == embed_text('road maintenance')
    assert round(sum(value * value for value in first), 6) == 1


def test_municipality_ingestion_upserts_searchable_chunks() -> None:
    store = FakeVectorStore()

    count = ingest_municipalities(store)

    assert count == len(store.documents)
    assert store.documents
    assert store.documents[0].metadata == {
        'city': 'Pune',
        'ward': 'Citywide',
        'department': 'Pune Municipal Corporation',
        'doc_type': 'municipality_directory',
    }
