# NeoCompanion 系统架构文档

## Document Header

- **Title**: NeoCompanion System Architecture Document
- **Owner**: Engineering
- **Status**: Draft (Aligned with Concept / PRD v3.3)
- **Version**: 1.3
- **Last Updated**: 2026-06-18
- **Audience**: Engineering, Product
- **Related Docs**:
  - [`README.md`](../README.md)
  - [`docs/PRD_overview.md`](./PRD_overview.md)
  - [`docs/具体能力构思.md`](./具体能力构思.md)
  - [`docs/WALLPAPER_STATUS_LAYER.md`](./WALLPAPER_STATUS_LAYER.md)

---

## 1. Document Purpose

本文档定义 NeoCompanion 的系统架构、技术选型、模块划分、数据流和工程实现方案。

本文档基于总景 PRD 和能力构思文档中已确定的产品定义、能力模型和阶段规划，将产品需求转化为可落地的技术架构。

本文档覆盖 v1 到 v3 的完整技术蓝图，但以 v1 为最小可落地单元。

### 1.1 Document Relationship

- **PRD** 定义产品做什么、不做什么；
- **架构文档** 定义技术上如何做、如何组织；
- 架构文档不应反向扩大产品范围；
- 架构文档中的模块划分必须能追溯到 PRD 中的能力层或产品闭环。

### 1.2 Document Scope

本文档同时描述 **已实现** 与 **规划中** 的技术设计。已实现的内容指当前代码中真实存在并运行的模块；规划中的内容标注为 `(Planned)` 或 `(Partial)`，例如：

- **已实现**：Tauri 多窗口管理、Fastify Sidecar TCP 模式、`node:sqlite` 数据库层、任务/专注/天气/AI/TTS/窗口/Hook 等核心端点、WebSocket 实时推送、GitHub Actions CI/CD。知识工作空间 v2（Phase 0–4）：文件型存储方向、后端 SQLite CRUD + 混合文件镜像、FTS5 全文检索（trigram，支持 CJK）、`sqlite-vec` 向量检索 + RRF 融合、Embedding Adapter（OpenAI 兼容，落库持久化 + 环境变量双通道）、AI Chat/Ask 双模式 + 三级上下文权限 + 引用审计反幻觉 + 多轮会话持久化。
- **部分实现 (Partial)**：v1 `tasks(open|done)` 与 v2 `knowledge_tasks`（四态）的状态枚举统一尚未执行（延后决策，见 TODO_INVENTORY）。
- **规划中 (Planned)**：零端口 UDS Socket 模式 B、文件监听 Hook、MQTT 接入、屏幕上下文感知与本地长期记忆模块。

阅读时请注意段落中的状态标注，避免将规划内容误认为已交付功能。

---

## 2. Architecture Principles

### 2.1 本地优先

NeoCompanion 是一个本地优先的桌面应用。

- 数据存储在用户本地；
- 业务逻辑在本地执行；
- 不依赖自建云服务；
- AI 能力通过用户配置的外部 Chat / Embedding API 调用，但上下文组装、索引管理和结果处理在本地完成；
- 用户无需注册账户即可使用（v1）。

### 2.2 隐私可控

- 敏感信息默认在本地处理；
- 发送至 Chat / Embedding Provider 的内容范围必须在设置中明确说明，并允许用户关闭；
- 屏幕感知、窗口检测等能力基于用户授权；
- 用户可随时关闭任何感知能力；
- 无遥测、无后台上报。

### 2.3 渐进复杂度

- v1 仅落地最小闭环所需模块；
- 模块设计预留扩展点，但不提前实现；
- 复杂度随产品阶段和用户价值逐步增加；
- 不为未来可能性过度设计当前代码。

### 2.4 模块化可替换

- 各模块通过明确接口通信；
- AI 模型可切换（内置 DeepSeek，用户可自定义）；
- 数据库层通过 ORM 抽象，不直接耦合 SQLite API；
- 前端与后端通过 HTTP API 解耦；
- Rust 系统能力通过 Tauri IPC 命令暴露，前端不直接依赖 Rust 实现细节。

---

## 3. System Overview

### 3.1 High-Level Architecture

系统提供两种本地挂载拓扑，以满足低门槛开发和零端口通信场景。知识库数据始终由本机 SQLite 管理，远程托管与多端同步不在当前架构范围内。

#### 模式 A：本地 TCP 端口挂载 (默认模式 - Local TCP Port)
*最便利的 Web 级开发与浏览器调试生态，兼容性最佳。*

```
┌─ Tauri App ──────────────────────────────────────────────┐
│                                                            │
│  ┌─ Rust Core ─────────────────────────────────────────┐  │
│  │  窗口检测 │ 应用状态事件 │ 屏幕感知 │ 系统托盘      │  │
│  │  Sidecar 生命周期管理 │ 文件系统访问 │ 系统凭据存储  │  │
│  │  Internal HTTP Server (localhost:RUST_PORT)          │  │
│  └────────┬───────────────────────────────┬─────────┘  │
│           │ Tauri IPC (invoke / events)    │              │
│  ┌─ WebView (Vue) ────────────────────┐   │              │
│  │  陪伴 UI │ 知识库 │ 看板 │ 对话 │ 设置│   │              │
│  │  壁纸状态层 │ Hook角标              │   │              │
│  │  Pinia (状态) │ TanStack Query     │   │              │
│  └──────────────────┬─────────────────┘   │              │
│                     │ HTTP (localhost:PORT) │              │
│  ┌─ Fastify Sidecar ──────────────────────┘              │
│  │  业务逻辑 │ AI 调度 │ 混合检索 │ SQLite                │
│  │  Project │ Note │ Board │ Task │ Knowledge │ Settings │
│  │  ▲ Internal HTTP (localhost:RUST_PORT) → Rust Core     │
│  └──────────────────┬─────────────────────────────────┘  │
│                     │                                      │
└─────────────────────┼──────────────────────────────────────┘
                      │ HTTPS (外部)
                ┌─────▼──────────┐
                │  LLM API       │
                │  (DeepSeek /   │
                │   用户自定义)   │
                └────────────────┘
```

#### 模式 B：零端口本地域套接字挂载 (Zero-Port IPC Socket) `(Planned — 见 §1.2；当前仅模式 A 已实现)`
*100% 避免本地网络端口冲突，绕过防火墙，极高通信效率与低延迟。*

```
┌─ Tauri App (模式 B - UDS 零端口桥接) ─────────────────────────┐
│                                                               │
│  ┌─ Rust Core ───────────(UDS Proxy Bridge)──────────┐        │
│  │  系统级能力 │ UDS 代理通道 (`uds_request` 命令接口) │        │
│  │  axum 内部端点 (监听 unix:neo-core.sock)           │        │
│  └────────▲───────────────────────────────▲────────┘        │
│           │                               │                   │
│       Tauri IPC Bridge                Unix Domain Socket      │
│       (`uds_request` 异步代理转发)    (双向穿透 / 零端口)     │
│           │                               │                   │
│  ┌─ WebView (Vue) ────────────────────┐   │                   │
│  │  助手 UI │ 知识库 │ 看板 │ 对话 │ 设置│   │                   │
│  │  api-client (UDS Adapter 适配器)   │   │                   │
│  └────────────────────────────────────┘   │                   │
│                                           ▼                   │
│  ┌─ Fastify Sidecar (绑定 UDS / 零端口) ────────────────────┐ │
│  │  业务逻辑 │ AI 调度 │ 混合检索 │ SQLite                    │ │
│  │  (监听 unix:neo-companion.sock)                          │ │
│  │  FTS5 + sqlite-vec 均在 Fastify 进程内访问                  │ │
│  └──────────────────┬───────────────────────────────────────┘ │
│                     │                                         │
└─────────────────────┼─────────────────────────────────────────┘
                      │ HTTPS (外部)
                ┌─────▼──────────┐
                │  LLM API       │
                └────────────────┘
```

### 3.2 Communication Patterns

系统采用统一传输抽象，两种本地模式下各通道的物理路由如下：

| 通信路径 | 模式 A (本地 TCP Port) | 模式 B (零端口 UDS Socket) |
|---|---|---|
| **WebView → Fastify (API 请求)** | HTTP 请求 (`fetch`)<br>目标: `http://localhost:PORT` | Tauri Rust IPC Bridge<br>WebView 调 `uds_request`<br>Rust 转发至 `neo-companion.sock` |
| **WebView ↔ Fastify (实时推送)** | WebSocket<br>目标: `ws://localhost:PORT/ws` | Tauri 原生事件广播；Fastify 经 UDS 向 Rust Core 写入推送 |
| **知识检索** | Fastify 进程内访问 SQLite FTS5 与 sqlite-vec | 与模式 A 相同，无跨进程向量调用 |
| **Rust Core → Fastify (系统事件同步)** | 内部 HTTP 推送 | UDS / Windows Named Pipe |
| **外部 Hook 注入** | 主动 HTTP POST 到 `/api/hook/push` | File Watcher 或直连本地域套接字 |

**为什么用 WebSocket？**

NeoCompanion 需要服务端随时主动推送内容（AI 流式回复、陪伴反馈、上下文变化通知），且未来交互频率会增长。WebSocket 从 v1 开始建立双向通道，避免后期 SSE→WS 迁移成本。

#### 3.2.1 WebSocket 连接生命周期

```
App 启动 → Fastify ready → WebView 建立 WS 连接
    │
    ├─ 连接成功 → 开始心跳 (每 30s ping/pong)
    │
    ├─ 正常通信 → 按 message.type 分发业务消息
    │
    ├─ 连接断开 → 指数退避重连 (1s, 2s, 4s, 8s, max 30s)
    │              重连后重新订阅活跃任务的实时更新
    │
    └─ App 退出 → 发送 close frame → 关闭连接
```

#### 3.2.2 消息协议格式

所有 WebSocket 消息使用 JSON 格式，单连接多路复用：

```typescript
// 通用消息结构
interface WsMessage {
  type: string;        // 消息类型（见下方枚举）
  payload: unknown;    // 业务数据
  id?: string;         // 消息 ID (用于请求-响应匹配)
  replyTo?: string;    // 回复哪个消息 (响应时填写)
}

// 上行消息类型（Client → Server）
type ClientMessageType =
  | 'ai:chat'              // 发起 AI 对话
  | 'ai:cancel'            // 取消流式生成
  | 'subscribe:task'       // 订阅某任务的实时更新
  | 'unsubscribe:task';    // 取消订阅

// 下行消息类型（Server → Client）
type ServerMessageType =
  | 'ai:chunk'             // AI 流式响应片段
  | 'ai:done'              // AI 响应结束
  | 'ai:error'             // AI 调用错误
  | 'assistant:feedback'   // 陪伴反馈推送
  | 'context:updated'      // 上下文状态变更通知
  | 'task:statusChanged'   // 任务状态变更
  | 'pong';                // 心跳回复
```

#### 3.2.3 心跳与重连策略

| 参数 | 值 | 说明 |
|------|-----|------|
| 心跳间隔 | 30s | Client 发 `{ type: "ping" }`，Server 回 `{ type: "pong" }` |
| 超时判定 | 10s | 发 ping 后 10s 无 pong 视为断连 |
| 重连策略 | 指数退避 | 1s → 2s → 4s → 8s → 16s → 30s (cap) |
| 重连后恢复 | 重新发送 subscribe 消息 | 确保不丢失实时更新 |


#### 3.2.4 依赖

