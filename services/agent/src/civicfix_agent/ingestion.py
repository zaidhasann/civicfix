from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, HttpUrl

from civicfix_agent.municipalities import load_municipalities
from civicfix_agent.vector_store import VectorDocument, VectorStore


class LegalSource(BaseModel):
    model_config = ConfigDict(extra='forbid')

    file: str
    act_name: str
    section: str
    source_url: HttpUrl
    issue_type: Literal['sanitation', 'roads', 'street_lighting']


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
            'source_url': str(municipality.source_url),
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


def load_legal_sources(manifest_path: Path) -> list[LegalSource]:
    with manifest_path.open(encoding='utf-8') as manifest_file:
        data = json.load(manifest_file)
    if not isinstance(data, list):
        raise TypeError('legal source manifest must contain a JSON list')
    return [LegalSource.model_validate(item) for item in data]


def legal_documents(
    manifest_path: Path,
    source_directory: Path | None = None,
) -> list[VectorDocument]:
    sources = load_legal_sources(manifest_path)
    root = source_directory or manifest_path.parent
    documents: list[VectorDocument] = []
    for source_index, source in enumerate(sources):
        source_path = (root / source.file).resolve()
        if not source_path.is_file():
            raise FileNotFoundError(f'Legal source file does not exist: {source_path}')
        text = source_path.read_text(encoding='utf-8').strip()
        if not text:
            raise ValueError(f'Legal source file is empty: {source_path}')
        metadata = {
            'act_name': source.act_name,
            'section': source.section,
            'source_url': str(source.source_url),
            'issue_type': source.issue_type,
            'doc_type': 'legal_reference',
        }
        for chunk_index, chunk in enumerate(chunk_text(text)):
            documents.append(
                VectorDocument(
                    document_id=f'legal-{source_index}-{chunk_index}',
                    text=chunk,
                    metadata=metadata,
                )
            )
    return documents


def ingest_legal_sources(
    store: VectorStore,
    manifest_path: Path,
    source_directory: Path | None = None,
) -> int:
    documents = legal_documents(manifest_path, source_directory)
    store.upsert(documents)
    return len(documents)
