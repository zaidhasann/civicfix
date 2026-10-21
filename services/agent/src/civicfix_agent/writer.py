from __future__ import annotations

from collections.abc import Sequence
from datetime import date
from pathlib import Path
from urllib.parse import quote

from pydantic import BaseModel, ConfigDict, Field

from civicfix_agent.vector_store import SearchResult


class DraftOutput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    subject: str = Field(min_length=1)
    body: str = Field(min_length=1)


PROMPT_PATH = Path(__file__).resolve().parents[2] / 'prompts' / 'writer.md'
WRITER_PROMPT = PROMPT_PATH.read_text(encoding='utf-8')


def write_complaint_draft(
    *,
    issue_type: str,
    severity: int,
    address: dict[str, str | None],
    coordinates: tuple[float, float],
    photo_url: str,
    description: str,
    legal_references: Sequence[SearchResult] = (),
    report_date: date | None = None,
) -> DraftOutput:
    """Build a factual complaint draft from supplied report data and references."""

    latitude, longitude = coordinates
    maps_url = (
        f'https://www.google.com/maps/search/?api=1&query={quote(f"{latitude},{longitude}")}'
    )
    subject = f'Civic issue report: {issue_type} (severity {severity}/5)'
    lines = [
        'Dear Sir or Madam,',
        '',
        'I am writing to report the following civic issue for your review and appropriate action.',
        f'Issue type: {issue_type}',
        f'Severity: {severity}/5',
        f'Description: {description}',
    ]
    if report_date is not None:
        lines.append(f'Reported date: {report_date.isoformat()}')

    address_parts = [
        f'{label}: {value}'
        for label, key in (
            ('Road', 'road'),
            ('Suburb', 'suburb'),
            ('City', 'city'),
            ('District', 'district'),
            ('State', 'state'),
            ('Pincode', 'pincode'),
        )
        if (value := address.get(key))
    ]
    if address_parts:
        lines.append('Location: ' + '; '.join(address_parts))
    lines.extend(
        [
            f'Coordinates: {latitude}, {longitude}',
            f'Map: {maps_url}',
            f'Photo/evidence: {photo_url}',
        ]
    )

    citations = _citations(legal_references)
    if citations:
        lines.extend(['', 'Retrieved legal references:'])
        lines.extend(f'- {citation}' for citation in citations)

    lines.extend(
        [
            '',
            'Please acknowledge this report and advise on the expected next steps.',
            '',
            'Yours faithfully,',
            'CivicFix reporter',
        ]
    )
    return DraftOutput(subject=subject, body='\n'.join(lines))


def _citations(references: Sequence[SearchResult]) -> list[str]:
    citations: list[str] = []
    for reference in references:
        section = reference.metadata.get('section')
        act_name = reference.metadata.get('act_name')
        source_url = reference.metadata.get('source_url')
        if act_name and section and source_url:
            citation = f'{act_name}, {section} ({source_url})'
            if citation not in citations:
                citations.append(citation)
    return citations