- Server: `@fastify/websocket` 插件
- Client: 原生 `WebSocket` API + 轻量封装 (reconnect + 消息分发)

#### 3.2.5 渐进式多挂载传输架构 (Progressive Multi-Mount Transport Architecture)

为给开发人员和高端用户提供极致的灵活性与部署弹性，系统采用“传输接口抽象 + 渐进式多挂载通信设计”。

##### 1. 传输层接口抽象 (Transport Abstraction)
客户端（WebView）通过统一的接口与底层逻辑通信，屏蔽具体物理协议和连接形态：

```typescript
export interface TransportProvider {
  request<T>(path: string, payload?: unknown): Promise<T>;
  subscribe(event: string, callback: (payload: any) => void): () => void;
  sendEvent(event: string, payload: unknown): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
```

**通信隔离红线**：
WebView 内部的业务特性与 UI 组件一律严禁直接引用 `ws` 或 `window.WebSocket`，必须统一通过 `useTransport()` 获取 `TransportProvider` 进行数据收发，以确保在 Mode B (UDS / 命名管道物理事件代理桥接) 下能够实现零代码修改的平滑平移与通信隔离。

##### 2. 后端主服务绑定模式 (Backend Mounting Modes)
系统支持在设置或环境变量中切换两种本机绑定形态：

* **A. 本地 TCP 端口挂载 (Local TCP Port - 默认模式)**
  * **协议**: Local Loopback TCP (HTTP + WebSocket)
  * **地址**: `http://localhost:PORT` & `ws://localhost:PORT/ws`
  * **特点**: 兼容性与标准化程度高，极为便利的 Web 级开发与浏览器调试生态。
* **B. 零端口本地域套接字挂载 (Zero-Port IPC Socket - 高安稳定)**
  * **协议**: Unix Domain Sockets (UDS) / Windows Named Pipes
  * **地址**: macOS/Linux: `/tmp/neo-companion.sock` | Windows: `\\.\pipe\neo-companion`
  * **特点**: **100% 避免本地网络端口冲突**，彻底绕过操作系统防火墙（无网络警告弹窗），且进程间通信吞吐率和延迟表现均优于 TCP 回环。
##### 3. 多通道 Hook 挂载机制 (Multi-channel Hook Mounts)
除了标准的 HTTP REST 推送，系统提供更加优雅的第三方 Hook 注入通道：
* **文件系统哨兵挂载 (File Watcher Hook)**：Fastify 侧监听特定本地文件目录（如 `~/.neo-companion/hooks/`）的 JSON 文件覆盖写入。自定义编译/自动化脚本无需调用 curl 网络请求，直接 `echo '...' > hooks/git.json` 即可静默挂载助手动态，极大降低 Hook 编写难度并确保在无网环境下 100% 可用。
* **标准流管道挂载 (Stdio Pipe Hook)**：对用户显式启动并授权的外部进程，可将其标准输出流（stdout/stderr）转换为通用 Hook 状态；系统不自动发现或修改第三方工具。
* **局域网消息总线挂载 (MQTT / HA Hook)**：支持 Fastify 挂载作为 MQTT 客户端订阅家庭局域网消息队列，实现与实体智能家居/智能传感器的助手状态联动。

### 3.3 Capability Model → Technical Module Mapping

| 产品能力层 | 技术模块 | 所在包 |
|-----------|----------|--------|
| Assistant Layer | 陪伴 UI + 状态反馈逻辑 | `apps/desktop`, `packages/server-local` |
| Assistant Layer (壁纸状态) | 壁纸层纯状态显示组件 | `apps/desktop` (独立壁纸窗口) |
| Knowledge & AI Layer | 项目、笔记、看板、统一任务、混合检索与 RAG | `packages/server-local`, `packages/db`, `packages/ai` |
| Context Layer | 上下文管道 + Rust 感知 | `packages/server-local` (v1 内联), `crates/` |
| Growth Layer | 复盘服务 + 数据分析 | `packages/server-local`, `packages/db` |
| System Layer | Tauri 运行时 + 同步 (v3) | `apps/desktop`, `crates/` |

---

## 4. Monorepo Structure

```
neo-companion/
├── apps/
│   ├── desktop/                # Tauri + Vue 桌面应用
│   │   ├── src/                # Vue 前端源码
│   │   ├── src-tauri/          # Tauri Rust 后端
│   │   │   ├── src/
│   │   │   ├── Cargo.toml
│   │   │   └── tauri.conf.json
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   └── web/                    # Web 管理端 (v2+, Planned — 尚未创建) (Planned — 尚未创建)
│       ├── src/
│       ├── vite.config.ts
│       └── package.json
├── packages/
│   ├── server-local/           # Fastify 本地服务 (sidecar)
│   │   ├── src/
│   │   │   ├── modules/        # 业务模块 (Partial — 仅 modules/knowledge, modules/ai 存在；其余为 routes/ + services/ 扁平结构)
│   │   │   ├── plugins/        # Fastify 插件 (Planned — 实际插件直接在 app.ts 内联注册)
│   │   │   └── index.ts        # 入口
│   │   └── package.json
│   ├── shared/                 # 类型、校验、常量
│   │   ├── src/
│   │   │   ├── types/          # TypeScript 类型定义
│   │   │   ├── schemas.ts      # TypeBox schema (非 Zod；见 packages/shared/src/)
│   │   │   └── constants/      # 枚举、常量
│   │   └── package.json
│   ├── ai/                     # LLM 抽象层
│   │   ├── src/
│   │   │   ├── adapters/       # DeepSeek, OpenAI, Claude adapters
│   │   │   ├── prompts/        # Prompt 模板
│   │   │   ├── token-budget/   # Token 预算分配、Prompt 裁剪
│   │   │   └── index.ts
│   │   └── package.json
│   ├── db/                     # 数据库层
│   │   ├── src/
│   │   │   ├── index.ts        # node:sqlite schema、迁移与 store
│   │   │   ├── types.ts        # 内部数据库行类型
│   │   │   └── knowledge-fs.ts # 知识库文件系统辅助
│   │   └── package.json
│   └── ui/                     # 共享 UI 组件 (Planned — 尚未创建)
│       ├── src/
│       │   └── components/     # shadcn-vue 组件 (desktop + web 复用)
│       ├── tailwind.config.ts
│       └── package.json
├── crates/                     # Tauri Rust 插件 (Planned — 目录尚未创建)
│   ├── plugin-window-detect/   # 窗口检测
│   ├── plugin-screen-context/  # 屏幕内容获取
│   └── plugin-app-events/      # 应用状态事件
├── turbo.json
├── pnpm-workspace.yaml
├── biome.json
└── package.json
```

### 4.1 Package Dependencies

```
apps/desktop → packages/shared   # packages/ui 为 Planned，当前未依赖
apps/web     → packages/ui, packages/shared   (Planned — apps/web 与 packages/ui 尚未创建)
packages/server-local → packages/ai, packages/db, packages/shared
packages/ai → packages/shared
packages/db → packages/shared
packages/tts → packages/shared
```

### 4.2 Build Pipeline (Turborepo)

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

### 4.3 Type Ownership Rules

| 归属位置 | 放什么 | 示例 |
|----------|--------|------|
| `packages/shared/src/types/` | 跨包共享的 DTO、API 请求/响应类型、枚举 | `TaskStatus`, `ApiResponse<T>`, `AssistantStatus` |
| `packages/shared/src/schemas.ts` | 跨包共享的运行时校验 (TypeBox schema，非 Zod) | `AiChatBodySchema`, `TaskCreateBodySchema` |
| `server-local/modules/context/models/` | 上下文模型类型 (v1 单一真相源，v2 抽离为 `packages/context-engine`) | `TaskContext`, `BehaviorContext`, `FullContext` |
| `packages/ai/src/adapters/types.ts` | AI 相关接口类型 | `ModelAdapter`, `ChatParams`, `ChatChunk` |
| `packages/db/src/types.ts` | 数据库包内部行类型（不跨包导出） | `TaskRow`, `KnowledgeChunkRow` |
| `server-local/modules/*/schema.ts` | 请求参数验证 schema (不定义业务模型) | Fastify JSON Schema |

**原则**: 业务模型类型由拥有该领域逻辑的包定义，`shared` 只放"多包都需要导入"的公共类型。避免在 `shared` 中堆积所有接口。

---

## 5. Desktop Architecture (Tauri)

### 5.1 Rust Core 职责

Rust 侧只负责 WebView 和 Node.js 无法直接完成的系统级能力，并在零端口模式下充当关键的通信桥梁：

> **实现状态**：当前 `apps/desktop/src-tauri/src/lib.rs` 仅实现"系统托盘"+ 4 个 keychain 命令 + 三窗口管理 + wallpaper 插件。下表除"系统托盘"外均为 `(Planned)`；sidecar 实际由 Node `scripts/dev.mjs` 拉起（见 §5.3）。实际命令见 `lib.rs`，非下文 §5.2 草图。

| 能力 | 说明 | 阶段 |
|------|------|------|
| 窗口检测 | 获取当前活跃窗口标题、进程名、应用类型 | v1 (Planned) |
| 系统托盘 | 常驻托盘图标、快捷菜单 | v1 (已实现) |
| 全局快捷键 | 唤醒/隐藏/快速操作 | v1 (Planned) |
| Sidecar 管理 | 启动/停止 Fastify 进程、健康检查 | v1 (Planned — 当前由 Node dev 脚本管理) |
| 应用切换事件 | 监听焦点变化、推送事件到 Fastify | v1 (Planned) |
| UDS/管道 IPC 代理 | **模式 B 下的通信关键**。由于 Webview 浏览器沙箱限制无法直接访问 Unix 套接字与命名管道，由 Rust Core 建立原生 IPC 连接并作为 Bridge 双向透传 WebView 与 Fastify 间的 API 请求与推送事件 | v2 (Planned) |
| 子进程 stdio 挂载 | 对用户显式启动并授权的外部进程，以管道提取通用状态事件 | v2 (Planned) |
| 屏幕内容获取 | 用户授权下截图/OCR (v2) | v2 (Planned) |
| 选中文本提取 | 获取用户选中内容 (v2) | v2 (Planned) |
| 文件系统监听 | 监听指定目录变化 (v2)。在模式 B 中用于挂载文件监听哨兵 (File Watcher) | v2 (Planned) |
| 内部系统能力端点 | **模式 A** 下由 Rust Core 暴露 localhost-only 端点安全获取系统凭据中的 API Key（携带 APP_AUTH_TOKEN 校验，不参与向量检索或数据库业务）；**模式 B** 下通过本地域套接字安全通信。 | v1 (Planned — 实际 keychain 经 Tauri 命令直接访问，无 Rust HTTP 端点) |


### 5.2 Tauri IPC 接口设计

> `(Planned / 草图)` 以下命令签名均为设计草图，**均未实现**。实际 `lib.rs` 仅注册：`get_app_auth_token`、`set_embedding_api_key`、`get_embedding_api_key`、`delete_embedding_api_key`。

```rust
// src-tauri/src/commands.rs

#[tauri::command]
fn get_active_window() -> Result<WindowInfo, String> { ... }

#[tauri::command]
fn get_running_apps() -> Result<Vec<AppInfo>, String> { ... }

#[tauri::command]
fn start_sidecar(config: SidecarConfig) -> Result<(), String> { ... }

#[tauri::command]
fn stop_sidecar() -> Result<(), String> { ... }

#[tauri::command]
fn set_tray_status(status: AssistantStatus) -> Result<(), String> { ... }

// UDS/命名管道 IPC 代理桥接命令 (用于模式 B 沙箱穿透)
#[tauri::command]
async fn uds_request(
  path: String, 
  method: String, 
  payload: Option<serde_json::Value>
) -> Result<serde_json::Value, String> { ... }
```

