# CivicFix Agent

FastAPI service for the CivicFix AI agent pipeline.

## Development

```bash
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn civicfix_agent.main:app --app-dir src --reload
```

The health check is available at `GET http://localhost:8000/health`.

## Docker

```bash
docker build -t civicfix-agent .
docker run --rm -p 8000:8000 -v civicfix-agent-data:/data --env-file .env civicfix-agent
```

The container ingests municipalities before starting and ingests legal references when
`data/legal_sources.json` is present. `/data` stores the SQLite checkpoints and Chroma
database, so Render or Railway deployments must attach a persistent disk mounted at
`/data`. For a hosted vector store, set `AGENT_VECTOR_STORE=pinecone` and provide the
Pinecone environment variables instead.

From the repository root, Docker Compose provides the same persistent volume:

```bash
docker compose up --build agent
```
