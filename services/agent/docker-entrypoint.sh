#!/bin/sh
set -eu

python -m ingest municipalities

if [ -f /app/data/legal_sources.json ]; then
  python -m ingest legal
else
  echo "No legal source manifest found; skipping legal ingestion."
fi

exec uvicorn civicfix_agent.main:app --host 0.0.0.0 --port "${PORT:-8000}"
