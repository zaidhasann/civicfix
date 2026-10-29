# CivicFix

CivicFix is a civic issue reporting platform. Citizens can create a report with a
photo, location, and description, then review an AI-generated email before
approving it.

This repository is a monorepo with a Next.js frontend, an Express API, and a
separate FastAPI/LangGraph agent service.

## Repository layout

- `apps/web` - Next.js web application
- `apps/api` - Express API and MongoDB data layer
- `services/agent` - FastAPI AI agent pipeline

## Current workflow

The currently implemented report flow is:

1. Register, sign in, or use an anonymous access token.
2. Add a photo, location, and optional description.
3. Save the report as a draft.
4. Process the report and populate its classification, recipient, and email
   draft.
5. Review and edit the draft.
6. Approve it, reject it, or regenerate the draft.

The API also supports signed Cloudinary uploads and authenticated complaint
operations. The agent service exposes health, run, status, and resume endpoints
for its LangGraph workflow.

## Prerequisites

- Node.js 20 or newer
- npm
- Python 3.11 or newer
- MongoDB
- Cloudinary credentials for photo uploads
- An LLM API key for the agent service

## Getting started

Install the JavaScript dependencies from the repository root:

```bash
npm install
```

Create the API environment file and fill in the values for your local services:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

At minimum, configure `MONGODB_URI`, both JWT secrets, the Cloudinary
credentials, and `AGENT_SHARED_SECRET` in `apps/api/.env`.

Set up the agent service:

```powershell
cd services/agent
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Configure `AGENT_LLM_API_KEY` and `AGENT_RUN_SECRET` in
`services/agent/.env`, then start the services in separate terminals.

### Start the API

```bash
npm --workspace @civicfix/api run dev
```

The API runs at `http://localhost:4000`. Its health endpoint is
`GET http://localhost:4000/health`.

### Start the agent

```powershell
cd services/agent
.venv\Scripts\Activate.ps1
uvicorn civicfix_agent.main:app --app-dir src --reload --port 8000
```

The agent runs at `http://localhost:8000`. Its health endpoint is
`GET http://localhost:8000/health`.

### Start the web app

In another terminal, optionally set `NEXT_PUBLIC_API_URL` to the API URL, then
start the frontend:

```bash
npm --workspace @civicfix/web run dev
```

Open `http://localhost:3000`.

## Useful commands

Run checks for an individual workspace:

```bash
npm --workspace @civicfix/web run lint
npm --workspace @civicfix/web run typecheck
npm --workspace @civicfix/web run test

npm --workspace @civicfix/api run lint
npm --workspace @civicfix/api run typecheck
npm --workspace @civicfix/api run test
```

Run the agent tests from `services/agent`:

```powershell
pytest
```

## API surface

The API currently includes:

- `POST /auth/register`, `POST /auth/login`, `POST /auth/anonymous`, and
  `POST /auth/refresh`
- `POST /complaints`, `GET /complaints/mine`, `GET /complaints/:id`, and
  complaint draft,
  regeneration, approval, and rejection endpoints
- `POST /uploads/sign` for authenticated Cloudinary upload signatures
- `POST /internal/complaints/:id/ai-results` for authenticated agent results
- `GET /health`

The agent service currently includes:

- `GET /health`
- `POST /run`
- `GET /runs/:run_id`
- `POST /runs/:run_id/resume`

Agent endpoints other than health require the `X-Agent-Secret` header.

## What’s not built yet

The following parts are placeholders or are not wired end to end yet:

- **Email delivery:** approving a report currently changes its status to
  `sent` and stores the final draft; it does not send an email to a municipal
  department.
- **Web-to-agent orchestration:** the API and agent contracts exist, but the
  complete production flow that starts an agent run, persists its results, and
  updates the complaint automatically still needs to be connected.
- **Report history:** the dashboard shows the signed-in user but does not yet
  list their previous complaints or their status history.
- **Community map:** the map page is an empty state; map data, filtering, and
  visualization are not implemented.
- **Profile settings:** account profile management is not implemented.
- **Municipal follow-up:** the API can suggest an approval-ready follow-up
  reminder for complaints that remain unacknowledged for the configured
  interval; it does not auto-send reminders. Department responses,
  notifications beyond the reminder event, and escalation workflows still need
  to be implemented.
- **Production operations:** deployment configuration, migrations/seed data,
  rate limiting, background job infrastructure, and production monitoring still
  need to be added.

These limitations are intentional and should be treated as the current
implementation boundary rather than supported production behavior.
