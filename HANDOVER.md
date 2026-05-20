# Handover — for the Claude Code agent on the home PC

You are picking up MindMap mid-build. The laptop agent (me) scaffolded it; you are deploying it and continuing the work.

## Who you're working with

Adam is a solo dev. Windows 11 + PyCharm + PowerShell. Home PC has an RTX 4070 Super 12GB (CUDA-capable). He self-hosts personal apps via Docker Compose, exposed over Tailscale — no multi-user auth, Tailscale ACLs are the gate. Pattern: he writes on laptop, deploys on home PC.

He prefers decisive recommendations over option menus. When he says "pick one," actually pick. Surface implications, don't litigate every fork.

## What MindMap is

Self-hosted thought-unloader. Adam rambles (voice or text), Claude irons it into coherent prose + actionable tasks + open questions + topic tags that link entries into a navigable graph. Single-user, runs on this PC, reached over Tailscale. UI vibe = Reflect/Mem-style calm + Obsidian-style backlink depth.

Repo: https://github.com/adbermie/MindMap.git
Initial scaffold commit: `e0f342a`

## What's already built (Weekend 1)

- **Backend** (`backend/`): FastAPI + SQLAlchemy 2.x + SQLite. Full schema defined (entries, tags, entry_tags, entry_links, tasks, questions) but only entries CRUD wired. Health endpoint at `/api/health`.
- **Frontend** (`frontend/`): React + Vite + TS + Tailwind + TanStack Query. Calm single-column layout. Autofocused capture box (Cmd/Ctrl+Enter saves), recent timeline, light/dark/system theme toggle. Voice button stubbed for Weekend 3.
- **Deploy**: `docker-compose.yml` with named volume for SQLite, nginx frontend proxying `/api/` to backend container.

See `README.md` for the project tree and stack table.

## Your immediate task: deploy and verify

1. `git pull` (you should already be at HEAD).
2. `Copy-Item .env.example .env`, then **edit `.env` and paste Adam's rotated `ANTHROPIC_API_KEY`**. The original key Adam shared was leaked to chat logs — he should have rotated it. If `ANTHROPIC_API_KEY=sk-ant-replace-me` is still in `.env`, ask him for the new key before deploying. **Never echo, log, or commit the key.**
3. `docker compose up -d --build`. First build will take a few minutes (npm install + pip install).
4. Verify:
   - `curl http://localhost:8000/api/health` → `{"status":"ok"}`
   - Browse `http://localhost:8080` → capture box visible, theme toggle works.
   - Save a test entry, refresh, confirm it persists.
   - Restart compose, confirm entry still there (SQLite volume working).
5. Confirm Tailscale access from another device: `http://<tailscale-ip>:8080`.
6. Report any deploy issues to Adam concisely. If everything's green, say so and ask whether to start Weekend 2.

## Weekend 2 scope (next, when Adam greenlights)

Add the Claude "iron out" capability. Decisions already made:

- **Model**: `claude-sonnet-4-6`. Enable prompt caching on the system prompt + recent-entries context block.
- **Single call returns JSON** via Anthropic tool-use (structured output): `{ prose, tags[], tasks[{title, priority_hint, due_hint}], questions[], links[{entry_id, reason}] }`.
- **Context to Claude**: the entry's raw_text + the last N (~30) existing entries' `(id, ironed_prose or raw_text-truncated, tags)` so it can infer `links` to past entries.
- **Endpoints to add**:
  - `POST /api/entries/{id}/process` — run Claude, persist tags/tasks/questions/links, set entry.status='processed', ironed_prose=..., processed_at=now.
  - `POST /api/entries/{id}/reprocess` — same, with optional `instruction` field.
  - `PATCH /api/entries/{id}` already exists; extend if needed for tag edits.
  - `GET /api/tags`, `GET /api/tasks?status&tag`, `PATCH /api/tasks/{id}`.
  - `GET /api/search?q` — SQLite FTS5 over `raw_text + ironed_prose + tag names`.
  - `GET /api/export/{id}.md` — markdown blob.
- **Frontend**:
  - "Iron out" button on raw entries → calls process endpoint, swaps card to processed view inline.
  - Processed view shows: prose, tags as chips, task list, questions list, links to other entries as inline chips.
  - Edit-in-place on prose + tag chips.
  - Tasks tab (filter by status/tag, mark done).
  - Search bar.
  - Markdown export button on entry menu.

## Weekend 3 scope (after Weekend 2 ships)

- `faster-whisper` `large-v3` on CUDA. New `POST /api/transcribe` (multipart audio). Add `faster-whisper`, `torch`, and CUDA-enabled base image to the backend Dockerfile. Mic UI on capture box (push-to-talk + push-to-stop).
- Force-directed graph view using `react-force-graph-2d`. `GET /api/graph` returns nodes (entries with tags) + edges (`entry_links` rows). Read-only; click node opens entry drawer.
- PWA: `vite-plugin-pwa` manifest + offline shell. Test "install" on Adam's phone via Tailscale.

## Explicitly deferred past MVP (don't build these)

Multi-user auth, semantic/embedding search (full-text only for now), mobile-native polish (PWA is the mobile story), editable canvas / manual graph edges, audio playback of recordings, external task sync to Todoist/Google Tasks, chat-with-this-thought mode, weekly digests.

The data model is intentionally designed so embeddings (pgvector) and external task export can be added later without a rewrite — keep that property when extending it.

## Conventions

- **Secrets**: only ever in `.env` at the repo root. `.env` is gitignored. Never put the API key in code, logs, commits, or chat.
- **Branch**: `main`. Adam works alone — small commits straight to `main` are fine. Push regularly so the laptop can pull.
- **Commits**: descriptive subject + bullet body. Co-author Claude. The existing commit `e0f342a` is the style template.
- **Comments**: minimal. Only when the why is non-obvious. Don't write multi-paragraph docstrings.
- **Tests**: Adam hasn't asked for them yet. Add a small pytest suite if it'll save real time, but don't gold-plate.

## If you get stuck

Ask Adam directly. Don't guess at his preferences on architecture forks — recommend with a one-line rationale and let him redirect.
