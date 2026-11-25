import pytest
import sys
from pathlib import Path

# Ensure scripts dir is importable
repo_root = Path(__file__).resolve().parents[1]
scripts_dir = repo_root / "scripts"
if str(scripts_dir) not in sys.path:
    sys.path.insert(0, str(scripts_dir))

from build_centroids import (
    normalize_hindi,
    normalize_ascii,
    haversine_km,
    UP_BBOX,
)
from collect_contacts import (
    deobfuscate_text,
    extract_emails_from_page,
)


class TestBuildCentroidsLogic:
    def test_normalize_hindi_strips_suffixes_and_variations(self):
        assert normalize_hindi("बिधूना नगर पंचायत") == "बिधूना"
        assert normalize_hindi("आगरा नगर निगम") == "आगरा"
        assert normalize_hindi("मथुरा नगर पालिका परिषद") == "मथुरा"
        # Chandrabindu / anusvara variation
        assert "बिधुना" in normalize_hindi("बिधूना") or "बिधूना" in normalize_hindi("बिधूना")

    def test_normalize_ascii(self):
        # normalize_ascii removes suffix words and keeps alphanumeric
        assert normalize_ascii("Bidhuna  Nagar Panchayat") == "bidhuna"
        assert normalize_ascii("Nagar Palika Parishad Bijnor") == "bijnor"
        assert normalize_ascii("Agra Nagar Nigam") == "agra"

    def test_haversine_km_calculation(self):
        # Distance between Agra (27.1767, 78.0081) and Lucknow (26.8467, 80.9462) is ~296-300 km
        dist = haversine_km(27.1767, 78.0081, 26.8467, 80.9462)
        assert 290 < dist < 310

        # Same point distance should be zero
        assert haversine_km(26.77, 79.53, 26.77, 79.53) == 0.0

    def test_bounding_box_validation(self):
        # Point inside UP
        assert UP_BBOX['min_lat'] <= 26.8467 <= UP_BBOX['max_lat']
        assert UP_BBOX['min_lng'] <= 80.9462 <= UP_BBOX['max_lng']

        # Point outside UP (e.g. London)
        assert not (UP_BBOX['min_lat'] <= 51.5074 <= UP_BBOX['max_lat'])


class TestCollectContactsLogic:
    def test_deobfuscate_text(self):
        raw = "Contact the EO at eobidhuna[at]up[dot]nic[dot]in or help(at)up(dot)gov(dot)in"
        deobf = deobfuscate_text(raw)
        assert "eobidhuna@up.nic.in" in deobf
        assert "help@up.gov.in" in deobf

    def test_extract_emails_from_page_obfuscated_and_exact_match(self):
        html_page = """
        <html>
            <body>
                <h1>Nagar Palika Office</h1>
                <p>For complaints, reach us at npp.bijnor[at]nic[dot]in or call 1800-XXX.</p>
                <p>Alternate: contact-officer@up.gov.in</p>
                <p>Invalid dummy: not_an_email@@invalid</p>
            </body>
        </html>
        """
        emails = extract_emails_from_page(html_page)
        # Should extract both valid emails
        assert "npp.bijnor@nic.in" in emails
        assert "contact-officer@up.gov.in" in emails
        assert len(emails) == 2

    def test_email_must_appear_in_page_text_rule(self):
        # Pure logic test: fabricated email not present in page text should not be produced
        text = "Welcome to Lucknow Nagar Nigam portal."
        emails = extract_emails_from_page(text)
        assert "commissioner@lucknow.nic.in" not in emails
        assert len(emails) == 0