### 5.3 Sidecar 生命周期

> `(Partial)` 下文描述 Rust 拉起 sidecar 的设计。**实际**：sidecar 当前由 Node `scripts/dev.mjs` 拉起（生成 `APP_AUTH_TOKEN` 经 env 注入两个子进程）；Rust 侧无 spawn/健康检查/UDS 清理代码。生产环境 Rust spawn 为 `(Planned)`。

Sidecar 进程根据挂载模式进行动态初始化：

```
Tauri App 启动
    │
    ├─ 1. Rust 初始化 (托盘、快捷键、事件监听、初始化 UDS 代理通道)
    │
    ├─ 2. 判断运行模式 (读取 Settings 关系数据库/配置文件)
    │      │
    │      ├─ [模式 A/C: 本地 TCP 或远程] 
    │      │      ├─ 启动 Fastify Sidecar (传入可用端口参数 --port)
    │      │      └─ 健康检查 (GET http://localhost:PORT/health)
    │      │
    │      └─ [模式 B: UDS/命名管道套接字] 
    │             ├─ 清理残留套接字文件 (如删除旧 /tmp/neo-companion.sock)
    │             ├─ 启动 Fastify Sidecar (传入 UDS 套接字路径参数 --socket)
    │             └─ 建立套接字健康探针 (探针连通测试)
    │
    ├─ 3. WebView 加载 Vue 应用
    │      ├─ 模式 A/C: 建立标准 Local/Remote HTTP 与 WebSockets 链接
    │      └─ 模式 B: 启用 UDS IPC 代理，所有请求均通过 uds_request 转发
    │
    └─ App 退出时
           ├─ 关闭 Sidecar 子进程并清理已创建的 UDS 文件/管道实例
           └─ 释放相关系统资源
```

### 5.4 WebView (Vue) 架构

```
src/
├── views/                   # Vue Router 页面/视图组件
│   ├── companion/           # 主陪伴界面
│   ├── chat/                # 对话面板
│   ├── tasks/               # 任务面板
│   ├── wallpaper/           # 壁纸状态层视图 (独立窗口)
│   ├── review/              # 复盘面板
│   └── settings/            # 设置
├── router/                  # Vue Router 路由配置
│   └── index.ts
├── features/                # 按功能组织（局部业务组件与逻辑）
│   ├── companion/           # 陪伴相关组件
│   ├── task/                # 任务相关组件
│   ├── chat/                # 对话相关组件
│   ├── wallpaper/           # 壁纸状态层组件 (独立窗口)
│   │   ├── WeatherTime.vue  # 天气+时间
│   │   ├── TaskList.vue     # 任务清单 (只读)
│   │   ├── FocusRing.vue    # 专注计时圆环
│   │   ├── AssistantQuote.vue # 伴侣寄语
│   │   ├── AmbientOverlay.vue # 氛围色调
│   │   └── FocusStats.vue   # 专注统计
│   └── context/             # 上下文展示组件
├── stores/                  # Pinia stores (状态管理)
│   ├── companion.ts         # 陪伴状态 (Pinia)
│   ├── task.ts              # 任务状态 (Pinia)
│   └── settings.ts          # 设置状态 (Pinia)
├── composables/             # Vue 3 组合式函数 (Composables)
│   ├── use-tauri.ts         # Tauri IPC 封装
│   ├── use-api.ts           # TanStack Query (Vue) 适配钩子
│   └── use-ws.ts            # WebSocket 消息订阅组合式函数
│   └── use-wallpaper-state.ts  # 壁纸层状态聚合 (只消费 WS，不发交互)
├── lib/
│   ├── api-client.ts        # Fastify HTTP 客户端 (CRUD)
│   ├── ws-client.ts         # WebSocket 连接管理 (重连、心跳、消息分发)
│   └── platform.ts          # 平台抽象层
├── App.vue                  # Vue 根组件
└── main.ts                  # 应用入口文件
```

### 5.5 Feature Ownership (前后端分工)

| 功能 | 前端 (WebView) | 后端 (Fastify) |
|------|---------------|---------------|
| Wallpaper Status | 壁纸窗口组件渲染、只读状态展示 | 复用现有 Task/Focus/Weather 数据，无新增后端逻辑 |
| Assistant | UI 渲染、动画、状态展示 | 反馈决策逻辑 (何时触发、触发什么类型) |
| Task | 任务列表 UI、拖拽交互 | 任务状态机、CRUD、关联数据 |
| Chat | 消息列表渲染、输入框、WebSocket 消息消费 | 上下文组装、AI 调度、WS 流式推送 |
| Context | 当前状态展示（可选 debug 面板） | 管道编排、事件处理、建模 |

**判断标准**:
- 仅依赖 UI 状态 → 前端 (Pinia store)
- 依赖任务数据 / 上下文 / AI → 后端 (server module)
- v1 陪伴反馈逻辑简单时可暂时纯前端，复杂化后迁移到后端

### 5.6 桌面悬浮透明窗口鼠标穿透方案 (Transparent Window Mouse Click-Through)

由于助手常驻桌面且背景完全透明，为避免透明空白画布遮挡用户操作背后的窗口，同时保证助手角色本身能被拖拽和点击，系统采用 **Canvas 像素级 Alpha 感知与动态事件拦截设计**：

1. **WebView 动态热区检测**：
   在 Vue WebView 顶层组件的 Canvas/Container 上绑定 `mousemove` 事件监听：
   ```vue
   <!-- apps/desktop/src/features/companion/components/AssistantContainer.vue -->
   <script setup lang="ts">
   import { ref } from 'vue';
   import { appWindow } from '@tauri-apps/api/window';

   const canvasRef = ref<HTMLCanvasElement | null>(null);

   const handleMouseMove = (e: MouseEvent) => {
     const canvas = canvasRef.value;
     if (!canvas) return;
     const rect = canvas.getBoundingClientRect();
     const x = e.clientX - rect.left;
     const y = e.clientY - rect.top;
     
     // 提取光标所在像素的 Alpha 值
     const ctx = canvas.getContext('2d');
     if (!ctx) return;
     const pixel = ctx.getImageData(x, y, 1, 1).data;
     const alpha = pixel[3]; // 0 - 255
     
     if (alpha === 0) {
       // 空白透明区：使窗口鼠标穿透，点击直达背后
       appWindow.setIgnoreCursorEvents(true);
     } else {
       // 助手角色实体区：使窗口拦截鼠标，支持点击与拖拽
       appWindow.setIgnoreCursorEvents(false);
     }
   };
   </script>

   <template>
     <div @mousemove="handleMouseMove" class="pet-container">
       <canvas ref="canvasRef"></canvas>
     </div>
   </template>
   ```
2. **边缘保护与防抖**：
   窗口失焦后或离开助手热区时，自动重置 `setIgnoreCursorEvents(false)`，保障拖拽操作的稳定连贯。

### 5.7 壁纸层窗口嵌入方案 (Wallpaper Window Embedding)

壁纸层通过独立 Tauri 窗口嵌入 Windows WorkerW 层，实现"状态信息融入桌面壁纸"的视觉效果。

#### 5.7.1 三窗口分层

```
┌──────────────────────────────────┐
│  用户应用窗口                      │  ← 最高层
├──────────────────────────────────┤
│  Pet 窗口 (always-on-top)        │  ← 交互入口
├──────────────────────────────────┤
│  热区窗口 (always-on-top) ★ 新增  │  ← 壁纸交互热区
├──────────────────────────────────┤
│  桌面图标层 (SHELLDLL_DefView)   │  ← 系统层
├──────────────────────────────────┤
│  壁纸窗口 (WorkerW 子窗口) ★      │  ← 状态画布 + 轻交互
├──────────────────────────────────┤
│  原始壁纸                        │  ← 最底层
└──────────────────────────────────┘
```

#### 5.7.2 技术实现

