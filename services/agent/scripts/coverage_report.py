"""Coverage report for UP municipalities email directory and centroid coverage.

Prints:
- Municipalities per type per district.
- How many have a verified email, and how many have coordinates.
- A list of districts whose count looks low compared to expected totals.
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path


def generate_coverage_report(data_dir: Path) -> str:
    ward_csv = data_dir / 'up_ward_directory.csv'
    centroids_csv = data_dir / 'up_municipality_centroids.csv'
    expected_json = data_dir / 'expected_ulb_counts.json'

    if not ward_csv.exists():
        return f"File not found: {ward_csv}"

    # Load centroids coordinates map
    coord_munis = set()
    if centroids_csv.exists():
        with centroids_csv.open('r', encoding='utf-8') as f:
            for r in csv.DictReader(f):
                if (r.get('lat') or '').strip() and (r.get('lng') or '').strip():
                    coord_munis.add((r['district'], r['municipality_code']))

    # Load expected counts if present
    expected_data = {}
    if expected_json.exists():
        try:
            with expected_json.open('r', encoding='utf-8') as f:
                expected_data = json.load(f)
        except Exception:
            pass

    with ward_csv.open('r', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    # Distinct municipalities by (district, municipality_code)
    munis: dict[tuple[str, str], dict[str, str]] = {}
    for r in rows:
        key = (r['district'], r['municipality_code'])
        if key not in munis:
            munis[key] = {
                'district': r['district'],
                'municipality_code': r['municipality_code'],
                'municipality_type': r.get('municipality_type', ''),
                'email': (r.get('municipal_contact_email') or '').strip(),
            }

    # Aggregate
    district_data = defaultdict(lambda: {
        'total': 0,
        'types': defaultdict(int),
        'verified_email': 0,
        'with_coords': 0,
    })

    type_totals = defaultdict(int)

    for (dist, code), info in munis.items():
        mtype = info['municipality_type'] or 'Unknown'
        district_data[dist]['total'] += 1
        district_data[dist]['types'][mtype] += 1
        type_totals[mtype] += 1

        if info['email']:
            district_data[dist]['verified_email'] += 1
        if (dist, code) in coord_munis:
            district_data[dist]['with_coords'] += 1

    lines = []
    lines.append("=" * 105)
    lines.append(f"{'DISTRICT':<20} | {'TOTAL':<5} | {'N.NIGAM':<7} | {'N.PALIKA':<8} | {'N.PANCH':<7} | {'EMAIL':<5} | {'COORDS':<6} | {'GAP / NOTES'}")
    lines.append("-" * 105)

    total_munis = 0
    total_email = 0
    total_coords = 0
    low_coverage_districts = []

    for dist in sorted(district_data.keys()):
        d = district_data[dist]
        total_munis += d['total']
        total_email += d['verified_email']
        total_coords += d['with_coords']

        nn = d['types'].get('Nagar Nigam', 0)
        npp = d['types'].get('Nagar Palika Parishad', 0)
        np = d['types'].get('Nagar Panchayat', 0)

        # Flag districts with very few municipalities (e.g. <= 2) as potentially incomplete
        note = ''
        if d['total'] <= 2:
            note = 'Low count (<=2 ULBs)'
            low_coverage_districts.append(dist)

        lines.append(
            f"{dist:<20} | {d['total']:<5} | {nn:<7} | {npp:<8} | {np:<7} | {d['verified_email']:<5} | {d['with_coords']:<6} | {note}"
        )

    lines.append("=" * 105)
    lines.append(
        f"{'UP STATE TOTAL':<20} | {total_munis:<5} | {type_totals.get('Nagar Nigam', 0):<7} | {type_totals.get('Nagar Palika Parishad', 0):<8} | {type_totals.get('Nagar Panchayat', 0):<7} | {total_email:<5} | {total_coords:<6} |"
    )
    lines.append("=" * 105)

    expected_totals = expected_data.get('expected_totals', {})
    if expected_totals:
        lines.append("\nStatewide Gap Analysis:")
        exp_tot = expected_totals.get('total', 763)
        exp_nn = expected_totals.get('nagar_nigam', 17)
        exp_npp = expected_totals.get('nagar_palika_parishad', 200)
        exp_np = expected_totals.get('nagar_panchayat', 546)

        lines.append(f"  - Total Municipalities:  {total_munis} present in ward CSV vs ~{exp_tot} expected (Gap: {exp_tot - total_munis} missing ULBs)")
        lines.append(f"  - Nagar Nigam:          {type_totals.get('Nagar Nigam', 0)} present vs {exp_nn} expected (Gap: {exp_nn - type_totals.get('Nagar Nigam', 0)})")
        lines.append(f"  - Nagar Palika Parishad: {type_totals.get('Nagar Palika Parishad', 0)} present vs ~{exp_npp} expected (Gap: {exp_npp - type_totals.get('Nagar Palika Parishad', 0)})")
        lines.append(f"  - Nagar Panchayat:       {type_totals.get('Nagar Panchayat', 0)} present vs ~{exp_np} expected (Gap: {exp_np - type_totals.get('Nagar Panchayat', 0)})")

    if low_coverage_districts:
        lines.append(f"\nDistricts with potentially low counts (<= 2 ULBs): {', '.join(low_coverage_districts)}")

    return "\n".join(lines)


def main() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    data_dir = repo_root / 'services' / 'agent' / 'data'
    report = generate_coverage_report(data_dir)
    print(report)


if __name__ == '__main__':
    main()
