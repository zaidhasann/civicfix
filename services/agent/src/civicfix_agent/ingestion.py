from __future__ import annotations

import re
from pathlib import Path

from civicfix_agent.municipalities import load_municipalities
from civicfix_agent.vector_store import VectorDocument, VectorStore


def chunk_text(text: str, chunk_size: int = 600, overlap: int = 80) -> list[str]:
    if chunk_size < 1 or overlap < 0 or overlap >= chunk_size:
        raise ValueError('chunk_size must be positive and overlap must be smaller than chunk_size')
    words = re.findall(r'\S+', text)
    chunks: list[str] = []
    start = 0
    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunks.append(' '.join(words[start:end]))
        if end == len(words):
            break
        start = end - overlap
    return chunks


def municipality_documents(path: Path | None = None) -> list[VectorDocument]:
    directory = load_municipalities(path)
    documents: list[VectorDocument] = []
    for index, municipality in enumerate(directory.municipalities):
        responsibilities = '; '.join(
            f'{category}: {responsibility}'
            for category, responsibility in municipality.category_responsibilities.items()
        )
        text = (
            f'City: {municipality.city}. Ward or zone: {municipality.ward_zone}. '
            f'Department: {municipality.department}. Responsibilities: {responsibilities}. '
            f'Notice format: {municipality.notice_format_notes} '
            f'Verification notes: {municipality.verification_notes}'
        )
        metadata = {
            'city': municipality.city,
            'ward': municipality.ward_zone,
            'department': municipality.department,
            'doc_type': 'municipality_directory',
        }
        for chunk_index, chunk in enumerate(chunk_text(text)):
            documents.append(
                VectorDocument(
                    document_id=f'municipality-{index}-{chunk_index}',
                    text=chunk,
                    metadata=metadata,
                )
            )
    return documents


def ingest_municipalities(store: VectorStore, path: Path | None = None) -> int:
    documents = municipality_documents(path)
    store.upsert(documents)
    return len(documents)
