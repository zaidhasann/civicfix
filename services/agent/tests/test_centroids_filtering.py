"""Tests for Phase 1: centroid filtering by confidence and ignoring blank coordinates."""
from __future__ import annotations

from pathlib import Path
import pytest

from civicfix_agent.up_directory import UPWardDirectory


def test_nearest_municipality_ignores_blank_coordinates(tmp_path: Path) -> None:
    ward_csv = tmp_path / 'ward.csv'
    ward_csv.write_text(
        'district,municipality_code,municipality_type,municipality_name_en,municipality_name_hi,ward_number,municipal_contact_email,fallback_contact_email\n'
        'Auraiya,1,Nagar Palika Parishad,Auraiya,औरैया,1,eo_auraiya@example.com,diruplb@nic.in\n'
        'Auraiya,2,Nagar Panchayat,Bidhuna,बिधूना,1,,diruplb@nic.in\n',
        encoding='utf-8',
    )

    centroids_csv = tmp_path / 'centroids.csv'
    centroids_csv.write_text(
        'district,municipality_code,municipality_name_en,municipality_name_hi,municipality_type,lat,lng,match_method,confidence\n'
        'Auraiya,1,Auraiya,औरैया,Nagar Palika Parishad,,,none,low\n'
        'Auraiya,2,Bidhuna,बिधूना,Nagar Panchayat,26.770274,79.536750,manual,high\n',
        encoding='utf-8',
    )

    up_dir = UPWardDirectory(ward_csv, centroids_path=centroids_csv)

    # Coordinates near Bidhuna
    contact = up_dir.lookup({'road': 'Agra-Lucknow Expressway'}, coords=(26.77, 79.54))
    assert contact is not None
    assert contact.municipality_name_en == 'Bidhuna'
    assert contact.match_level == 'nearest'


def test_nearest_municipality_prefers_high_confidence_when_close(tmp_path: Path) -> None:
    ward_csv = tmp_path / 'ward.csv'
    ward_csv.write_text(
        'district,municipality_code,municipality_type,municipality_name_en,municipality_name_hi,ward_number,municipal_contact_email,fallback_contact_email\n'
        'DistrictA,1,Nagar Panchayat,TownLow,टाउनलो,1,,diruplb@nic.in\n'
        'DistrictA,2,Nagar Panchayat,TownHigh,टाउनहाई,1,,diruplb@nic.in\n',
        encoding='utf-8',
    )

    centroids_csv = tmp_path / 'centroids.csv'
    centroids_csv.write_text(
        'district,municipality_code,municipality_name_en,municipality_name_hi,municipality_type,lat,lng,match_method,confidence\n'
        'DistrictA,1,TownLow,टाउनलो,Nagar Panchayat,26.501,80.501,nominatim,low\n'
        'DistrictA,2,TownHigh,टाउनहाई,Nagar Panchayat,26.505,80.505,manual,high\n',
        encoding='utf-8',
    )

    up_dir = UPWardDirectory(ward_csv, centroids_path=centroids_csv)

    # Point equidistant, should prefer high confidence
    contact = up_dir.lookup({'road': 'Expressway'}, coords=(26.503, 80.503))
    assert contact is not None
    assert contact.municipality_name_en == 'TownHigh'
