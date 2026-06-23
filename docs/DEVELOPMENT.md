# 开发环境搭建

本文档介绍如何在本地构建并运行 NeoCompanion。

## 环境要求

| 工具 | 版本 | 说明 |
|------|------|------|
| Node.js | 24.x | 必需；数据库使用内置 `node:sqlite` |
| pnpm | 10.32+ | 由 `packageManager` 字段强制锁定 |
| Rust | stable | 用于 Tauri v2 后端 |
| Git | 任意 | |

### Tauri 平台依赖

- **Windows**：需要 WebView2 运行时。Windows 11 和较新 Windows 10 通常已预装。如缺失，请从 [Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) 安装。
- **macOS**：安装 Xcode Command Line Tools：
  ```bash
  xcode-select --install
  ```
- **Linux（Debian/Ubuntu）**：
  ```bash
  sudo apt-get update
  sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

其它 Linux 发行版请参考 [Tauri 前置条件](https://v2.tauri.app/start/prerequisites/)。

## 初始设置

```bash
# 1. 克隆仓库
git clone <仓库地址>
cd NeoCompanion

# 2. 安装依赖
pnpm install

# 3. 复制环境变量模板
cp .env.example .env
# 然后编辑 .env 填入你的 key（见下方环境变量说明）
```

## 环境变量

项目开发时从根目录 `.env` 文件读取配置。模板见 `.env.example`。

| 变量 | 是否必填 | 默认值 | 说明 |
|------|----------|--------|------|
| `DEEPSEEK_API_KEY` | 是* | — | DeepSeek 聊天 API key。AI 对话功能需要。 |
| `DEEPSEEK_MODEL` | 否 | `deepseek-v4-flash` | DeepSeek 模型名称。 |
| `MIMO_API_KEY` | 是* | — | MiMo TTS API key。语音反馈功能需要。 |
| `MIMO_TTS_VOICE` | 否 | `茉莉` | 默认 MiMo TTS 音色。 |
| `NEO_CITY` | 否 | `Beijing` | 天气服务使用的城市。 |
| `NEO_SERVER_PORT` | 否 | `10103` | Fastify sidecar 监听端口。 |

*AI / TTS 相关的 key 至少需要一个才能使用该功能；不填也能启动应用，但对应端点会失败。

详见 [`docs/TTS_SETUP.md`](TTS_SETUP.md) 中的 MiMo TTS 详细配置。

## 开发运行

### 桌面应用 + sidecar（推荐）

```bash
pnpm dev:tauri
```

这会同时启动两个进程：

1. `@neo-companion/server-local` — Fastify sidecar，默认 `http://127.0.0.1:10103`
2. `@neo-companion/desktop` — Tauri 桌面应用，支持热更新

### 纯 Web 前端 + sidecar

适合只做前端 UI 迭代、不需要 Rust 构建的场景：

```bash
pnpm dev
```

这只会启动 sidecar 和 Vue dev server。Tauri 专属功能（壁纸嵌入、原生窗口 API）不可用。

## 常用命令

```bash
# 全仓库类型检查
pnpm typecheck

# 运行全部测试
pnpm test

# 构建全部包
pnpm build

# lint（目前为 typecheck 别名）
pnpm lint
```

## 项目结构

```
NeoCompanion/
├── apps/desktop/src-tauri/   # Rust / Tauri 后端
├── apps/desktop/src/         # Vue 3 前端
├── packages/server-local/    # Fastify sidecar
├── packages/db/              # SQLite + node:sqlite
├── packages/shared/          # 共享 TypeScript 类型
├── packages/ai/              # DeepSeek 聊天适配器
├── packages/tts/             # MiMo TTS 适配器
└── docs/                     # 项目文档
```

## 运行测试

详见 [`docs/TESTING.md`](TESTING.md)。

## 常见问题

### 启动时报 `node:sqlite` 不可用

项目要求 Node.js 24+。请先运行 `node --version`；旧版 Node 无法加载内置 SQLite 驱动。`sqlite-vec` 仍按平台安装可加载扩展，若向量检索不可用，请重新执行 `pnpm install` 并确认对应平台包未被包管理器裁剪。

### Linux 上 Tauri 构建失败

请确认已安装全部 Tauri Linux 依赖（见上文）。常见缺失项是 `libayatana-appindicator3-dev`。

### sidecar 端口被占用

在 `.env` 中修改 `NEO_SERVER_PORT` 为其它端口即可。

### AI 聊天或 TTS 报错

检查 `.env` 中 `DEEPSEEK_API_KEY` 和 `MIMO_API_KEY` 是否已设置，以及对应服务端点是否可访问。

## 下一步

- 阅读[系统架构设计](ARCHITECTURE.md)
- 查看 [Sidecar API 参考](API.md)
- 查看[测试说明](TESTING.md)
