"""Script to approve reviewed municipality contacts and promote them to up_municipality_contacts.csv.

Usage:
    python services/agent/scripts/approve_contacts.py [path_to_approved_csv]
"""
from __future__ import annotations

import csv
import datetime
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / 'services' / 'agent' / 'data'
CONTACTS_CSV = DATA_DIR / 'up_municipality_contacts.csv'
REVIEW_CSV = DATA_DIR / 'contacts_needs_review.csv'


def approve_contacts(input_file: Path) -> int:
    if not input_file.exists():
        print(f"File not found: {input_file}")
        return 0

    with input_file.open('r', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    fieldnames = [
        'district', 'municipality_code', 'municipality_type', 'email', 'designation',
        'channel', 'portal_url', 'source_url', 'source_type', 'verification_status',
        'confidence', 'last_verified_at', 'notes'
    ]

    existing_rows = []
    existing_keys = set()
    if CONTACTS_CSV.exists():
        with CONTACTS_CSV.open('r', encoding='utf-8') as f:
            for r in csv.DictReader(f):
                existing_rows.append(r)
                existing_keys.add((r['district'], r['municipality_code'], r.get('email', '').strip().lower()))

    today = datetime.date.today().isoformat()
    approved_count = 0

    for r in rows:
        email = r.get('email', '').strip().lower()
        if not email:
            continue
        # Set verified status and timestamp
        r['verification_status'] = 'verified'
        r['last_verified_at'] = today
        key = (r['district'], r['municipality_code'], email)
        if key not in existing_keys:
            existing_rows.append(r)
            existing_keys.add(key)
            approved_count += 1

    with CONTACTS_CSV.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(existing_rows)

    print(f"Approved and appended {approved_count} contacts to {CONTACTS_CSV}.")
    return approved_count


def main() -> None:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else REVIEW_CSV
    approve_contacts(target)


if __name__ == '__main__':
    main()
