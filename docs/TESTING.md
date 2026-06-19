# Testing Guide

NeoCompanion uses [Vitest](https://vitest.dev/) for unit and integration tests. This guide explains how to run tests and how to write new ones.

## Running Tests

```bash
# Run all tests across all packages
pnpm test

# Run tests for a specific package
pnpm --filter @neo-companion/server-local test
pnpm --filter @neo-companion/ai test
pnpm --filter @neo-companion/db test
pnpm --filter @neo-companion/tts test

# Run desktop tests only
pnpm --filter @neo-companion/desktop test
```

## Test Locations

| Package | Test files | Notes |
|---------|-----------|-------|
| `packages/ai` | `src/ai.test.ts` | DeepSeek adapter tests |
| `packages/db` | `src/db.test.ts` | SQLite store tests |
| `packages/tts` | `src/tts.test.ts` | MiMo TTS adapter tests |
| `packages/server-local` | `src/tests/app.test.ts`, `src/tests/hook.test.ts` | Fastify integration tests |
| `apps/desktop` | `tests/markdown-roundtrip.test.ts` | Markdown editor round-trip corpus tests |

## Desktop Tests

The desktop app tests run in a `jsdom` environment configured by `apps/desktop/vitest.config.ts`.

### Markdown Round-Trip Tests

`apps/desktop/tests/markdown-roundtrip.test.ts` validates the custom ProseMirror-to-Markdown serializer in `src/components/markdown-editor/editor/markdownCodec.ts`.

- **Supported syntax fixtures** (`tests/fixtures/markdown-corpus/supported/`) must round-trip *semantically*: `parse → serialize → parse` produces the same document tree.
- **Preserved syntax fixtures** (`tests/fixtures/markdown-corpus/preserved/`) must round-trip *byte-for-byte*: the serializer must not alter the original Markdown.

To add a new fixture:

1. Create a `.md` file in the appropriate `supported/` or `preserved/` directory.
2. Run `pnpm --filter @neo-companion/desktop test`.
3. If the fixture represents a preserved construct, ensure `roundTripMarkdown(source).trim() === source.trim()`.

## Server-Local Integration Tests

The server-local tests use dependency injection to avoid hitting real external APIs or the filesystem.

Example pattern from `packages/server-local/src/tests/app.test.ts`:

```typescript
import { createDatabase } from "@neo-companion/db";
import { createApp } from "../app";

const app = await createApp({
  database: createDatabase(":memory:"),
  startBackground: false,
  aiStream: async function* () { yield "mock reply"; },
  ttsSpeak: async () => ({ audioUrl: "...", format: "mp3", provider: "mimo", cached: false }),
  weather: async () => ({ city: "Beijing", temperatureC: 20, precipitationChance: 0, text: "..." })
});
```

Key points:

- Pass `database: createDatabase(":memory:")` so tests do not touch the production database.
- Pass `startBackground: false` to disable the 30-second window polling timer.
- Mock `aiStream`, `ttsSpeak`, and `weather` to keep tests fast and deterministic.
- Use `app.inject({ method, url, payload })` for HTTP assertions.

## Writing a New Test

1. Place the test file next to the module it tests, or in the package's `tests/` directory.
2. Use `describe`/`it` from `vitest`.
3. Prefer Arrange-Act-Assert structure.
4. For tests that touch the database or sidecar, use the dependency-injection pattern shown above.
5. Run `pnpm test` before committing.

## Continuous Integration

The `ci-check.yml` workflow runs `pnpm typecheck` and `pnpm test` on every pull request to `main`.
