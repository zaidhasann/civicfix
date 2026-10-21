import json
from pathlib import Path

from civicfix_agent.ingestion import ingest_legal_sources, legal_documents
from civicfix_agent.vector_store import SearchResult, VectorDocument


class FakeVectorStore:
    def __init__(self) -> None:
        self.documents: list[VectorDocument] = []

    def upsert(self, documents: list[VectorDocument]) -> None:
        self.documents.extend(documents)

    def query(
        self,
        text: str,
        limit: int = 5,
        metadata_filter: dict[str, str] | None = None,
    ) -> list[SearchResult]:
        matching = [
            document
            for document in self.documents
            if not metadata_filter
            or all(document.metadata.get(key) == value for key, value in metadata_filter.items())
        ]
        return [
            SearchResult(
                document_id=document.document_id,
                text=document.text,
                metadata=document.metadata,
                distance=0,
            )
            for document in matching[:limit]
        ]


def test_legal_sources_preserve_supplied_text_and_citation_metadata(tmp_path: Path) -> None:
    source_file = tmp_path / 'roads.txt'
    source_file.write_text('Roads must be maintained by the municipal authority.', encoding='utf-8')
    manifest = tmp_path / 'manifest.json'
    manifest.write_text(
        json.dumps(
            [
                {
                    'file': 'roads.txt',
                    'act_name': 'Provided Municipal Act',
                    'section': 'Section 12',
                    'source_url': 'https://example.test/act#section-12',
                    'issue_type': 'roads',
                }
            ]
        ),
        encoding='utf-8',
    )

    documents = legal_documents(manifest)

    assert documents[0].text == source_file.read_text(encoding='utf-8')
    assert documents[0].metadata == {
        'act_name': 'Provided Municipal Act',
        'section': 'Section 12',
        'source_url': 'https://example.test/act#section-12',
        'issue_type': 'roads',
        'doc_type': 'legal_reference',
    }


def test_issue_type_query_returns_matching_legal_section(tmp_path: Path) -> None:
    source_file = tmp_path / 'lighting.txt'
    source_file.write_text('Street lighting shall be maintained.', encoding='utf-8')
    manifest = tmp_path / 'manifest.json'
    manifest.write_text(
        json.dumps(
            [
                {
                    'file': 'lighting.txt',
                    'act_name': 'Provided Municipal Act',
                    'section': 'Section 21',
                    'source_url': 'https://example.test/act#section-21',
                    'issue_type': 'street_lighting',
                }
            ]
        ),
        encoding='utf-8',
    )
    store = FakeVectorStore()

    count = ingest_legal_sources(store, manifest)
    results = store.query('street light', metadata_filter={'issue_type': 'street_lighting'})

    assert count == 1
    assert results[0].metadata['section'] == 'Section 21'
