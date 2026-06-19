# Contributing to NeoCompanion

Thanks for your interest in NeoCompanion! This guide covers how to set up the project, make changes, and open pull requests.

## Prerequisites

- **Node.js** 22 or later
- **pnpm** 10.32 or later (project uses `pnpm@10.32.0`)
- **Rust** stable toolchain (for Tauri v2)
- Platform dependencies for Tauri v2:
  - **Windows**: WebView2 runtime (usually preinstalled on Windows 11)
  - **macOS**: Xcode Command Line Tools
  - **Linux**: `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, and related packages

See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for the full environment setup.

## Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd NeoCompanion

# Install dependencies
pnpm install

# Run the desktop app + sidecar in development mode
pnpm dev:tauri
```

## Branch and Commit Conventions

- Create feature branches from the current active branch (`feat/v3.3-knowledge-workspace` at the time of writing):
  ```bash
  git checkout -b docs/your-change-name
  ```
- Use [Conventional Commits](https://www.conventionalcommits.org/):
  - `feat:` new feature
  - `fix:` bug fix
  - `docs:` documentation only
  - `refactor:` code change that neither fixes a bug nor adds a feature
  - `test:` adding or updating tests
  - `chore:` tooling, dependencies, or maintenance
- Keep commits focused and atomic.

## Before Submitting a Pull Request

1. **Typecheck everything:**
   ```bash
   pnpm typecheck
   ```
2. **Run tests:**
   ```bash
   pnpm test
   ```
3. **Run the documentation verification script (if it exists):**
   ```bash
   ./scripts/verify-docs.sh
   ```
4. **Update relevant documentation:** if your change adds an environment variable, API endpoint, or feature flag, update:
   - `.env.example`
   - `docs/DEVELOPMENT.md`
   - `docs/API.md`
   - `CHANGELOG.md`

## Code Style

- TypeScript: prefer explicit types on public APIs, immutable updates, and early returns.
- Vue 3: use the Composition API and `<script setup>`.
- Rust: follow the existing `src-tauri` style.
- Keep functions focused and files under 800 lines when possible.

## Documentation-First Changes

When changing docs:

- Do not claim unimplemented features are shipped. If a feature is planned, mark it as `(Planned)` or `(Partial)`.
- Use the product terminology from [`docs/GLOSSARY.md`](docs/GLOSSARY.md).
- Avoid Windows-absolute `file:///` links; use relative paths.
- Keep `ARCHITECTURE.md`, `PRD_overview.md`, and `README.md` in sync.

## Getting Help

- Open an issue for bugs or feature requests.
- Discuss larger changes in an issue before opening a PR.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