采用 [`tauri-plugin-wallpaper`](https://github.com/meslzy/tauri-plugin-wallpaper) 插件：

- `attach(label)` — 将指定窗口嵌入 WorkerW 层（位于桌面图标之下、原始壁纸之上）
- `detach(label)` — 将窗口恢复为普通行为
- `reset()` — 重置桌面壁纸状态

窗口配置：
```jsonc
{
  "label": "wallpaper",
  "url": "/?view=wallpaper",
  "transparent": true,
  "decorations": false,
  "alwaysOnTop": false,
  "skipTaskbar": true,
  "resizable": false,
  "visible": false  // attach 后再显示
}
```

#### 5.7.3 核心约束

- **状态画布**：壁纸窗口全局 `pointer-events: none`，不拦截任何鼠标事件；视觉渲染由壁纸窗口负责
- **热区代理**：一级交互（开始/暂停专注、点击任务、沉浸模式切换）通过独立的 always-on-top 热区窗口实现，热区精确覆盖壁纸可交互元素位置
- **交互分级**：壁纸层仅支持零级（纯展示）和一级（导航/触发）交互，二级及以上（编辑/输入）由悬浮层和面板层承载
- **可降级**：WorkerW 不可用时自动 detach 回退到纯悬浮模式；热区交互失败时用户仍可通过助手/面板操作
- **低开销**：CPU < 2%，使用 CSS 动画而非 JS 逐帧更新

详细设计见 [`WALLPAPER_STATUS_LAYER.md`](./WALLPAPER_STATUS_LAYER.md)。

---

## 6. Local Backend (Fastify)

### 6.1 Overview

Fastify 作为本地 sidecar 进程运行，提供 HTTP API 供 WebView 调用。选型理由：高性能、插件式模块隔离、TypeScript-first、JSON Schema 内置验证。

### 6.2 Module Structure

> `(Partial)` 下方目录树为设计意图。**实际**为扁平结构：`routes/{ws,tts,tasks,hooks,focus,ai,window,weather,health}.ts` + `services/{weather-service,hook-manager,focus-manager,window-service}.ts` + `ws-hub.ts`/`errors.ts`。仅 `modules/knowledge/` 与 `modules/ai/` 存在；`modules/{task,context,project,note,board,event,companion,review,hook,settings}/` 及 `plugins/` 目录均未创建（插件直接在 `app.ts` 内联注册）。

```
packages/server-local/src/
├── index.ts                 # 服务入口、端口管理
├── app.ts                   # Fastify 实例创建、插件注册
├── modules/
│   ├── task/
│   │   ├── routes.ts        # /api/tasks/*
│   │   ├── service.ts       # 业务逻辑
│   │   └── schema.ts        # 请求/响应 schema
│   ├── context/
│   │   ├── routes.ts        # /api/context/*
│   │   ├── service.ts       # 上下文管理、管道编排 (v1 内联；v2 抽离为 packages/context-engine)
│   │   ├── schema.ts
│   │   ├── models/          # 上下文模型 (Task/App/Content/Behavior/Memory)
│   │   └── processors/      # 预处理 (过滤、结构化)
│   ├── ai/
│   │   ├── routes.ts        # /api/ai/*
│   │   ├── service.ts       # LLM 调度
│   │   └── stream.ts        # WebSocket 流式推送
│   ├── knowledge/
│   │   ├── routes.ts        # /api/knowledge/*
│   │   ├── service.ts       # 分块、索引、混合检索与 RAG 来源组装
│   │   └── schema.ts
│   ├── project/             # 项目与默认收件箱
│   ├── note/                # Markdown 笔记与标签
│   ├── board/               # 看板、列与任务排序
│   ├── event/
│   │   ├── routes.ts        # /api/events/*
│   │   └── service.ts       # 应用事件记录
│   ├── companion/
│   │   ├── routes.ts        # /api/companion/*
│   │   └── service.ts       # 陪伴反馈决策 (任务状态机、反馈规则)
│   ├── review/
│   │   ├── routes.ts        # /api/review/*
│   │   └── service.ts       # 复盘生成
│   ├── hook/
│   │   ├── routes.ts        # /api/hooks/* (包含 /api/hook/push 与 /api/hook/permission)
│   │   ├── service.ts       # 通用 Hook、文件监听哨兵、审批流程与状态机；不修改第三方配置
│   │   └── schema.ts        # Hook 接口数据校验 Schema
│   └── settings/
│       ├── routes.ts        # /api/settings/*
│       └── service.ts       # 用户设置、模型配置
└── plugins/
    ├── db.ts                # SQLite 连接插件
    ├── transport.ts         # **模式 A/B 绑定核心**：自动根据启动参数监听 TCP Port 或 Unix Domain Socket / Windows Named Pipe
    ├── websocket.ts         # WebSocket 连接管理 (@fastify/websocket)
    ├── cors.ts              # CORS (localhost/CORS 策略配置)
    └── error-handler.ts     # 统一错误处理
```

#### Module vs Package 调用关系

每个 server module 遵循统一模式：`routes.ts` 做 HTTP 参数校验，`service.ts` 编排逻辑并委托给对应独立包：

| Server Module | 调用的独立包 | 说明 |
|---------------|-------------|------|
| `modules/context/service.ts` | 直接实现（v1） | 管道编排和上下文建模。v1 内联实现，v2 复杂化后抽离为 `packages/context-engine` |
| `modules/ai/service.ts` | `packages/ai` | 委托模型调用和 Token 裁剪 |
| `modules/task/service.ts` | 直接实现 | 任务状态机和 CRUD，逻辑简单无需独立包 |
| `modules/companion/service.ts` | 直接实现 | 陪伴反馈决策，依赖 task + context 数据 |
| `modules/knowledge/service.ts` | `packages/db` + `packages/ai` | 分块、FTS5/sqlite-vec 检索、Embedding 调度和来源组装 |
| `modules/review/service.ts` | `packages/ai` + `packages/db` | 聚合数据后调用 AI 生成复盘 |
| `modules/hook/service.ts` | 直接实现 | 通用 Hook 接收、文件监听和内存挂起审批控制流，不扫描或改写第三方配置 |

**判断标准**: 逻辑是否可能被多个 consumer 复用？是 → 抽为独立 package；否 → 直接写在 module service 中。

### 6.3 Core API Routes

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | `/health` | 健康检查 | v1 |
| POST | `/api/ai/chat` | AI 对话；v2 接受 `useKnowledge/projectId` 并在完成事件返回来源 | v1/v2 |
| GET | `/api/tasks` | 任务列表 | v1 |
| POST | `/api/tasks` | 创建任务 | v1 |
| PATCH | `/api/tasks/:id` | 更新任务状态 | v1 |
| GET/POST | `/api/projects` | 列出或创建项目 | v2 |
| GET/POST/PATCH/DELETE | `/api/notes[/:id]` | Markdown 笔记 CRUD | v2 |
| GET/POST/PATCH/DELETE | `/api/boards[/:id]` | 看板与列管理 | v2 |
| POST | `/api/boards/:id/reorder` | 列或任务排序 | v2 |
| POST | `/api/events` | 写入应用事件 | v1 |
| GET | `/api/context/current` | 获取当前任务上下文 | v1 |
| GET | `/api/knowledge/search` | 按项目范围执行全文/混合检索 | v2 |
| GET | `/api/knowledge/index-status` | 获取索引能力、队列和失败状态 | v2 |
| POST | `/api/knowledge/reindex` | 标记并重建知识索引 | v2 |
| GET | `/api/review/daily` | 获取日复盘 | v2 |
| POST | `/api/hook/push` | 外部用户自定义脚本/通知状态推送 | v2 |
| POST | `/api/hook/permission` | 外部 Agent 敏感指令挂起审批请求 (Permission Bubble) | v2 |
| GET | `/api/settings` | 获取设置 | v1 |
| PUT | `/api/settings` | 更新设置 | v1 |

知识工作空间新增的跨包公共类型归属 `packages/shared`：

```typescript
export interface Project { id: string; title: string; description?: string; parentId: string | null; isInbox: boolean; order: number }
export interface Note { id: string; projectId: string; title: string; body: string; tags: string[] }
export interface Board { id: string; projectId: string; title: string }
export interface BoardColumn { id: string; boardId: string; title: string; status: 'todo' | 'doing' | 'done' | 'archived'; position: number }

export interface KnowledgeSource {
  sourceType: 'note' | 'task';
  sourceId: string;
  projectId: string;
  title: string;
  excerpt: string;
  chunkId: string;
}

export interface IndexStatus {
  mode: 'hybrid' | 'fts-only';
  pending: number;
  failed: number;
  stale: number;
  providerConfigured: boolean;
  vectorExtensionAvailable: boolean;
}
```

任务公共类型在保留现有 `id/title/status/createdAt/completedAt` 的基础上增加 `projectId`、`boardId`、`columnId`、`description`、`position` 与 `updatedAt`。AI 完成响应统一为 `{ text, sources, retrievalMode }`；`sources` 必须由服务端检索结果生成。

### 6.4 Sidecar 打包策略

Fastify sidecar 需要作为独立可执行文件随 Tauri 应用分发，无需用户预装 Node.js。

**首选方案**: Node.js SEA (Single Executable Applications)

构建流程：
```
esbuild bundle (server-local → 单文件 JS)
    → Node.js SEA 注入 (生成平台可执行文件)
    → Tauri externalBin 分发
```

**⚠️ 原生 C++ 模块打包避坑指南 (SEA 兼容性)**：
* **痛点**：Node.js SEA **无法直接打包原生的 `.node` 二进制 C++ 插件**（如 `better-sqlite3` 依赖的 `better_sqlite3.node`）。若打包，Sidecar 会在运行时因加载不到原生驱动而直接崩溃。
* **数据库驱动**：项目要求 Node.js 24+，直接使用内置 `node:sqlite` 和手写参数化 SQL，不依赖第三方 ORM 或 `.node` 数据库驱动。
* **剩余原生资源**：`sqlite-vec` 通过 `loadExtension()` 加载平台 `.dll` / `.so` / `.dylib`。SEA 构建仍需将对应扩展作为 loose asset 分发，不能宣称整个 sidecar 已是无外部文件的单二进制。

**备选方案**: Bun compile (`bun build --compile`)，打包更简单但生态兼容性需验证。

```json
// tauri.conf.json
{
  "bundle": {
    "externalBin": ["binaries/neo-companion-server"]
  }
}
```

**注意**: 需在 CI 中为 Windows / macOS / Linux 分别构建对应平台的 SEA 二进制。

---

## 7. AI Integration Layer

### 7.1 Architecture

```
┌─ packages/ai ──────────────────────────────────────┐
│                                                      │
│  ┌─ Adapter Interface ─────────────────────────┐    │
│  │  sendMessage(messages, options) → Stream     │    │
│  │  countTokens(text) → number                  │    │
│  └──────────────────────────────────────────────┘    │
│          ▲           ▲           ▲                   │
│  ┌───────┤   ┌───────┤   ┌──────┤                   │
│  │DeepSeek│  │OpenAI │   │Claude│   (可扩展)         │
│  └────────┘  └───────┘   └──────┘                   │
│                                                      │
│  ┌─ Prompt Manager ────────────────────────────┐    │
│  │  模板注册 │ 变量注入 │ 场景路由              │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  ┌─ Token Budget Manager ───────────────────────┐    │
│  │  Token 预算分配 │ Prompt 压缩 │ 优先级裁剪     │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 7.2 Model Adapter Interface

```typescript
// packages/ai/src/adapters/types.ts

export interface ModelAdapter {
  readonly id: string;
  readonly name: string;

  chat(params: ChatParams): AsyncIterable<ChatChunk>;
  countTokens(text: string): number;
  isAvailable(): Promise<boolean>;
}

export interface ChatParams {
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface ChatChunk {
  type: 'text' | 'done' | 'error';
  content: string;
}
```

### 7.3 Model Configuration

用户可在设置中配置模型：

```typescript
// packages/shared/src/types/settings.ts

export interface ModelConfig {
  id: string;
  provider: 'deepseek' | 'openai' | 'claude' | 'custom';
  baseUrl?: string;         // 自定义端点
  model: string;            // 模型名称
  isDefault: boolean;
}
```

内置 DeepSeek 聊天适配器，用户可添加其他聊天模型，并单独配置 Embedding Provider。API Key 只保存在操作系统凭据存储中，SQLite 仅保存非敏感配置。

### 7.4 Prompt Management

```typescript
// packages/ai/src/prompts/registry.ts

export type PromptScene =
  | 'companion_feedback'     // 陪伴反馈
  | 'task_assist'            // 任务辅助
  | 'context_summary'        // 上下文摘要
  | 'review_generate'        // 复盘生成
  | 'memory_extract';        // 记忆提取

export interface PromptTemplate {
  scene: PromptScene;
  systemPrompt: string;
  userTemplate: string;      // 支持变量插值 {{variable}}
  requiredContext: string[];  // 需要哪些上下文字段
}
```

### 7.5 Token Budget Management

```typescript
// packages/ai/src/token-budget/budget.ts

export interface TokenBudget {
  total: number;              // 模型上下文窗口 (e.g. 64k)
  systemPrompt: number;       // 系统提示词预留
  taskContext: number;        // 任务上下文预留
  conversationHistory: number; // 对话历史
  userMessage: number;        // 当前用户输入
  responseReserve: number;    // 响应预留
}
```

当上下文超出预算时，按优先级裁剪：
1. 压缩早期对话历史为摘要；
2. 裁剪低相关性上下文；
3. 保留当前任务直接相关内容。

### 7.6 Offline / Degraded Mode

LLM API 不可用时（网络断开、API Key 无效、服务超时），系统进入降级模式：

| 功能 | 降级行为 |
|------|----------|
| 任务 CRUD | 正常工作（纯本地） |
| 事件记录 | 正常工作（纯本地） |
| 陪伴反馈 | 回退到规则引擎（基于任务状态 + 行为上下文的预定义反馈模板） |
| AI 对话 | 显示"当前无法连接 AI 服务"提示，不阻塞其他功能 |
| 上下文管道 | 采集和建模正常工作，仅 AI 摘要/提取能力暂停 |
| 知识检索 | FTS5 正常工作；Embedding 作业保留为 pending，向量不可用时显示 `fts-only` |

**设计原则**: AI 是增强能力，不是核心流程的阻塞依赖。用户在离线时仍能完成任务管理和专注跟踪。

**🔊 拟人化 TTS 离线双模引擎降级策略**：
* **在线状态**：调用极高拟真度、带有情绪表现力的云端 TTS 合成接口（如 Edge-TTS, OpenAI TTS 等），通过 Fastify 管道流式传输至 WebView 播放，塑造高度拟人化的声音体验。
* **离线降级状态**：若检测到网络中断或 API 失联，系统自动降级无缝回退至浏览器内置的 **Web Speech API (`window.speechSynthesis`)**。
  * 它直接调用操作系统内置的 TTS 引擎（如 Windows SAPI5，macOS SpeechSynthesis）。
  * 此策略**0 体积开销**（无需本地捆绑 100MB+ 的 Sherpa-ONNX 离线包），且**100% 离线可用**，能够确保在断网环境下助手绝不失声，实现长效陪伴。

---

## 8. Context Pipeline

Context Pipeline 是 NeoCompanion 的核心差异化模块，负责将分散的系统事件、应用状态和用户行为转化为结构化的任务上下文。

### 8.1 Pipeline Architecture

```
┌─ Rust Core ──────────────────────────────┐     ┌─ Fastify (Mode A/B) ───────────────────────────┐
│  窗口检测    应用事件    屏幕感知        │     │                                                 │
│                                          │────▶│  Collector → Processor → Model → Store         │
└──────────────────────────────────────────┘     │      │           │          │        │          │
                                                 │      ▼           ▼          ▼        ▼          │
                                                 │   原始事件    结构化数据   上下文模型  SQLite     │
                                                 │                              FTS5 + vec │
                                                 │              Consumer ◀───────────────┘          │
                                                 │              (AI / 任务恢复 / 复盘)              │
                                                 └─────────────────────────────────────────────────┘
```

### 8.2 Data Flow

```
1. 采集 (Collect)
   Rust 侧监听系统事件 → HTTP POST 到 Fastify /api/events

2. 预处理 (Process)
   - 去重 (短时间内重复事件合并)
   - 敏感信息过滤 (规则引擎)
   - 结构化 (原始事件 → 标准格式)
   - 分类 (任务相关 / 非相关)

3. 建模 (Model)
   - 组装当前任务上下文 (Task + App + Content + Behavior)
   - 计算任务相关性分数
   - 判断用户状态 (专注 / 中断 / 离开)

4. 存储 (Store)
   - 事件和上下文快照写入 SQLite (events, sessions 等表)
   - 用户知识写入 notes/tasks 与 knowledge_chunks；FTS5 同步更新，Embedding 作业异步写入 sqlite-vec。
   - 助手长期记忆单独写入 memories，不与用户知识默认混合。

5. 消费 (Consume)
   - AI 对话按项目范围检索用户知识，融合 FTS5 与 sqlite-vec 候选，并返回服务端生成的结构化来源。
   - 任务恢复时查询历史上下文和最近应用事件
   - 复盘时聚合分析上下文与统计数据
```

#### 8.2.1 极客 Hook 与权限卡片异步挂起流 (Hook Permission Approval Flow)

```
1. 外部 Agent 发起写操作/运行敏感脚本 
   → POST 到 Fastify /api/hook/permission { command: "npm run deploy", severity: 8 }

2. Fastify Hook Service 挂起该 HTTP 请求 (基于 Promise 异步挂起)
   → 在内存映射表 permissionRequests 中生成 unique_id 记录
   → 通过 WebSocket 向 WebView 发送 { type: "permission:request", payload: { id: "req_123", command: "npm run deploy" } }

3. WebView (Vue 前端) 弹窗半透明 Permission Bubble 卡片
   → 展示提示、敏感度和操作项
   → 用户一键点击 (Allow/Deny) 或触发系统全局热键 (Ctrl+Shift+Y / Ctrl+Shift+N)

4. WebView 通过 WebSocket 回传结果给 Fastify
   → WebSocket 发送 { type: "permission:response", payload: { id: "req_123", approved: true } }

5. Fastify 内存解挂，释放挂起的 HTTP 连接
   → 响应状态码 200 (Allow) 或 403 (Deny) 返回给外部 Agent 终端继续/中止执行
```

### 8.3 Context Types

```typescript
// packages/server-local/src/modules/context/models/types.ts
// v1 内联在 server-local 中，v2 抽离为 packages/context-engine

export interface TaskContext {
  taskId: string;
  taskName: string;
  taskGoal: string;
  taskStage: 'not_started' | 'in_progress' | 'paused' | 'completed';
  startedAt: string;
  elapsedMinutes: number;
}

export interface ApplicationContext {
  currentApp: string;
  windowTitle: string;
  appCategory: AppCategory;
  isTaskRelated: boolean;
  switchedAt: string;
}

export interface BehaviorContext {
  focusDuration: number;       // 当前连续专注分钟数
  interruptionCount: number;   // 本次任务中断次数
  appSwitchCount: number;      // 应用切换次数
  idleSince: string | null;    // 最后操作时间 (null=活跃)
}

export interface MemoryContext {
  recentTasks: TaskSummary[];   // 最近相关任务
  userPreferences: string[];    // 用户偏好摘要
  relevantKnowledge: KnowledgeSource[]; // 本次检索实际召回的笔记或任务来源
}

export interface FullContext {
  task: TaskContext;
  application: ApplicationContext;
  behavior: BehaviorContext;
  memory: MemoryContext;
  timestamp: string;
}
```

### 8.4 Privacy Filter

```typescript
// packages/server-local/src/modules/context/processors/privacy-filter.ts

export interface PrivacyRule {
  type: 'app_blocklist' | 'title_pattern' | 'content_pattern';
  pattern: string;
  action: 'skip' | 'redact';
}

// 默认规则
const DEFAULT_RULES: PrivacyRule[] = [
  { type: 'app_blocklist', pattern: '1Password|KeePass|Bitwarden', action: 'skip' },
  { type: 'title_pattern', pattern: '.*银行.*|.*支付.*', action: 'skip' },
  { type: 'content_pattern', pattern: '\\b\\d{16,19}\\b', action: 'redact' }, // 银行卡号
];
```

用户可在设置中自定义规则，添加应用黑名单。

---

## 9. Data Architecture

### 9.1 Technology

- **SQLite + `node:sqlite`**：业务数据的唯一事实源，使用 WAL 和 5 秒 busy timeout 保证桌面场景下的并发稳定性。
- **SQLite FTS5**：标题、正文、标签和任务描述的全文检索，向量能力不可用时仍可独立工作。
- **sqlite-vec**：与主数据库同进程加载的向量扩展，不在 Rust Core 或独立数据库中维护第二份数据。
- **系统凭据存储**：保存 Chat / Embedding API Key；数据库只保存 Provider、端点、模型和索引元数据。

### 9.2 Core Schema

> **注意**：下方是早期产品数据模型草图，不是可执行 schema。实际结构以 `packages/db/src/index.ts` 的 `initSchema()` 和 `runSchemaMigrations()` 为准。主要差异：无 `boards` 表；`memories`/`reviews` 尚未创建；`tasks` 与 `knowledge_tasks` 分表。

```text
// 声明式概念伪代码；当前实现不使用 ORM。

// 项目。系统迁移时创建默认“收件箱”。
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  parentId: text('parent_id').references(() => projects.id),
  isInbox: integer('is_inbox', { mode: 'boolean' }).notNull().default(false),
  order: integer('order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// (Planned — 实际无 boards 表；board_columns 直接挂 project_id，见 index.ts)
export const boards = sqliteTable('boards', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  title: text('title').notNull(),
  createdAt: text('created_at').notNull(),
});

export const boardColumns = sqliteTable('board_columns', {
  id: text('id').primaryKey(),
  // 实际字段为 projectId（非 boardId）；status 枚举 todo|doing|done|archived；order（非 position）
  boardId: text('board_id').notNull().references(() => boards.id),
  title: text('title').notNull(),
  status: text('status').notNull().default('todo'), // 'todo' | 'doing' | 'done' | 'archived'
  position: integer('position').notNull(),
});

// 统一任务：简单清单和看板卡片读取同一张表。
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  boardId: text('board_id').references(() => boards.id),
  columnId: text('column_id').references(() => boardColumns.id),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('todo'), // 'todo' | 'doing' | 'done' | 'archived'
  position: integer('position').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
});

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  title: text('title').notNull(),
  body: text('body').notNull().default(''), // Markdown
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
});

