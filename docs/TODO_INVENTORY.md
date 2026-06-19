# Known Doc-to-Code TODO Inventory

This document tracks TODO comments in the codebase that represent a mismatch between the documented/intended feature set and the current implementation. It is updated manually during documentation maintenance passes.

## UI Components

### `apps/desktop/src/components/panel/cards/WeeklyFocusCard.vue`

- **Line**: ~42
- **TODO**: `<!-- TODO: 接入真实数据 -->`
- **Impact**: The weekly focus summary card displays hardcoded bar data and a hardcoded total ("12h 40min"). It does not reflect actual focus sessions stored in SQLite.
- **Planned phase**: v1.x polish or v2.

### `apps/desktop/src/components/panel/cards/DiaryCard.vue`

- **Line**: ~3
- **TODO**: `// TODO: 接入真实数据`
- **Impact**: The diary card shows static placeholder diary content instead of generating or loading a real daily summary from focus/task data.
- **Planned phase**: v1.x polish or v2.

### `apps/desktop/src/components/panel/TopNav.vue`

- **Lines**: ~5, ~12
- **TODOs**:
  - `// TODO: Phase 2 -- use for dynamic avatar state`
  - `// TODO: Phase 2 -- global search feature`
- **Impact**: The top navigation accepts a `petState` prop and declares a search emit, but neither dynamic avatar state nor global search is implemented.
- **Planned phase**: v2.

## Settings

### `apps/desktop/src/components/settings/sections/ModelSection.vue`

- **Line**: ~53
- **TODO**: `// TODO: Phase 2 -- 在 Rust 侧校验 URL scheme 为 https 且禁止 loopback/私有地址，防止 SSRF`
- **Impact**: Custom API endpoint URLs entered in the model settings are not validated on the Rust side for SSRF prevention.
- **Planned phase**: v2.

## Knowledge Workspace

- **File**: `apps/desktop/src/composables/useKnowledgeMock.ts`
- **Impact**: The entire knowledge workspace (projects, notes, kanban, tasks) is currently front-end mock data. Real backend endpoints, SQLite storage, FTS5 full-text search, and `sqlite-vec` vector retrieval are planned for v2.
- **See also**: `docs/ARCHITECTURE.md` §1.2 Document Scope.

## How to Update This List

1. Run `./scripts/verify-docs.sh` before opening a documentation PR.
2. When a TODO is resolved, remove its entry from this file and update `CHANGELOG.md`.
3. When a new doc-to-code mismatch TODO is introduced, add it here with file path, line number, and impact.
