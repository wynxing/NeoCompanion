# GitHub Actions CI/CD 设计

> 2026-06-13 | NeoCompanion

## 背景

NeoCompanion 仓库当前没有任何 CI/CD 配置（`.github/` 目录不存在）。需要配置 GitHub Actions 覆盖质量门、构建验证、自动发布和代码质量检查。

## 需求

| 场景 | 触发条件 | 做什么 |
|------|----------|--------|
| 质量门 | PR → main | typecheck + test |
| 构建验证 | PR → main | 完整 Tauri 构建（含 Rust），Windows/macOS/Linux 三平台 |
| 自动发布 | 推送 tag `v*` | 构建三平台安装包 → GitHub Release |
| 代码质量 | 同质量门 | typecheck（不加 ESLint/Prettier，维持现状） |

## 方案：分层三工作流

### 1. ci-check.yml — 快速质量门

**触发**：PR → main

**运行环境**：ubuntu-latest

**Job**：`check`

| 步骤 | 做什么 |
|------|--------|
| Checkout | `actions/checkout@v4` |
| Setup pnpm + Node | pnpm@10 + Node 22，启用 pnpm store 缓存 |
| Install | `pnpm install --frozen-lockfile` |
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` |

**预期耗时**：~2-3 分钟

**设计要点**：
- 只需一个 runner，typecheck 和 test 不依赖平台
- `--frozen-lockfile` 防止依赖被悄悄更新
- 作为分支保护必须通过的 status check

### 2. ci-build.yml — 完整 Tauri 构建验证

**触发**：PR → main

**运行环境**：三平台矩阵

| 平台 | Runner | 构建产物 |
|------|--------|----------|
| Windows | windows-latest | `.msi` / `.exe` |
| macOS | macos-latest | `.dmg` |
| Linux | ubuntu-latest | `.AppImage` / `.deb` |

**Job**：`build`（三平台并行）

| 步骤 | 做什么 |
|------|--------|
| Checkout | `actions/checkout@v4` |
| Setup pnpm + Node | pnpm@10 + Node 22，启用 pnpm store 缓存 |
| Setup Rust | rustup stable + `Swatinem/rust-cache@v2`（缓存 `~/.cargo` + `target/`） |
| Install system deps | Linux: `libwebkit2gtk-4.1-dev` 等 Tauri 依赖 |
| Install | `pnpm install --frozen-lockfile` |
| Build | `pnpm --filter @neo-companion/desktop build` + `tauri build` |
| Upload artifact | 构建产物上传为 artifact，保留 7 天 |

**设计要点**：
- Rust 编译缓存是关键——首次全量，后续增量快很多
- 纯验证构建通过，不发布
- artifact 保留 7 天，避免占用存储
- Linux 需额外装 webkit2gtk 系统依赖

**Linux 系统依赖列表**（Tauri v2 要求）：
```
libwebkit2gtk-4.1-dev
build-essential
curl
wget
file
libxdo-dev
libssl-dev
libayatana-appindicator3-dev
librsvg2-dev
```

### 3. release.yml — 自动发布

**触发**：推送 tag `v*`（如 `v0.1.0`）

**运行环境**：三平台矩阵

**Job**：`release`（三平台并行）

| 步骤 | 做什么 |
|------|--------|
| Checkout | `actions/checkout@v4` |
| Setup pnpm + Node | pnpm@10 + Node 22 |
| Setup Rust | rustup stable + `Swatinem/rust-cache@v2` |
| Install system deps | Linux 系统依赖 |
| Install | `pnpm install --frozen-lockfile` |
| Build + Upload | `tauri-apps/tauri-action@v0` 自动构建并上传到 GitHub Release |

**设计要点**：
- 使用 `tauri-apps/tauri-action`，官方 action，自动识别三平台产物并上传
- tag 名作为 Release 版本号和标题
- Release body 从 git log 自动生成变更日志

**代码签名**：现阶段不配置签名。

| 平台 | 现状 | 后续 |
|------|------|------|
| Windows | 未签名 `.msi`，SmartScreen 警告 | 加 Windows 代码签名证书 |
| macOS | 未签名 `.dmg`，需右键打开 | 加 Apple Developer 证书（`CSC_LINK` / `CSC_KEY_PASSWORD`） |
| Linux | `.AppImage` / `.deb` 无需签名 | N/A |

## 整体流程

```
PR → main
├── ci-check.yml   → typecheck + test      (~3min)
└── ci-build.yml   → 三平台 Tauri 构建      (~10-15min)

Push tag v*
└── release.yml    → 三平台构建 + 发布 Release
```

## 分支保护规则

需在 GitHub 仓库 Settings → Branches 手动配置：

| 规则 | 说明 |
|------|------|
| Require PR | main 分支禁止直接 push |
| Require status checks | `check` job 必须通过 |
| Require conversation resolve | 所有 review 评论必须解决 |

## 依赖缓存策略

| 缓存项 | 方式 | 预期效果 |
|--------|------|----------|
| pnpm store | `actions/setup-node` 内置缓存 | install ~30s → ~5s |
| Rust cargo + target | `Swatinem/rust-cache@v2`，按 Cargo.lock hash | 首次全量，后续增量 ~2-3min |

## 文件清单

```
.github/
├── workflows/
│   ├── ci-check.yml      # PR 质量门
│   ├── ci-build.yml      # PR 构建验证
│   └── release.yml       # Tag 自动发布
```