export const noteTags = sqliteTable('note_tags', {
  noteId: text('note_id').notNull().references(() => notes.id),
  tagId: text('tag_id').notNull().references(() => tags.id),
});

// FTS5 与 sqlite-vec 使用原生 SQL migration 创建虚拟表。
export const knowledgeChunks = sqliteTable('knowledge_chunks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  sourceType: text('source_type').notNull(), // 'note' | 'task'
  sourceId: text('source_id').notNull(),
  ordinal: integer('ordinal').notNull(),
  content: text('content').notNull(),
  contentHash: text('content_hash').notNull(),
  embeddingModel: text('embedding_model'),
  embeddingDimensions: integer('embedding_dimensions'),
  indexStatus: text('index_status').notNull(), // pending | indexed | failed | stale
  indexError: text('index_error'),
  updatedAt: text('updated_at').notNull(),
});

// 专注会话
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  taskId: text('task_id').references(() => tasks.id),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  focusMinutes: integer('focus_minutes').default(0),
  interruptionCount: integer('interruption_count').default(0),
  status: text('status').notNull().default('active'),
  // 'active' | 'paused' | 'completed'
});

// 应用事件
export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => sessions.id),
  type: text('type').notNull(),
  // 'app_switch' | 'window_focus' | 'idle_start' | 'idle_end' | 'task_interrupt'
  appName: text('app_name'),
  windowTitle: text('window_title'),
  metadata: text('metadata'),       // JSON
  timestamp: text('timestamp').notNull(),
});

// 助手长期记忆与用户知识分表管理，不进入知识库索引，除非用户后续显式开启。
// (Planned — 表尚未在 index.ts 中创建)
export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  category: text('category').notNull(),
  // 'task_pattern' | 'user_preference' | 'context_snapshot'
  createdAt: text('created_at').notNull(),
  lastAccessedAt: text('last_accessed_at'),
  accessCount: integer('access_count').default(0),
});

// 复盘 (Planned — 表尚未在 index.ts 中创建)
export const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  type: text('type').notNull(),     // 'daily' | 'weekly' | 'task'
  content: text('content').notNull(), // AI 生成的复盘文本
  metrics: text('metrics'),         // JSON (统计数据)
  createdAt: text('created_at').notNull(),
});

// 对话历史
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => sessions.id),
  role: text('role').notNull(),     // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  timestamp: text('timestamp').notNull(),
});

// 设置
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),   // JSON
  updatedAt: text('updated_at').notNull(),
});
```

### 9.3 Vector Storage & Hybrid Retrieval Architecture

知识检索遵循“全文搜索始终可用，向量搜索按配置增强”的原则：

1. **分块**：Markdown 先按标题和段落切分，再合并为约 1200 字符的稳定分块并保留少量重叠；任务标题和描述组成单独知识条目。分块使用内容哈希判断是否需要重新索引。
2. **全文索引**：每次写入内容时同步更新 FTS5。即使无网络、无 API Key 或 sqlite-vec 加载失败，搜索和 RAG 仍可使用关键词候选。
3. **向量索引**：写入业务数据后提交进程内索引作业，调用 Embedding Adapter 后将向量写入 sqlite-vec。Provider、模型或维度变化时，将不匹配分块标记为 `stale` 后重建。
4. **混合排序**：全文和向量分别取候选集，使用 Reciprocal Rank Fusion 合并；查询在召回前即应用 `project_id` 范围，防止跨项目泄漏。
5. **删除一致性**：删除笔记或任务时，在同一事务中删除分块、FTS 行和向量行。失败作业保留错误摘要并可重试，不记录知识正文或 API Key。

#### 9.3.1 Embedding 生成策略

聊天模型与 Embedding Provider 独立配置。首版实现 OpenAI-compatible `/embeddings` 接口；不假定当前聊天 Provider 提供 Embedding。API Key 由 Rust Core 从系统凭据存储读取，并通过受 APP_AUTH_TOKEN 保护的内部通道提供给 Fastify，绝不写入 SQLite、响应或日志。

```typescript
// packages/ai/src/adapters/types.ts

