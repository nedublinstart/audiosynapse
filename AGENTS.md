# AGENTS.md

## Cursor Cloud specific instructions

Synapse is a two-service app: a **FastAPI backend** (`backend/`) and a **Next.js 15 frontend** (`frontend/`). Standard run/build/lint commands live in `README.md`, `frontend/package.json`, and `backend/requirements.txt`; the notes below only capture non-obvious details.

### Services and how to run them (dev)

- **Backend** (port 8000): uses a Python venv at `backend/.venv` (created by the update script). Run from inside `backend/` with `PYTHONPATH=.` set, e.g. `. .venv/bin/activate && PYTHONPATH=. python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`. The `PYTHONPATH=.` is required — the app imports the `app` package by absolute path.
- **Frontend** (port 3000): `npm run dev` (from `frontend/`). Lint: `npm run lint`.
- Start the backend before (or alongside) the frontend so API calls resolve.

### Non-obvious gotchas

- **Same-origin API proxy:** the frontend calls `/api/*` and Next.js rewrites those to the backend (`API_PROXY_TARGET`, default `http://127.0.0.1:8000`) — see `frontend/next.config.ts`. `NEXT_PUBLIC_API_URL` defaults to empty (same-origin), so no `.env.local` is needed in this VM; only set it if the backend runs on a different host.
- **AI demo mode (no API key needed):** without `GEMINI_API_KEY`, all AI features (transcription, Cornell-notes generation, enrichment, lecture chat) run in a deterministic local demo mode. Uploading any allowed audio file produces stub-transcript-based notes. Set `GEMINI_API_KEY` in `backend/.env` only for real Gemini output. `GET /api/health` reports `gemini_configured`.
- **Local state is auto-created and gitignored:** SQLite DB at `backend/data/synapse.db` and uploads under `backend/uploads/` are created on startup / first upload. Delete `backend/data/synapse.db` to reset all accounts and data.
- **Audio processing is a background task:** `POST /api/lectures/{id}/audio` returns immediately with status `processing`; the lecture flips to `ready` a moment later. Poll `GET /api/lectures/{id}` to see generated notes.
