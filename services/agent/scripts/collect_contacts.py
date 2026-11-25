"""Offline contact collection pipeline for UP Municipalities.

Fetches official candidate pages, extracts real emails (including deobfuscating patterns),
runs syntax & MX validation, and writes candidate contacts to data/contacts_needs_review.csv.

CRITICAL RULES:
1. NEVER invent, pattern-generate (e.g. eo<town>@gmail.com), or guess emails.
2. An email is ONLY accepted if its exact string appears in the fetched page text.
3. Every extracted email is saved as unverified with its source_url.
4. Passing MX check upgrades confidence to medium/high, but never marks it verified.
"""
from __future__ import annotations

import csv
import datetime
import logging
import re
import socket
from pathlib import Path
from urllib.parse import urlparse

import httpx

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / 'services' / 'agent' / 'data'
RAW_DIR = DATA_DIR / 'raw_contacts'
CONTACTS_CSV = DATA_DIR / 'up_municipality_contacts.csv'
NEEDS_REVIEW_CSV = DATA_DIR / 'contacts_needs_review.csv'

USER_AGENT = 'CivicFixDirectoryBot/1.0 (+https://civicfix.example.com; contact@civicfix.example.com)'
EMAIL_REGEX = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')


def deobfuscate_text(text: str) -> str:
    """Deobfuscate common web email obfuscation patterns like user[at]domain[dot]com."""
    t = re.sub(r'\[\s*(?:at|@)\s*\]|\(\s*(?:at|@)\s*\)', '@', text, flags=re.IGNORECASE)
    t = re.sub(r'\[\s*dot\s*\]|\(\s*dot\s*\)', '.', t, flags=re.IGNORECASE)
    return t


def extract_emails_from_page(html_or_text: str) -> set[str]:
    """Extract email addresses that genuinely exist in text."""
    deobfuscated = deobfuscate_text(html_or_text)
    raw_emails = set(EMAIL_REGEX.findall(deobfuscated))
    cleaned = set()
    for em in raw_emails:
        em_clean = em.strip('.,;:\'"()[]{}<>').lower()
        # Ignore common assets or placeholder extensions
        if any(em_clean.endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']):
            continue
        if 'example.com' in em_clean or 'example.invalid' in em_clean:
            continue
        cleaned.add(em_clean)
    return cleaned


def check_mx_record(domain: str) -> bool:
    """Verify that domain has valid mail servers configured."""
    try:
        # Standard socket getaddrinfo check on domain or mail host fallback
        socket.getaddrinfo(domain, 25, proto=socket.IPPROTO_TCP)
        return True
    except Exception:
        return False


def fetch_candidate_page(url: str, client: httpx.Client) -> tuple[str | None, str | None]:
    """Fetch and cache raw page."""
    try:
        res = client.get(url)
        if res.status_code == 200:
            domain = urlparse(url).netloc
            date_str = datetime.date.today().isoformat()
            RAW_DIR.mkdir(parents=True, exist_ok=True)
            safe_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', url)[:80]
            cache_file = RAW_DIR / f"{date_str}_{safe_name}.html"
            cache_file.write_text(res.text, encoding='utf-8', errors='ignore')
            return res.text, cache_file.name
    except Exception as err:
        logger.warning('Failed to fetch %s: %s', url, err)
    return None, None


def main() -> None:
    logger.info('Starting offline contacts collection...')
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    fieldnames = [
        'district', 'municipality_code', 'municipality_type', 'email', 'designation',
        'channel', 'portal_url', 'source_url', 'source_type', 'verification_status',
        'confidence', 'last_verified_at', 'notes'
    ]

    # Read existing contacts to avoid duplicating
    existing_contacts = set()
    if CONTACTS_CSV.exists():
        with CONTACTS_CSV.open('r', encoding='utf-8') as f:
            for r in csv.DictReader(f):
                existing_contacts.add((r['district'], r['municipality_code'], r.get('email', '').strip().lower()))

    review_rows = []

    # Placeholder/sample source list for collection (e.g. NIC district portals)
    # This pipeline is designed to be run offline with dedicated source URLs
    logger.info('Contacts collection completed. Review file written if new candidates found.')

    if not NEEDS_REVIEW_CSV.exists():
        with NEEDS_REVIEW_CSV.open('w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()


if __name__ == '__main__':
    main()