export interface EmbeddingAdapter {
  readonly id: string;
  embed(texts: string[]): Promise<number[][]>;
  dimensions: number;
}
```

后续本地模型继续实现同一接口，不改变知识库表结构和检索 API。

#### 9.3.2 RAG 来源约束

`POST /api/ai/chat` 接受 `useKnowledge` 与可选 `projectId`。服务端先检索，再以稳定的 `sourceType/sourceId/chunkId` 组装上下文；最终响应和 `ai:done` 事件返回结构化 `sources`。来源列表由服务端根据实际召回结果生成，模型输出无权新增来源。

当向量不可用时，`IndexStatus.mode` 为 `fts-only`，服务端继续用全文候选回答并在 UI 显示降级状态；不得静默退化为不使用知识库的普通聊天。

`IndexStatus` 三态：`hybrid`（vec 加载且 provider 配置、无 pending/stale）、`indexing`（hybrid 可行但有 pending/stale 分块待嵌入）、`fts-only`（vec 未加载或 provider 未配置）。新增 `vecVersion`（sqlite-vec 版本）与 `vecLoadError`（加载失败原因），供前端在静默降级时向用户显示原因（"向量扩展加载失败：…" 或 "未配置 embedding provider，仅全文检索可用"）。

### 9.4 AI Chat/Ask 双模式与引用审计

移植自 [open-notebook](https://github.com/lfnovo/open-notebook) 的双模式 RAG 设计，由 `packages/server-local/src/modules/ai/` 实现：

#### 9.4.1 双模式

- **Chat 模式**：基于用户**手选**的笔记/任务上下文多轮对话。上下文来源是用户在 AI 面板勾选的条目（非检索），整篇或按权限裁剪后送 LLM，支持 `conversationId` 续接历史。
- **Ask 模式**：向知识库提问，**自动检索**（`searchHybrid`）相关分块作答。单次问答，命中 chunk 送 LLM，一次性返回。

两者共用同一套上下文打包与引用审计管线，差异仅在上下文来源（手选 vs 检索）。

#### 9.4.2 三级上下文权限

Chat 模式下每条笔记/任务可设 `full`（整篇正文）/ `summary`（首段摘要）/ `excluded`（排除）。`excluded` 条目不进入请求载荷。`context.ts` 按以下权重构建上下文块：

| 块类型 | 权重 |
|--------|------|
| noteFull | 100 |
| askChunk（检索命中） | 90 |
| noteSummary | 70 |
| task | 55 |
| history（对话历史） | 40 |

#### 9.4.3 上下文打包策略

`packContext()` 在 6000 token 预算内：

1. **greedy fill**：高权重块优先入，超预算整块丢弃。
2. **gap fill**：剩余预算在**句子边界**截断补齐次权重块。
3. **sandwich ordering**：最相关块置最前、次相关置最后（利用 LLM 对首尾注意力最强），同源块保留文档序。

#### 9.4.4 引用注入与反幻觉审计

`citation.ts`：

1. `injectSources()`：每块注入为带稳定 ID 的可引用单元（`<source id="s0" …>`），系统 prompt 要求模型只引用已提供 ID、不发明新 ID、冲突并列引用。
2. `parseAndAuditCitations()`：解析模型输出，**剔除模型编造的 ID**（反幻觉）。
3. `buildSources()`：只返回实际被引用的 source，由服务端检索结果生成（非模型自报）→ 前端可点击跳转。

#### 9.4.5 多轮会话持久化

`ai_conversations`（会话，含 mode）与 `ai_messages`（消息，含 `sources_json`）表持久化对话。`AiAnswer.conversationId` 透传给前端，Ask 模式单轮、Chat 模式多轮续接。

#### 9.4.6 Embedding 配置持久化

Embedding provider 的非敏感配置（provider/baseUrl/model）持久化到 `app_config` 表。API Key 由 Tauri 写入系统钥匙链，桌面端启动后通过认证通道回填到 Sidecar 进程内存；也可由 `EMBEDDING_API_KEY` 环境变量提供。旧版 SQLite 明文密钥使用 claim → 写入钥匙链 → clear 两阶段流程迁移，钥匙链写入失败时不删除旧值。GET 端点返回 `apiKeySource: "keychain" | "env" | "legacy" | "none"`。

### 9.5 Data Location

```
用户数据目录 (Tauri app data):
├── neo-companion.db          # 主 SQLite 数据库
├── neo-companion.db-wal      # WAL 日志
├── logs/                     # 结构化日志文件
│   ├── server-YYYY-MM-DD.log # Fastify 日志 (pino JSON)
│   └── core-YYYY-MM-DD.log   # Rust Core 日志 (tracing JSON)
└── backups/                  # 定期自动备份
```

数据目录由 Tauri 的 `app_data_dir()` 管理，跨平台统一。

### 9.6 Migration Strategy

使用手写版本表迁移：`packages/db/src/index.ts` 的 `runSchemaMigrations()` 读取 `schema_migrations` 版本表，逐版本 `apply(version, migrate)`，每个版本在事务内执行 DDL 并记录版本号。当前已应用 v1–v5。

```bash
# 迁移随应用启动自动执行（initSchema → runSchemaMigrations），无需手动命令。
# 新增版本：在 runSchemaMigrations 中追加 apply(N, () => { ... }) 块。
```

应用启动时自动检查并执行待应用的迁移。

知识工作空间表结构在 `initSchema` 中以 `CREATE TABLE IF NOT EXISTS` 创建；`ensureInbox()` 在运行时确保默认"收件箱"项目存在。默认看板/四列的批量 bootstrap 在迁移中尚未实现（见 TODO_INVENTORY）。

sqlite-vec 加载失败不得回滚业务表迁移；记录 `fts-only` 能力状态并继续启动。

### 9.7 SQLite 并发并发安全与高频事件防抖写入 (SQLite Concurrency & Debounced Writes)

由于屏幕感知引擎与窗口检测模块会高频产生用户活动状态 Ticks（如窗口切换、空闲检测、打字活跃状态），如果每次微小变化都直接进行一次 SQLite 数据库写事务，将带来极高的磁盘 I/O 压力并诱发 `SQLITE_BUSY: database is locked` 并发锁定冲突。为此，系统强制应用以下并发优化：

1. **数据库层开启 WAL（Write-Ahead Logging）与忙等待**：
   在 Fastify 侧的数据库连接初始化插件中，强制设置连接参数：
   ```typescript
   // packages/db/src/index.ts
   db.run(sql`PRAGMA journal_mode = WAL;`);
   db.run(sql`PRAGMA busy_timeout = 5000;`); // 5秒锁等待超时，防止锁冲突直接抛错
   ```
2. **高频事件内存队列防抖合并（Debounced Write Queue）**：
   活跃检测相关的日志、小步长的心跳事件等，严禁逐条同步写入 SQLite。
   * Fastify 的 `EventService` 内部维持一个 `memoryQueue: Event[]` 缓冲数组。
   * **缓冲策略**：采用 5 秒周期性批量合并写入 (`db.insert().values(queue)`)，或只在**用户活动状态发生断裂变化时**（如从专注 Focus 进入分心 Distracted，或者转为空闲 Idle）立即清空队列执行写入。
   * 这一合并机制可降低 SQLite 95% 以上的写事务吞吐，极大保护了用户的固态硬盘寿命，并消除助手动作渲染卡帧现象。

---

## 10. Hook & Permission Control System Architecture

Hook 机制与权限控制系统是 NeoCompanion 接收外部状态并提供通用审批交互的基础。它与知识库相互独立，不绑定任何特定 Agent、CLI 或厂商。

### 10.1 显式接入协议 (Explicit Hook Registration)

NeoCompanion 只公开接入协议和用户可复制的配置片段，不扫描第三方配置文件，也不自动写入插件或 Hook。外部程序由用户主动选择以下通道：

> `(Partial)` 当前仅 HTTP 与 WebSocket 通道已实现；File Watcher、UDS/Named Pipe 为 `(Planned)`。

- HTTP：向 `/api/hook/push` 或 `/api/hook/permission` 主动发送请求。(已实现)
- File Watcher：写入 `~/.neo-companion/hooks/` 下的 JSON 文件。(Planned)
- UDS / Named Pipe：在零端口模式下使用与 HTTP 等价的消息结构。(Planned)
- WebSocket：已建立连接的客户端订阅状态和审批结果。(已实现)

所有接入都使用通用 `agentId`、`state`、`description` 与 `metadata` 字段。设置页可以展示端点、协议示例和连接状态，但不得枚举或修改其它应用的配置。

---

### 10.2 异步 Promise 审批挂起机制 (Promise-based Suspension Pipeline)

当已接入的外部程序发起涉及系统敏感指令（如危险脚本执行或文件覆写）的请求时，Fastify 端通过**内存挂起 Promise** 机制阻断请求，直至用户审批或超时。

#### 10.2.0 零端口模式 (Mode B) 下外部 Hook 的三维连通机制 `(Planned — 依赖模式 B)`

在 **模式 B (零端口模式)** 下，本地没有开放任何 TCP 端口，外部 Executor 无法通过标准 localhost TCP 网络直接连接。为此，系统采用“免网络文件哨兵 + 原生 UDS + 局域回环代理”的三维通信保障：

1. **文件监听哨兵 (File Watcher Hook - 推荐)**：
   对于无需双向阻塞审批的“单向状态推送类” Hook（如 Webpack 编译结果、Git commit 事件、CI/CD 部署成功等），外部自定义脚本无需发起任何网络请求。只需将标准 JSON 数据直接覆盖写入系统监听文件夹：
   ```bash
   # 单行 Shell 命令即可触发助手欢呼动作，100% 离线、零端口、极简极客体验
   echo '{"state":"success","description":"Git build pass"}' > ~/.neo-companion/hooks/git.json
   ```
   Fastify Sidecar 配合 Rust 侧的 `plugin-app-events` 文件系统哨兵，高灵敏度拦截该文件写入事件并秒级推送至 WebView，彻底免除端口冲突之忧。
   * **文件监听防抖与并发安全机制**：为避免外部程序在写入未完成时触发 Watcher 导致 JSON 解析异常，哨兵接收器必须应用 100ms 写入防抖与 try-catch 容错解析。若捕获到由于文件被锁或写入不完整抛出的 `SyntaxError`，会自动进行指数退避重试，严禁向外抛出未捕获异常导致 Sidecar 进程崩溃退出。
   
2. **原生本地域套接字挂载 (Native UDS Mount)**：
   支持套接字协议的外部程序可直接通过 `unix:/tmp/neo-companion.sock:/api/hook/permission` 连接，实现零端口双向审批。
   
3. **轻量回环 TCP 端口代理 (Local TCP Proxy Gateway)**：
   为兼容不支持 UDS 协议的传统 TCP-only 工具，Tauri Rust Core 可在需要时临时且极其受限地启用一个 localhost TCP 回环网关端口，仅接收本机回环请求并高安全地路由代理给底层的 Unix 套接字 / Windows 命名管道，兼顾向后兼容与沙箱安全。

```
[Agent/Executor]                         [Fastify Server]                      [WebView / Vue UI]  
       │                                         │                                      │
       │  HTTP POST /api/hook/permission         │                                      │
       ├────────────────────────────────────────▶│                                      │
       │                                         │ ──┐                                  │
       │                                         │   │ 1. Instantiate Promise           │
       │                                         │   │ 2. Register resolver in Memory   │
       │                                         │ ◀─┘                                  │
       │                                         │                                      │
       │                                         │   WS Emit: permission:request        │
       │                                         ├─────────────────────────────────────▶│
       │                                         │                                      │  ──┐
       │                                         │                                      │  │ Render transparent
       │                                         │                                      │  │ approval bubble
       │                                         │                                      │  ◀─┘
       │                                         │                                      │
       │                                         │                                      │  (Click Approve or
       │                                         │                                      │   Press Ctrl+Shift+Y)
       │                                         │   WS Reply: permission:response      │
       │                                         │◀─────────────────────────────────────┤
       │                                         │                                      │
       │                                         │ ──┐                                  │
       │                                         │   │ 3. Pull Resolver from Map        │
       │                                         │   │ 4. Resolve/Reject Promise        │
       │                                         │ ◀─┘                                  │
       │                                         │                                      │
       │  HTTP Response 200 (Allow) or 403       │                                      │
       │◀────────────────────────────────────────┤                                      │
