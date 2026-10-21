from pathlib import Path

import pytest
from pydantic import ValidationError

from civicfix_agent.municipalities import load_municipalities


def test_pune_directory_loads_and_validates() -> None:
    directory = load_municipalities()

    assert len(directory.municipalities) == 1
    pune = directory.municipalities[0]
    assert pune.city == 'Pune'
    assert pune.verification_status == 'unverified'
    assert pune.category_responsibilities['pothole']


def test_directory_rejects_unknown_fields(tmp_path: Path) -> None:
    path = tmp_path / 'invalid.json'
    path.write_text(
        '{"municipalities": [{"city": "Pune", "ward_zone": "Citywide", "department": "PMC",'
        '"category_responsibilities": {"pothole": "roads"}, "official_email": null,'
        '"notice_format_notes": "notes", "source_url": "https://www.pmc.gov.in/",'
        '"last_verified_date": null, "verification_status": "unverified",'
        '"verification_notes": "unverified", "unexpected": true}]}',
        encoding='utf-8',
    )

    with pytest.raises(ValidationError):
        load_municipalities(path)
