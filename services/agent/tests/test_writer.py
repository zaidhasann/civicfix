from datetime import date

from civicfix_agent.vector_store import SearchResult
from civicfix_agent.writer import DraftOutput, write_complaint_draft


def test_writer_returns_valid_draft_with_map_photo_and_retrieved_citation() -> None:
    result = write_complaint_draft(
        issue_type='pothole',
        severity=4,
        address={'city': 'Pune', 'road': 'FC Road'},
        coordinates=(18.5204, 73.8567),
        photo_url='https://example.com/photo.jpg',
        description='A pothole is visible in the lane.',
        report_date=date(2026, 10, 21),
        legal_references=[
            SearchResult(
                document_id='legal-1',
                text='Roads must be maintained.',
                metadata={
                    'act_name': 'Provided Act',
                    'section': 'Section 12',
                    'source_url': 'https://example.test/act#12',
                },
                distance=0.1,
            )
        ],
    )

    assert isinstance(result, DraftOutput)
    assert result.subject == 'Civic issue report: pothole (severity 4/5)'
    assert 'https://www.google.com/maps/search/?api=1&query=18.5204%2C73.8567' in result.body
    assert 'https://example.com/photo.jpg' in result.body
    assert 'Provided Act, Section 12 (https://example.test/act#12)' in result.body
    assert '2026-10-21' in result.body


def test_writer_does_not_cite_unretrieved_or_incomplete_references() -> None:
    result = write_complaint_draft(
        issue_type='garbage',
        severity=2,
        address={},
        coordinates=(18.5, 73.8),
        photo_url='https://example.com/photo.jpg',
        description='Waste is present.',
        legal_references=[
            SearchResult(
                document_id='not-cited',
                text='Untrusted text',
                metadata={'act_name': 'Untrusted Act'},
                distance=0.1,
            )
        ],
    )

    assert 'Untrusted Act' not in result.body
    assert 'Retrieved legal references:' not in result.body
