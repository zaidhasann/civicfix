"""Tests for Phase 0: startup resilience without optional Bijnor CSV and road-name heuristics."""
from __future__ import annotations

from pathlib import Path
import tempfile
import pytest

from civicfix_agent.config import Settings
from civicfix_agent.run_service import create_run_service
from civicfix_agent.bijnor_directory import BijnorWardDirectory


def test_service_starts_without_bijnor_csv(tmp_path: Path) -> None:
    """RunService must start gracefully even when Bijnor CSV is completely missing."""
    db_path = str(tmp_path / 'test_runs.sqlite')
    fake_bijnor = tmp_path / 'non_existent_bijnor.csv'
    up_csv = Path(__file__).resolve().parents[3] / 'services' / 'agent' / 'data' / 'up_ward_directory.csv'

    settings = Settings(
        bijnor_csv_path=fake_bijnor,
        up_csv_path=up_csv,
    )

    with create_run_service(db_path, settings=settings) as service:
        assert service is not None
        assert service.graph is not None


def test_bijnor_road_heuristic_does_not_override_actual_city(tmp_path: Path) -> None:
    """When a city is present, road name must NOT override it even if road mentions a Bijnor town."""
    fake_csv = tmp_path / 'dummy_bijnor.csv'
    fake_csv.write_text(
        'municipality,ward_number,municipal_contact_email,municipality_type,email_verification,district,state\n'
        'Mandawar,1,eo_mandawar@example.com,Nagar Panchayat,True,Bijnor,Uttar Pradesh\n'
        'Bijnor,1,eo_bijnor@example.com,Nagar Palika Parishad,True,Bijnor,Uttar Pradesh\n',
        encoding='utf-8',
    )
    bijnor_dir = BijnorWardDirectory(fake_csv)

    # City is Chandpur (not in Bijnor CSV), road mentions Mandawar.
    # Because city is explicitly given as Chandpur, it should NOT guess Mandawar!
    res = bijnor_dir.lookup({'city': 'Chandpur', 'road': 'Mandawar Road'})
    assert res is None, "Should not override explicit city with road name"

    # Only when NO city is present at all, road can be used as fallback
    res_fallback = bijnor_dir.lookup({'road': 'Mandawar Road'})
    assert res_fallback is not None
    assert res_fallback.municipality == 'Mandawar'
