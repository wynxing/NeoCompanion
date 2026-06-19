# GitHub Actions CI/CD Implementation Plan

> **Status: IMPLEMENTED** — The workflows described in this document have been deployed to `.github/workflows/` and verified. This document is kept as a historical implementation record.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Configure GitHub Actions for NeoCompanion — PR quality gate, Tauri cross-platform build verification, and tag-triggered release publishing.

**Architecture:** Three separate workflow files: `ci-check.yml` (fast typecheck+test on PR), `ci-build.yml` (full Tauri build on PR, 3-platform matrix), `release.yml` (tag-triggered build+publish to GitHub Release). Each workflow is independent and can fail/pass separately.

**Tech Stack:** GitHub Actions, pnpm 10, Node 22, Rust stable, Tauri v2, `tauri-apps/tauri-action`, `Swatinem/rust-cache`

**Spec:** `docs/superpowers/specs/2026-06-13-github-actions-design.md`

---

## File Structure

```
.github/
└── workflows/
    ├── ci-check.yml      # PR → typecheck + test (~2-3min)
    ├── ci-build.yml      # PR → Tauri build 3 platforms (~10-15min)
    └── release.yml       # Tag v* → build + publish GitHub Release
```

No existing files are modified except `tauri.conf.json` (bundle config). All three workflow files are new.

---

### Task 1: Create ci-check.yml — PR Quality Gate

**Files:**
- Create: `.github/workflows/ci-check.yml`

- [x] **Step 1: Write ci-check.yml**

```yaml
name: CI Check

on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - run: pnpm typecheck

      - run: pnpm test
```

- [x] **Step 2: Commit**

```bash
git add .github/workflows/ci-check.yml
git commit -m "ci: add PR quality gate workflow (typecheck + test)"
```

---

### Task 2: Create ci-build.yml — PR Build Verification

**Files:**
- Create: `.github/workflows/ci-build.yml`

- [x] **Step 1: Write ci-build.yml**

```yaml
name: CI Build

on:
  pull_request:
    branches: [main]

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: windows-latest
            args: ""
          - platform: macos-latest
            args: "--target universal-apple-darwin"
          - platform: ubuntu-latest
            args: ""

    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies (Ubuntu only)
        if: matrix.platform == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable

      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: "apps/desktop/src-tauri -> target"

      - run: pnpm install --frozen-lockfile

      - name: Build frontend
        run: pnpm --filter @neo-companion/desktop build

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        with:
          tauriScript: pnpm --filter @neo-companion/desktop exec tauri
          args: ${{ matrix.args }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: NeoCompanion-${{ matrix.platform }}
          path: |
            apps/desktop/src-tauri/target/release/bundle/
          retention-days: 7
```

- [x] **Step 2: Commit**

```bash
git add .github/workflows/ci-build.yml
git commit -m "ci: add PR build verification workflow (Tauri, 3 platforms)"
```

---

### Task 3: Create release.yml — Tag-triggered Release

**Files:**
- Create: `.github/workflows/release.yml`

- [x] **Step 1: Write release.yml**

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  release:
    permissions:
      contents: write

    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: windows-latest
            args: ""
          - platform: macos-latest
            args: "--target universal-apple-darwin"
          - platform: ubuntu-latest
            args: ""

    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies (Ubuntu only)
        if: matrix.platform == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable

      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: "apps/desktop/src-tauri -> target"

      - run: pnpm install --frozen-lockfile

      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: ${{ github.ref_name }}
          releaseBody: "See the assets to download this version and install."
          releaseDraft: false
          prerelease: false
          tauriScript: pnpm --filter @neo-companion/desktop exec tauri
          args: ${{ matrix.args }}
```

- [x] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add tag-triggered release workflow (Tauri, 3 platforms)"
```

---

### Task 4: Update tauri.conf.json bundle config

**Files:**
- Modify: `apps/desktop/src-tauri/tauri.conf.json` (lines 51-54)

The current `bundle.active` is `false` and `bundle.icon` is `[]`. Tauri's `tauri-action` requires bundling to be enabled and icons present for build to succeed.

- [x] **Step 1: Update tauri.conf.json bundle section**

Change the `bundle` section from:
```json
"bundle": {
  "active": false,
  "targets": "all",
  "icon": []
}
```

To:
```json
"bundle": {
  "active": true,
  "targets": "all",
  "icon": [
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.icns",
    "icons/icon.ico"
  ]
}
```

- [x] **Step 2: Verify icon files exist**

Run: `ls apps/desktop/src-tauri/icons/`

If the icons directory is missing or empty, generate default icons:
```bash
cd apps/desktop
pnpm exec tauri icon
```

This takes a source image and generates all required sizes. If no source image is available, create a placeholder 1024x1024 PNG first, then run the command.

- [x] **Step 3: Commit**

```bash
git add apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/icons/
git commit -m "feat: enable Tauri bundling and add app icons"
```

---

### Task 5: Verify and push

- [x] **Step 1: Verify all workflow files are valid YAML**

Visually inspect each file for indentation and syntax. Key things to check:
- `on:` triggers are correct (PR → main, tag v*)
- Matrix platforms are spelled correctly (`windows-latest`, `macos-latest`, `ubuntu-latest`)
- All action versions are pinned (`@v4`, `@v2`, `@v0`)
- `GITHUB_TOKEN` is referenced correctly in release.yml

- [x] **Step 2: Push all commits**

```bash
git push origin main
```

- [x] **Step 3: Verify in GitHub**

Open the repository on GitHub → Actions tab. Confirm all three workflows appear in the sidebar. They will not run until a PR is opened or a tag is pushed.

- [x] **Step 4: Create a test PR to verify ci-check and ci-build**

Create a branch, make a trivial change (e.g. add a comment to README), open a PR against main. Both `CI Check` and `CI Build` workflows should trigger. Verify:
- `ci-check` passes typecheck + test
- `ci-build` passes on at least one platform (Ubuntu is fastest)

- [x] **Step 5: (Optional) Test release with a pre-release tag**

```bash
git tag v0.0.1-test
git push origin v0.0.1-test
```

Verify the `Release` workflow triggers and creates a GitHub Release with assets. If it works, delete the test release and tag:
```bash
git push origin --delete v0.0.1-test
# Delete the release via GitHub UI or: gh release delete v0.0.1-test
```