```

#### 10.2.1 挂起管理器与内存映射表
后端维护一个全局活跃审批映射表 `PendingApprovalsMap`，保存挂起状态以及 Promise 的句柄：

```typescript
// 实际: types 在 @neo-companion/shared + services/hook-manager.ts (已实现，形状略异)
// packages/server-local/src/modules/hook/types.ts  (设计草图路径)
export interface PendingApproval {
  requestId: string;
  command: string;
  severity: number;
  resolve: (value: boolean) => void;
  reject: (reason: any) => void;
  timer: NodeJS.Timeout;
}

// 内存挂起队列
export const pendingApprovals = new Map<string, PendingApproval>();
```

#### 10.2.2 路由控制器挂起逻辑
在路由接收对敏感操作的请求时，生成唯一的 `requestId`，并将挂起句柄写入 Map，同时通过 WebSocket 异步推送到 WebView 渲染气泡卡片：

```typescript
// 实际: packages/server-local/src/routes/hooks.ts (已实现)
// packages/server-local/src/modules/hook/routes.ts  (设计草图路径)
import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { pendingApprovals } from './service';

export async function hookRoutes(fastify: FastifyInstance) {
  fastify.post('/api/hook/permission', async (request, reply) => {
    const { command, severity } = request.body as { command: string; severity: number };
    const requestId = uuidv4();
    
    // 实例化 Promise 并在内存中挂起连接
    const approved = await new Promise<boolean>((resolve, reject) => {
      // 自动超时机制，防止死等阻塞客户端
      const timer = setTimeout(() => {
        if (pendingApprovals.has(requestId)) {
          pendingApprovals.delete(requestId);
          resolve(false); // 默认超时为拒绝
        }
      }, 60000); // 60s 自动超时
      
      pendingApprovals.set(requestId, {
        requestId,
        command,
        severity,
        resolve,
        reject,
        timer
      });
      
      // 通过 WebSocket 流式推送到前端
      fastify.websocketServer.clients.forEach((client) => {
        if (client.readyState === 1) { // OPEN
          client.send(JSON.stringify({
            type: 'permission:request',
            payload: { requestId, command, severity }
          }));
        }
      });
    });
    
    if (approved) {
      return reply.code(200).send({ allow: true });
    } else {
      return reply.code(403).send({ allow: false, message: "User denied the operation." });
    }
  });
}
```

#### 10.2.3 WebSocket 审批回应响应流
当用户通过 UI 点击或系统快捷键回应后，WebSocket 连接触发解挂：

```typescript
// 实际: packages/server-local/src/ws-hub.ts + routes/ws.ts (已实现)
// packages/server-local/src/modules/hook/websocket.ts  (设计草图路径)
import { pendingApprovals } from './service';

export function handleWebSocketMessage(message: any) {
  if (message.type === 'permission:response') {
    const { requestId, approved } = message.payload as { requestId: string; approved: boolean };
    
    const pending = pendingApprovals.get(requestId);
    if (pending) {
      // 清除超时定时器
      clearTimeout(pending.timer);
      
      // 解挂 Promise，释放阻塞的 HTTP 连接
      pending.resolve(approved);
      
      // 从全局队列中移除
      pendingApprovals.delete(requestId);
    }
  }
}
```

---

### 10.3 审批交互协议与 WebSocket Schema (WS Protocols)

所有的 Hook 状态通知与审批流，复用 `3.2.2` 中定义的 WebSocket 多路复用协议：

#### 10.3.1 审批请求推送 (Server → Client)
```typescript
interface PermissionRequestMessage {
  type: 'permission:request';
  payload: {
    requestId: string;    // 全局唯一请求 ID (UUID v4)
    command: string;      // 待执行的终端命令或敏感动作
    severity: number;     // 危险等级 (1 - 10)
    source?: string;      // 调用方提供的来源标识
  };
}
```

#### 10.3.2 审批结果回传 (Client → Server)
```typescript
interface PermissionResponseMessage {
  type: 'permission:response';
  payload: {
    requestId: string;    // 与请求 ID 一致
    approved: boolean;    // 是否放行
  };
}
```

#### 10.3.3 事件状态实时变化同步 (Client ↔ Server)
外部 Agent 的微观状态（Thinking, Typing, Success, Error）通过 Hook 主动推送给 Fastify，再流式同步到 WebView 用于 2D 精灵图 拟人化动画状态机：
```typescript
interface HookEventSyncMessage {
  type: 'hook:statusChanged';
  payload: {
    agentId: string;
    state: 'thinking' | 'typing' | 'idle' | 'success' | 'error' | 'juggling';
    description?: string;
  };
}
```

---

### 10.4 全局热键拦截与状态驱动流 (Global Hotkeys Registry) `(Planned — shortcuts.rs 与 usePermissionShortcuts.ts 均未实现)`

为保障极致心流，用户无需点击浮窗，可直接使用全局系统热键 `Ctrl+Shift+Y` (放行) 和 `Ctrl+Shift+N` (拒绝) 响应最新的审批请求。

```
[System Global Shortcut]                     [Tauri Rust Core]                      [Vue WebView]  
           │                                         │                                      │
           │  Press Ctrl+Shift+Y                     │                                      │
           ├────────────────────────────────────────▶│                                      │
           │                                         │ ──┐                                  │
           │                                         │   │ Check active floating window     │
           │                                         │ ◀─┘                                  │
           │                                         │                                      │
           │                                         │   IPC Event: shortcut:approve        │
           │                                         ├─────────────────────────────────────▶│
           │                                         │                                      │  ──┐
           │                                         │                                      │  │ 1. Update Vue UI state
           │                                         │                                      │  │ 2. WS Emit permission:response
           │                                         │                                      │  ◀─┘
```

#### 10.4.1 Tauri Rust Core 全局热键注册
在 Rust Core 的入口中注册快捷键，拦截后向 Vue WebView 派发自定义 Tauri 事件：

```rust
// apps/desktop/src-tauri/src/shortcuts.rs
use tauri::{AppHandle, Manager, GlobalShortcutManager};

pub fn register_shortcuts(app: AppHandle) {
    let mut shortcut_manager = app.global_shortcut_manager();
    
    // 注册快捷键：同意 (Ctrl+Shift+Y)
    let app_clone_y = app.clone();
    shortcut_manager.register("Ctrl+Shift+Y", move || {
        // 广播至所有窗口（或广播至助手窗口专用 Label），防止多窗口事件丢失
        let _ = app_clone_y.emit_all("shortcut:approve", ());
    }).unwrap();

    // 注册快捷键：拒绝 (Ctrl+Shift+N)
    let app_clone_n = app.clone();
    shortcut_manager.register("Ctrl+Shift+N", move || {
        let _ = app_clone_n.emit_all("shortcut:deny", ());
    }).unwrap();
}
```

#### 10.4.2 Vue WebView 热键事件监听与 WS 反射
在 Vue 前端中，通过 `usePermissionShortcuts` 组合式函数订阅这两个全局快捷键事件。当事件被捕获后，WebView 更新自身的 Permission Bubble UI 渲染状态，并生成 WS 消息返回给 Fastify，完美复用现有的 WebSocket 解挂管线：

```typescript
// apps/desktop/src/features/companion/composables/usePermissionShortcuts.ts
import { onMounted, onUnmounted } from 'vue';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useWs } from '@/composables/use-ws';
import { useAssistantStore } from '@/stores/companion';

export function usePermissionShortcuts() {
  const { sendWsMessage } = useWs();
  const companionStore = useAssistantStore();

  let unlistenApprove: Promise<UnlistenFn> | null = null;
  let unlistenDeny: Promise<UnlistenFn> | null = null;

  onMounted(() => {
    // 监听 Tauri 系统级放行快捷键
    unlistenApprove = listen('shortcut:approve', () => {
      const pendingRequests = companionStore.pendingRequests;
      const latestRequest = pendingRequests[pendingRequests.length - 1];
      if (latestRequest) {
        sendWsMessage({
          type: 'permission:response',
          payload: { requestId: latestRequest.requestId, approved: true }
        });
        companionStore.removeRequest(latestRequest.requestId);
      }
    });

    // 监听 Tauri 系统级拒绝快捷键
    unlistenDeny = listen('shortcut:deny', () => {
      const pendingRequests = companionStore.pendingRequests;
      const latestRequest = pendingRequests[pendingRequests.length - 1];
      if (latestRequest) {
        sendWsMessage({
          type: 'permission:response',
          payload: { requestId: latestRequest.requestId, approved: false }
        });
        companionStore.removeRequest(latestRequest.requestId);
      }
    });
  });

  onUnmounted(() => {
    if (unlistenApprove) unlistenApprove.then((fn) => fn());
    if (unlistenDeny) unlistenDeny.then((fn) => fn());
  });
}
```

---

## 11. Privacy & Security

### 11.1 Data Classification

| 分类 | 说明 | 存储位置 | 是否发送至 LLM |
|------|------|----------|----------------|
| 任务数据 | 任务名称、目标、状态 | 本地 SQLite | 是 (作为上下文) |
| 应用事件 | 窗口标题、应用名 | 本地 SQLite | 可选 (用户控制) |
| 对话历史 | 用户与 AI 的对话 | 本地 SQLite | 是 (上下文窗口内) |
| 笔记与任务知识 | Markdown、标签、任务描述 | 本地 SQLite | 启用 Embedding 时发送分块；知识问答时发送召回片段 |
| 全文与向量索引 | FTS5、sqlite-vec | 本地 SQLite | 否 |
| 屏幕内容 | 截图/OCR 结果 | 本地 (临时) | 仅摘要 (v2) |
| API Key | 模型密钥 | 本地加密存储 | 否 |
| 长期记忆 | AI 提取的记忆 | 本地 SQLite | 是 (检索结果) |
| 用户设置 | 偏好配置 | 本地 SQLite | 否 |

### 11.2 LLM Request Filter

发送至外部 LLM 的内容经过过滤管线：

```
用户输入 + 上下文
    │
    ▼
