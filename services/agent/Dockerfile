FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src \
    AGENT_CHECKPOINT_DB=/data/runs.sqlite \
    AGENT_VECTOR_STORE_PATH=/data/chroma

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src
COPY prompts ./prompts
COPY data ./data
COPY ingest ./ingest
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN addgroup --system civicfix && adduser --system --ingroup civicfix civicfix \
    && mkdir -p /data \
    && chown -R civicfix:civicfix /app /data

USER civicfix
VOLUME ["/data"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]

ENTRYPOINT ["./docker-entrypoint.sh"]