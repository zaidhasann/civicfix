from pathlib import Path

from civicfix_agent.bijnor_directory import BijnorWardDirectory

CSV_PATH = Path(__file__).parents[1] / 'data' / 'bijnor_ward_email_directory.csv'


def test_bijnor_directory_matches_city_and_ward() -> None:
    directory = BijnorWardDirectory(CSV_PATH)

    result = directory.lookup({'city': 'Bijnor', 'ward': 'Ward 4'})

    assert result is not None
    assert result.municipality == 'Bijnor'
    assert result.ward_number == '4'
    assert result.email == 'eonppbijbi-up@nic.in'


def test_bijnor_directory_disambiguates_area_with_district_name() -> None:
    directory = BijnorWardDirectory(CSV_PATH)

    result = directory.lookup({'city': 'Dhampur, Bijnor', 'ward': 'Ward 1'})

    assert result is not None
    assert result.municipality == 'Dhampur'
    assert result.ward_number == '1'
    assert result.email == 'eonppdhambi-up@nic.in'


def test_bijnor_directory_extracts_municipality_from_road_name() -> None:
    directory = BijnorWardDirectory(CSV_PATH)

    result = directory.lookup({'road': 'Mandawar Road'})

    assert result is not None
    assert result.municipality == 'Mandawar'
    assert result.ward_number == '1'
    assert result.email == 'eonpmandbi-up@nic.in'


def test_bijnor_directory_returns_no_contact_for_missing_email() -> None:
    directory = BijnorWardDirectory(CSV_PATH)

    result = directory.lookup({'city': 'Jhalu', 'ward': 'Ward 1'})

    assert result is None
