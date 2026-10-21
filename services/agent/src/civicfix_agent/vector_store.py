from __future__ import annotations

import hashlib
import math
import os
import re
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel, Field


@dataclass(frozen=True)
class VectorDocument:
    document_id: str
    text: str
    metadata: dict[str, str]


class SearchResult(BaseModel):
    document_id: str
    text: str
    metadata: dict[str, str]
    distance: float = Field(ge=0)


class VectorStore(Protocol):
    def upsert(self, documents: Sequence[VectorDocument]) -> None:
        ...

    def query(self, text: str, limit: int = 5) -> list[SearchResult]:
        ...


def embed_text(text: str, dimensions: int = 256) -> list[float]:
    """Create a deterministic, dependency-free embedding for local ingestion."""

    vector = [0.0] * dimensions
    tokens = re.findall(r'[a-z0-9]+', text.lower())
    for token in tokens:
        digest = hashlib.blake2b(token.encode('utf-8'), digest_size=8).digest()
        index = int.from_bytes(digest[:4], 'big') % dimensions
        sign = 1.0 if digest[4] & 1 else -1.0
        vector[index] += sign

    norm = math.sqrt(sum(value * value for value in vector))
    if norm:
        vector = [value / norm for value in vector]
    return vector


class ChromaVectorStore:
    def __init__(
        self,
        persist_directory: str | Path = '.civicfix/chroma',
        collection_name: str = 'municipalities',
    ) -> None:
        import chromadb

        self._client = chromadb.PersistentClient(path=str(persist_directory))
        self._collection = self._client.get_or_create_collection(
            name=collection_name,
            metadata={'hnsw:space': 'cosine'},
        )

    def upsert(self, documents: Sequence[VectorDocument]) -> None:
        if not documents:
            return
        self._collection.upsert(
            ids=[document.document_id for document in documents],
            documents=[document.text for document in documents],
            metadatas=[document.metadata for document in documents],
            embeddings=[embed_text(document.text) for document in documents],
        )

    def query(self, text: str, limit: int = 5) -> list[SearchResult]:
        if limit < 1:
            raise ValueError('limit must be positive')
        result = self._collection.query(
            query_embeddings=[embed_text(text)],
            n_results=limit,
            include=['documents', 'metadatas', 'distances'],
        )
        documents = result.get('documents', [[]])[0]
        metadatas = result.get('metadatas', [[]])[0]
        distances = result.get('distances', [[]])[0]
        ids = result.get('ids', [[]])[0]
        return [
            SearchResult(
                document_id=document_id,
                text=document,
                metadata=metadata or {},
                distance=max(0.0, float(distance)),
            )
            for document_id, document, metadata, distance in zip(
                ids,
                documents,
                metadatas,
                distances,
            )
        ]


class PineconeVectorStore:
    def __init__(
        self,
        index_name: str | None = None,
        dimension: int = 256,
    ) -> None:
        try:
            from pinecone import Pinecone
        except ImportError as error:
            raise RuntimeError(
                'Install the optional pinecone package to use AGENT_VECTOR_STORE=pinecone'
            ) from error

        api_key = os.getenv('PINECONE_API_KEY')
        if not api_key:
            raise ValueError('PINECONE_API_KEY is required for the Pinecone vector store')
        self._index = Pinecone(api_key=api_key).Index(
            index_name or os.getenv('PINECONE_INDEX', 'civicfix-municipalities')
        )
        self._dimension = dimension

    def upsert(self, documents: Sequence[VectorDocument]) -> None:
        self._index.upsert(
            vectors=[
                {
                    'id': document.document_id,
                    'values': embed_text(document.text, self._dimension),
                    'metadata': {'text': document.text, **document.metadata},
                }
                for document in documents
            ]
        )

    def query(self, text: str, limit: int = 5) -> list[SearchResult]:
        if limit < 1:
            raise ValueError('limit must be positive')
        response = self._index.query(
            vector=embed_text(text, self._dimension),
            top_k=limit,
            include_metadata=True,
        )
        return [
            SearchResult(
                document_id=match['id'],
                text=match.get('metadata', {}).get('text', ''),
                metadata={
                    key: value
                    for key, value in match.get('metadata', {}).items()
                    if key != 'text'
                },
                distance=max(0.0, 1.0 - float(match.get('score', 0.0))),
            )
            for match in response.get('matches', [])
        ]


def create_vector_store() -> VectorStore:
    provider = os.getenv('AGENT_VECTOR_STORE', 'chroma').lower()
    if provider == 'chroma':
        return ChromaVectorStore(
            persist_directory=os.getenv('AGENT_VECTOR_STORE_PATH', '.civicfix/chroma'),
            collection_name=os.getenv('AGENT_VECTOR_COLLECTION', 'municipalities'),
        )
    if provider == 'pinecone':
        return PineconeVectorStore()
    raise ValueError(f'Unsupported vector store provider: {provider}')
