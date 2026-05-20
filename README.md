# MindMap

A self-hosted thought-unloader. Ramble (voice or text), let Claude iron it into coherent prose, actionable tasks, open questions, and topic tags that connect into a navigable graph.

Single-user, runs on your home PC, reached over Tailscale.

## Status

**Weekend 1 — backbone.** Entries CRUD + text capture + timeline + dark mode. No Claude calls or voice transcription yet.

## Stack

| Layer | Choice |
|---|---|
| Backend | FastAPI (Python 3.12), SQLAlchemy 2.x, SQLite |
| Frontend | React + Vite + TypeScript, Tailwind, TanStack Query |
| LLM (Weekend 2) | Claude API (`claude-sonnet-4-6`) |
| Transcription (Weekend 3) | `faster-whisper`, `large-v3` on CUDA |
| Deploy | Docker Compose, accessed over Tailscale |

## Quickstart (local dev)

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1     # Windows PowerShell
# source .venv/bin/activate    # Linux/macOS
pip install -r requirements.txt
cp ../.env.example ../.env     # then edit
uvicorn app.main:app --reload --port 8000
```

API at http://localhost:8000, docs at http://localhost:8000/docs.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

App at http://localhost:5173. Vite proxies `/api` to the backend.

## Quickstart (Docker — what your home PC will run)

```bash
cp .env.example .env
# edit .env — set ANTHROPIC_API_KEY etc.
docker compose up -d --build
```

- Frontend: http://localhost:8080
- Backend: http://localhost:8000
- SQLite file lives in the `mindmap_data` named volume.

Expose to other devices on your tailnet by binding to your Tailscale IP, or front it with Caddy for HTTPS.

## Roadmap

- **Weekend 1** ✅ — entries CRUD, capture box, timeline, dark mode, Docker.
- **Weekend 2** — Claude "iron out" endpoint: prose, tasks, questions, tags, links. Edit-in-place. Search. Markdown export.
- **Weekend 3** — `faster-whisper` voice capture, mic UI, force-directed graph view, PWA manifest + offline shell.

See the full MVP spec in `docs/spec.md` (to be added).

## Project layout

```
backend/    FastAPI app (app/main.py is the entrypoint)
frontend/   React + Vite app
data/       SQLite database (gitignored, created on first run)
```
