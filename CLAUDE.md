# NeoCompanion — Claude Code Project Context

## Project Overview

NeoCompanion is a local-first desktop AI assistant built with **Tauri v2** (Rust) + **Vue 3** (Vite) + **Fastify** (TypeScript sidecar) + **SQLite** (`node:sqlite`).

It provides:

- A floating companion widget (`?view=pet`)
- A panel window for tasks, AI chat, and settings (`?view=panel`)
- A wallpaper status layer (`?view=wallpaper`) embedded via `tauri-plugin-wallpaper` (Windows)
- A knowledge workspace (`?view=knowledge`) introduced in v3.3
- A local Hook API for external scripts to push notifications and permission requests

## Architecture at a Glance

```
Tauri Rust Core
  ├─ window management, tray, wallpaper embedding, system credentials
  └─ hosts Fastify sidecar (localhost:10103 by default)

Fastify Sidecar
  ├─ REST API for tasks, focus timer, AI chat, TTS, weather, hooks, windows
  ├─ WebSocket hub at /ws for streaming AI replies and companion feedback
  └─ SQLite via the built-in Node.js `node:sqlite` driver

Vue 3 Frontend
  ├─ 5 views selected by ?view= query param
  └─ communicates with sidecar via HTTP + WebSocket, with Rust via Tauri IPC
```

## Key Directories

| Path | Purpose |
|------|---------|
| `apps/desktop/src-tauri/` | Rust backend, Tauri commands, window config |
| `apps/desktop/src/` | Vue 3 frontend, views, components, composables |
| `packages/server-local/` | Fastify sidecar with all business logic |
| `packages/db/` | SQLite schema, migrations, and stores via `node:sqlite` |
| `packages/shared/` | Shared TypeScript types |
| `packages/ai/` | DeepSeek streaming chat adapter |
| `packages/tts/` | MiMo TTS adapter |
| `docs/` | Product and technical documentation |

## Current State Notes

- The **knowledge workspace** is backed by SQLite CRUD, transactional FTS5 indexing, optional `sqlite-vec` hybrid retrieval, file mirror import/export, and cited AI Ask/Chat flows. `useKnowledgeMock.ts` remains only as a preview fallback when the authenticated sidecar is unavailable.
- Every Sidecar REST and WebSocket request requires the shared `APP_AUTH_TOKEN`; use the root `pnpm dev` / `pnpm dev:tauri` launchers so development processes receive the same ephemeral token.
- The codebase still uses `pet`/`companion` identifiers in many places (`components/pet/`, `usePetState.ts`, `pet.css`). The product-facing terminology is **assistant**, but a full code-level rename is out of scope for documentation-only work.
- The sidecar runs on `http://127.0.0.1:10103` by default (configurable via `NEO_SERVER_PORT`).
- **Database location**: SQLite lives in the OS-standard application data directory, not in the project tree:
  - Windows: `%APPDATA%\NeoCompanion\neo-companion.sqlite`
  - macOS: `~/Library/Application Support/NeoCompanion/neo-companion.sqlite`
  - Linux: `${XDG_DATA_HOME:-~/.local/share}/NeoCompanion/neo-companion.sqlite`
  Override the path with `NEO_DB_PATH` (use `:memory:` for ephemeral runs). Tests pass `":memory:"` explicitly and are unaffected.

## Development Quick Reference

```bash
# Install dependencies
pnpm install

# Run desktop + sidecar in development
pnpm dev:tauri

# Typecheck all packages
pnpm typecheck

# Run tests
pnpm test
```

See `docs/DEVELOPMENT.md` for the full setup guide.

## Documentation Index

| Document | Purpose |
|----------|---------|
| `README.md` | Project overview and feature summary |
| `docs/PRD_overview.md` | Product requirements and roadmap |
| `docs/ARCHITECTURE.md` | System architecture and data flow |
| `docs/具体能力构思.md` | Detailed capability design (Chinese) |
| `docs/WALLPAPER_STATUS_LAYER.md` | Wallpaper layer design |
| `docs/SOUL_CONFIG.md` | Assistant persona configuration spec |
| `docs/DEVELOPMENT.md` | Development environment setup |
| `docs/API.md` | Sidecar REST API and WebSocket reference |
| `docs/TTS_SETUP.md` | MiMo TTS configuration guide |
| `docs/TESTING.md` | Testing strategy and commands |
| `docs/GLOSSARY.md` | Terminology conventions |
| `docs/TODO_INVENTORY.md` | Known doc-to-code mismatch TODOs |

## Coding Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. These bias toward caution over speed; use judgment for trivial tasks.

### 1. Think Before Coding

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.

### 2. Simplicity First

- Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No error handling for impossible scenarios.

### 3. Surgical Changes

- Touch only what you must. Clean up only your own mess.
- Don't "improve" adjacent code, comments, or formatting.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it unless asked.

### 4. Goal-Driven Execution

- Transform tasks into verifiable goals.
- For multi-step tasks, state a brief plan with verification steps.
- Strong success criteria let you loop independently.

---

*These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.*
