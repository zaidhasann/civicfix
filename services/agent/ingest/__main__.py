from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description='Ingest CivicFix documents into a vector store.')
    parser.add_argument('source', choices=['municipalities', 'legal'])
    parser.add_argument(
        '--path',
        type=Path,
        default=Path('/app/data/municipalities.json'),
        help='Path to a municipality directory JSON file',
    )
    parser.add_argument(
        '--manifest',
        type=Path,
        default=Path('/app/data/legal_sources.json'),
        help='Path to the legal source manifest JSON file',
    )
    parser.add_argument(
        '--source-dir',
        type=Path,
        help='Directory containing files listed in the legal source manifest',
    )
    args = parser.parse_args()

    src_path = Path(__file__).resolve().parents[1] / 'src'
    if str(src_path) not in sys.path:
        sys.path.insert(0, str(src_path))

    from civicfix_agent.ingestion import ingest_legal_sources, ingest_municipalities
    from civicfix_agent.vector_store import create_vector_store

    if args.source == 'legal':
        count = ingest_legal_sources(create_vector_store(), args.manifest, args.source_dir)
    else:
        count = ingest_municipalities(create_vector_store(), args.path)
    print(f'Ingested {count} {args.source} chunk(s).')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
