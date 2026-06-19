# Development Setup

This guide walks you through building and running NeoCompanion on your local machine.

## Requirements

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 22.x | LTS recommended |
| pnpm | 10.32+ | Enforced via `packageManager` field |
| Rust | stable | For Tauri v2 backend |
| Git | any | |

### Platform-Specific Tauri Dependencies

- **Windows**: WebView2 runtime is required. It is included with Windows 11 and recent Windows 10 updates. If missing, install it from [Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).
- **macOS**: Install Xcode Command Line Tools:
  ```bash
  xcode-select --install
  ```
- **Linux (Debian/Ubuntu)**:
  ```bash
  sudo apt-get update
  sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

For other Linux distributions, see the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/).

## Initial Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd NeoCompanion

# 2. Install dependencies
pnpm install

# 3. Copy environment variables
cp .env.example .env
# Then edit .env with your keys (see Environment Variables below).
```

## Environment Variables

The project reads configuration from a root `.env` file during development. See `.env.example` for the template.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEEPSEEK_API_KEY` | Yes* | — | API key for DeepSeek chat. Required for AI chat to work. |
| `DEEPSEEK_MODEL` | No | `deepseek-v4-flash` | DeepSeek model name. |
| `MIMO_API_KEY` | Yes* | — | API key for MiMo TTS. Required for spoken feedback. |
| `MIMO_TTS_VOICE` | No | `茉莉` | Default MiMo TTS voice. |
| `NEO_CITY` | No | `Beijing` | City used by the weather service. |
| `NEO_SERVER_PORT` | No | `10103` | Port the Fastify sidecar listens on. |

*At least one of the AI/AI-adjacent keys is needed to exercise that feature; the app will start without them, but related endpoints will fail.

See [`docs/TTS_SETUP.md`](TTS_SETUP.md) for detailed MiMo TTS configuration.

## Running in Development

### Desktop app + sidecar (recommended)

```bash
pnpm dev:tauri
```

This starts two processes:

1. `@neo-companion/server-local` — the Fastify sidecar on `http://127.0.0.1:10103`.
2. `@neo-companion/desktop` — the Tauri desktop app with hot reload.

### Web-only frontend + sidecar

Use this for faster frontend iteration without the Rust build:

```bash
pnpm dev
```

This runs the sidecar plus the Vue dev server. The Tauri-specific features (wallpaper embedding, native window APIs) will not be available.

## Common Commands

```bash
# Typecheck all packages
pnpm typecheck

# Run all tests
pnpm test

# Build all packages
pnpm build

# Lint (currently an alias for typecheck)
pnpm lint
```

## Project Structure

```
NeoCompanion/
├── apps/desktop/src-tauri/   # Rust / Tauri backend
├── apps/desktop/src/         # Vue 3 frontend
├── packages/server-local/    # Fastify sidecar
├── packages/db/              # SQLite + Drizzle ORM
├── packages/shared/          # Shared TypeScript types
├── packages/ai/              # DeepSeek chat adapter
├── packages/tts/             # MiMo TTS adapter
└── docs/                     # Project documentation
```

## Running Tests

See [`docs/TESTING.md`](TESTING.md) for the testing strategy and how to write new tests.

## Troubleshooting

### `pnpm install` fails on `better-sqlite3`

`better-sqlite3` is a native module. Make sure you have a compatible Node.js version and Python available for `node-gyp`. On Windows, use the "Desktop development with C++" workload from Visual Studio Build Tools.

### Tauri build fails on Linux

Double-check that all Tauri Linux dependencies are installed (see prerequisites above). Missing `libayatana-appindicator3-dev` is a common cause.

### Sidecar port already in use

Change `NEO_SERVER_PORT` in `.env` to a different port.

### AI chat or TTS returns errors

Verify that `DEEPSEEK_API_KEY` and `MIMO_API_KEY` are set in `.env` and that the service endpoints are reachable.

## Next Steps

- Read the [system architecture](ARCHITECTURE.md).
- Explore the [Sidecar API reference](API.md).
- Check the [testing guide](TESTING.md).
