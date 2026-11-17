"""One-off script: add municipality_name_en column to up_ward_directory.csv.

Transliterates municipality_name_hi (Hindi) to ASCII using unidecode, and
adds a municipality_name_en_source column to indicate the value is
machine-generated and should be human-reviewed.

Run from the repo root:
    python services/agent/scripts/add_en_names.py

Requires: unidecode (pip install unidecode)
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

try:
    from unidecode import unidecode
except ImportError:
    print('ERROR: unidecode is required. Run: pip install unidecode')
    sys.exit(1)

# ---------------------------------------------------------------------------
# Alias map: known spelling variants and common English names for municipalities.
# Keys are normalised (lowercase, stripped). Values are preferred English names.
# Add more entries here as data is reviewed.
# ---------------------------------------------------------------------------
_ALIAS_MAP: dict[str, str] = {
    # Auraiya district
    'बिधूना': 'Bidhuna',
    'bidhuunaa': 'Bidhuna',
    'bidhuna': 'Bidhuna',
    'bilhuna': 'Bidhuna',
    'औरैया': 'Auraiya',
    'auraiyaa': 'Auraiya',
    'फफूद': 'Phaphund',
    'phphuud': 'Phaphund',
    'अटसू': 'Atasu',
    'attsuu': 'Atasu',
    'दिबियापुर': 'Dibiyapur',
    'dibiyaapur': 'Dibiyapur',
    'अछल्दा': 'Achhalda',
    'achldaa': 'Achhalda',
    # Major cities (bad transliterations)
    'लखनऊ': 'Lucknow',
    'lkhnuu': 'Lucknow',
    'lucknow': 'Lucknow',
    'कानपुर': 'Kanpur',
    'kaanpur': 'Kanpur',
    'kanpur': 'Kanpur',
    'कानपुर देहात': 'Kanpur Dehat',
    'kaanpur dehaat': 'Kanpur Dehat',
    'आगरा': 'Agra',
    'aagraa': 'Agra',
    'agra': 'Agra',
    'वाराणसी': 'Varanasi',
    'vaaraanasii': 'Varanasi',
    'varanasi': 'Varanasi',
    'प्रयागराज': 'Prayagraj',
    'pryaagraaj': 'Prayagraj',
    'prayagraj': 'Prayagraj',
    'allahabad': 'Prayagraj',
    'अलीगढ़': 'Aligarh',
    'aliigdh': 'Aligarh',
    'aligarh': 'Aligarh',
    'मेरठ': 'Meerut',
    'merth': 'Meerut',
    'meerut': 'Meerut',
    'गाज़ियाबाद': 'Ghaziabad',
    'gaajiyaabaad': 'Ghaziabad',
    'ghaziabad': 'Ghaziabad',
    'बरेली': 'Bareilly',
    'brelii': 'Bareilly',
    'bareilly': 'Bareilly',
    'मुरादाबाद': 'Moradabad',
    'muraadaabaad': 'Moradabad',
    'moradabad': 'Moradabad',
    'गोरखपुर': 'Gorakhpur',
    'gorkhpur': 'Gorakhpur',
    'gorakhpur': 'Gorakhpur',
    'झाँसी': 'Jhansi',
    'jhaansii': 'Jhansi',
    'jhansi': 'Jhansi',
    'मथुरा': 'Mathura',
    'mthuraa': 'Mathura',
    'mathura': 'Mathura',
    'अयोध्या': 'Ayodhya',
    'ayodhyaa': 'Ayodhya',
    'ayodhya': 'Ayodhya',
    'फैज़ाबाद': 'Faizabad',
    'fijaabaabaad': 'Faizabad',
    'faizabad': 'Faizabad',
    # Common mis-spellings
    'jayas': 'Jais',
    'jais': 'Jais',
}


def _transliterate(hindi: str) -> str:
    """Transliterate a Hindi string to ASCII, then title-case it."""
    if not hindi:
        return ''
    transliterated = unidecode(hindi)
    # Clean up extra spaces and capitalise each word
    cleaned = re.sub(r'\s+', ' ', transliterated).strip().title()
    return cleaned


def _resolve_en_name(hindi: str) -> tuple[str, str]:
    """Return (english_name, source_flag).

    Checks the alias map first; falls back to unidecode transliteration.
    Returns source_flag: 'alias_map' or 'machine_transliteration'.
    """
    if not hindi:
        return ('', 'empty')
    normalised = re.sub(r'\s+', ' ', hindi).strip().lower()
    if normalised in _ALIAS_MAP:
        return (_ALIAS_MAP[normalised], 'alias_map')
    return (_transliterate(hindi), 'machine_transliteration')


def main() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    csv_path = repo_root / 'services' / 'agent' / 'data' / 'up_ward_directory.csv'

    if not csv_path.exists():
        print(f'ERROR: CSV not found at {csv_path}')
        sys.exit(1)

    rows: list[dict[str, str]] = []
    with csv_path.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        rows = list(reader)

    # Add new columns if not already present
    new_fields = ['municipality_name_en', 'municipality_name_en_source']
    for field in new_fields:
        if field not in fieldnames:
            fieldnames = list(fieldnames) + [field]

    updated = 0
    for row in rows:
        hindi_name = row.get('municipality_name_hi', '')
        en_name, source = _resolve_en_name(hindi_name)
        row['municipality_name_en'] = en_name
        row['municipality_name_en_source'] = source
        updated += 1

    with csv_path.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f'Done. Updated {updated} rows in {csv_path}')
    print('NOTE: municipality_name_en values are machine-generated and should be reviewed.')


if __name__ == '__main__':
    main()
