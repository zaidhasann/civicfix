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
docker run --rm -p 8000:8000 civicfix-agent
```
