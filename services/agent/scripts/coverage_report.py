"""Coverage report for UP municipalities email directory.

Prints per-district counts of total municipalities, municipalities with verified
emails, and municipalities relying on fallback state escalation email.
"""
from __future__ import annotations

import csv
import sys
from collections import defaultdict
from pathlib import Path


def generate_coverage_report(csv_path: Path) -> str:
    if not csv_path.exists():
        return f"File not found: {csv_path}"

    with csv_path.open('r', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    # Aggregate by (district, municipality_code)
    munis: dict[tuple[str, str], dict[str, str]] = {}
    for r in rows:
        key = (r['district'], r['municipality_code'])
        if key not in munis:
            munis[key] = {
                'district': r['district'],
                'municipality_name_en': r.get('municipality_name_en', ''),
                'email': r.get('municipal_contact_email', '').strip(),
                'fallback': r.get('fallback_contact_email', '').strip(),
            }

    district_stats: dict[str, dict[str, int]] = defaultdict(lambda: {'total': 0, 'verified': 0, 'fallback': 0})
    for info in munis.values():
        dist = info['district']
        district_stats[dist]['total'] += 1
        if info['email']:
            district_stats[dist]['verified'] += 1
        else:
            district_stats[dist]['fallback'] += 1

    lines = []
    lines.append("=" * 70)
    lines.append(f"{'DISTRICT':<25} | {'TOTAL MUNIS':<12} | {'VERIFIED EMAIL':<15} | {'FALLBACK ONLY':<14}")
    lines.append("-" * 70)

    total_munis = 0
    total_verified = 0
    total_fallback = 0

    for dist in sorted(district_stats.keys()):
        stats = district_stats[dist]
        total_munis += stats['total']
        total_verified += stats['verified']
        total_fallback += stats['fallback']
        lines.append(f"{dist:<25} | {stats['total']:<12} | {stats['verified']:<15} | {stats['fallback']:<14}")

    lines.append("=" * 70)
    lines.append(f"{'UP STATE TOTAL':<25} | {total_munis:<12} | {total_verified:<15} | {total_fallback:<14}")
    pct = (total_verified / total_munis * 100) if total_munis else 0
    lines.append(f"Coverage: {pct:.2f}% verified municipal emails ({total_verified}/{total_munis})")
    lines.append("=" * 70)

    return "\n".join(lines)


def main() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    csv_path = repo_root / 'services' / 'agent' / 'data' / 'up_ward_directory.csv'
    report = generate_coverage_report(csv_path)
    print(report)


if __name__ == '__main__':
    main()