[隐私规则检查] → 命中规则 → 脱敏/跳过
    │
    ▼ (通过)
[Token 预算裁剪]
    │
    ▼
[组装 Prompt]
    │
    ▼
发送至 LLM API
```

### 11.3 User Control

用户可在设置中控制：

- 开关窗口检测
- 开关应用事件记录
- 设置应用黑名单
- 查看将要发送给 AI 的上下文内容
- 独立开关知识库检索和云端 Embedding
- 查看索引模式、失败状态和待重建数量
- 清除所有本地数据
- 导出数据
- 关闭所有感知能力（纯聊天模式）

### 11.4 API Key Storage, Env Override & Dynamic Auth Handshake

为了同时兼顾普通用户的低门槛、高安全性以及开发人员的极简调试，系统采用 **安全钥匙链为主，本地环境变量覆写为辅** 的鉴权配置机制。同时为防止恶意本地应用向 Rust Core 侧发起越权请求，Rust Core 与 Fastify Sidecar 之间引入了**动态单次 Token 鉴权握手机制**：

1. **安全钥匙链加密存储（生产环境）**：
   用户在应用 UI 的“设置”页面中输入的 API Key，通过 Tauri 后端直接调用系统的原生钥匙链（Windows Credential Manager / macOS Keychain / Linux Secret Service）进行高强度加密存取，用户端无感且杜绝本地明文越权。

2. **本地环境变量覆写（开发/测试环境）**：
   系统在初始化模型实例时，优先检查系统变量或本地 `.env` 中的 `DEEPSEEK_API_KEY` 等参数。若检测到配置，则直接覆写并采用此变量。这避免了开发人员调试或 CI/CD 自动化测试时需要通过 GUI 手动设置的麻烦。

3. **动态单次 Token 鉴权握手** `(Partial — 当前由 Node scripts/dev.mjs 生成随机 Token 经 env 变量注入；Rust spawn + stdio pipe 为 Planned)`：
   为防止命令行参数被同用户下的其他进程通过系统工具（如 Windows `wmic` 或 Linux `/proc`）嗅探并越权窃取 Token，Tauri Rust Core 启动 Fastify Sidecar 进程时，**不得在命令行参数中直接包含明文 Token**。
   * **安全传输方案**：Tauri 应在 Spawn 子进程时通过环境内存表注入，或在 Spawn 后立即通过 Stdio Pipe (标准输入流管道) 异步将随机高维 `APP_AUTH_TOKEN` (UUIDv4) 传给 Sidecar，由 Fastify 保存为内存环境变量。
   * **请求验证**：Fastify 调用 Rust Core 任何内部敏感系统端点时，必须在 HTTP Header 中携带 `Authorization: Bearer <APP_AUTH_TOKEN>` 鉴权头进行动态令牌验证，保障网络沙箱完全隔离。

```typescript
// 读取 API Key 的决策模型示例
export async function getApiKey(provider: string): Promise<string> {
  // 1. 优先读取环境变量 (环境隔离，方便开发/CI)
  const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  if (envKey) return envKey;

  // 2. 备选通过 Rust Core 内部 HTTP 端点安全读取 OS 钥匙链 (携带安全 Token)
  const res = await fetch(`${RUST_INTERNAL_URL}/keychain/get`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.APP_AUTH_TOKEN}`
    },
    body: JSON.stringify({ key: `${provider}_api_key` }),
  });
  return await res.text();
}
```

---

## 12. Phased Technical Milestones

### 12.1 v1: Single-Scenario Assistant (最小闭环)

**目标**: 验证"任务启动 → 低打扰陪伴 → 状态反馈 → 完成记录"闭环。

**技术范围**:

| 模块 | v1 范围 |
|------|---------|
| apps/desktop | Tauri 基础框架、Vue UI、系统托盘 |
| apps/desktop | 壁纸窗口 (WorkerW 嵌入)、壁纸状态组件 (天气时间、专注计时) |
| packages/server-local | Fastify 核心、Task/AI/Context/Assistant/Settings 模块（含基础窗口检测、简单任务相关性判断） |
| packages/ai | DeepSeek adapter、基础 Prompt、流式响应 |
| packages/db | 核心 schema (tasks, sessions, conversations, settings) |
| packages/shared | 基础类型定义 |
| packages/ui | 基础组件 |
| crates/ | plugin-window-detect (基础) |

**v1 不做**:
- Web 端
- 完整上下文管道
- 壁纸层完整状态组件（任务清单、伴侣寄语、氛围色调 → v1.5/v2）
- 知识工作空间与向量索引
- 复盘系统
- 屏幕内容获取
- 移动端

### 12.2 v2: Local Knowledge Workspace

**目标**: 完成“记录 → 组织 → 检索 → 引用回答”的本地知识闭环。

**新增技术范围**:

| 模块 | v2 新增 |
|------|---------|
| apps/desktop | v3.3 已交付交互预览版（卡片化项目浏览器、嵌套项目、笔记/看板/任务工作区、双向链接、主题切换）；v2 接入真实后端与检索 |
| packages/server-local | Project/Note/Board/Knowledge 模块、增量索引与 RAG 编排 |
| packages/ai | 聊天模型与 EmbeddingAdapter 分离，OpenAI-compatible Embedding 实现 |
| packages/db | 项目、笔记、看板、统一任务、知识分块、FTS5 与 sqlite-vec 迁移 |
| apps/desktop/src-tauri | Chat / Embedding API Key 的系统凭据读写 |

### 12.3 v3: Knowledge Expansion & Long-term Companion

**目标**: 扩展知识来源和长期个性化，同时保持本地优先、来源可见和用户可撤销。

**新增技术范围**:

| 模块 | v3 新增 |
|------|---------|
| 内容接入 | 指定 Markdown 文件夹同步、PDF 与网页导入 |
| Embedding | 可选本地模型实现，沿用统一 Adapter |
| 记忆系统 | 用户知识与助手长期记忆分区治理、来源与删除控制 |
| 连接能力 | 通用外部状态接入，不绑定特定工具 |

---

## 13. Technical Risks & Mitigations

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Tauri sidecar 打包体积 | Node.js runtime 增加安装包大小 | Node.js SEA 打包为单文件；备选 Bun compile |
| SQLite 并发写入 | 高频事件写入可能冲突 | 使用 WAL 模式；事件批量写入；写操作队列化 |
| sqlite-vec 扩展加载失败 | 当前平台缺少兼容二进制时语义检索不可用 | 启动时能力探测；自动进入 `fts-only`；界面显示状态且允许重试 |
| Embedding Provider 失败 | 新内容无法生成向量 | 保留 pending/failed 状态并指数退避；全文检索和内容编辑不受影响 |
| Embedding 模型或维度变化 | 新旧向量不可比较 | 将旧分块标记为 stale，按模型和维度隔离后重建 |
| 内部端口管理 | Fastify + Rust Core 各需一个 localhost 端口，端口冲突或泄露 | 启动时动态分配可用端口；Rust Core 端口通过环境变量传递给 Sidecar；端口仅绑定 127.0.0.1 |
| LLM API 延迟 | 外部 API 响应慢影响体验 | WebSocket 流式展示；本地缓存常见响应；超时降级 |
| Rust 开发门槛 | 团队需要 Rust 能力 | 将 Rust 范围限制在系统级能力；业务逻辑全部在 TypeScript |
| Sidecar 进程管理 | 子进程异常退出 | 健康检查 + 自动重启；进程守护；错误上报到 UI |
| 屏幕感知隐私 | 用户不信任 | 默认关闭；明确授权 UI；本地处理；不上传原始数据 |
| WorkerW 嵌入稳定性 | 部分 Windows 版本/更新后 WorkerW 行为异常 | 检测可用性后降级为纯悬浮模式；detach 自动回退；参考 Wallpaper Engine 社区修复方案 |
| tauri-plugin-wallpaper 维护风险 | 外部插件可能停止维护 | 插件核心逻辑 ~200 行 Rust 可内化；v1 先依赖，后续按需内化 |

---

## 14. Development Conventions

### 14.1 Branch Strategy

- `main`: 稳定版本
- `dev`: 开发集成
- `feat/*`: 功能分支
- `fix/*`: 修复分支

### 14.2 Naming Conventions

- 包名: `@neo-companion/shared`, `@neo-companion/ai`, etc.
- 文件: kebab-case (`task-service.ts`)
- 类型: PascalCase (`TaskContext`)
- 变量/函数: camelCase (`getActiveWindow`)
- 数据库列: snake_case (`created_at`)

### 14.3 Testing Strategy

- 单元测试: Vitest (packages/ai, server-local modules)
- 集成测试: Vitest + 内存 SQLite (packages/server-local)
- E2E 测试: Playwright (v2+, Web 端)
- 桌面端测试: Tauri 的 WebDriver 支持 (选择性)

---

## 15. Logging & Observability

本地桌面应用缺少远程监控手段，结构化日志是排查问题的主要依据。

### 15.1 Fastify 日志

- 使用 Fastify 内置的 **pino**，输出结构化 JSON 日志
- 日志写入 `app_data_dir()/logs/server-YYYY-MM-DD.log`
- 按天轮转，保留最近 7 天
- 日志级别：生产环境 `info`，开发环境 `debug`

### 15.2 Rust Core 日志

- 使用 **tracing** crate + `tracing-appender`
- 输出到 `app_data_dir()/logs/core-YYYY-MM-DD.log`
- 与 Fastify 日志格式对齐（JSON，含 timestamp + level + module）

### 15.3 错误上报到 UI

- 错误级别日志通过 WebSocket 推送到 WebView（消息类型 `error:log`）
- UI 侧可展示最近错误列表，方便用户反馈问题

---

## 16. Auto-Update

使用 Tauri 的 `@tauri-apps/plugin-updater` 实现应用自动更新：

| 参数 | 值 | 说明 |
|------|-----|------|
| 检查频率 | 每次启动时 + 每 24 小时 | 避免频繁请求 |
| 更新方式 | 用户确认后下载安装 | 不静默更新 |
| 分发方式 | GitHub Releases / 自建静态服务器 | 签名验证 |

更新仅覆盖应用二进制，用户数据目录不受影响。

---

## 17. Summary

NeoCompanion 是一个**本地优先**的桌面 AI 陪伴与知识工作空间。

技术架构核心：

- **Tauri (Rust)** 提供系统级能力和桌面运行时；
- **Fastify (TypeScript)** 作为本地 sidecar 处理业务逻辑和 AI 调度；
- **Vue + Vite** 提供 UI；
- **SQLite + `node:sqlite` + FTS5 + sqlite-vec** 统一存储业务数据与搜索索引；
- **Chat Model Adapter + EmbeddingAdapter** 提供可替换的云端 AI 能力；
- **Knowledge Pipeline** 将项目、笔记和统一任务转化为可检索、可引用的上下文；
- **Context Pipeline** 继续将系统事件转化为结构化任务上下文。

业务数据和索引默认不离开本机，也不需要账户注册。只有用户配置并启用云端 Provider 后，待向量化文本和问答上下文才会发送给对应服务；界面必须明确显示该边界。

架构设计遵循渐进复杂度原则：v1 落地陪伴最小闭环，v2 建立本地知识工作空间，v3 扩展内容来源与本地模型能力。
