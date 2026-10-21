from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description='Ingest CivicFix documents into a vector store.')
    parser.add_argument('source', choices=['municipalities'])
    parser.add_argument('--path', type=Path, help='Path to a municipality directory JSON file')
    args = parser.parse_args()

    src_path = Path(__file__).resolve().parents[1] / 'src'
    if str(src_path) not in sys.path:
        sys.path.insert(0, str(src_path))

    from civicfix_agent.ingestion import ingest_municipalities
    from civicfix_agent.vector_store import create_vector_store

    count = ingest_municipalities(create_vector_store(), args.path)
    print(f'Ingested {count} {args.source} chunk(s).')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
