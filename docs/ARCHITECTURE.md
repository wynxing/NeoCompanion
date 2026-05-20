# NeoCompanion 系统架构文档

## Document Header

- **Title**: NeoCompanion System Architecture Document
- **Owner**: Engineering
- **Status**: Draft
- **Version**: 1.0
- **Last Updated**: 2026-05-19
- **Audience**: Engineering, Product
- **Related Docs**:
  - [`README.md`](../README.md)
  - [`docs/PRD_overview.md`](./PRD_overview.md)
  - [`docs/具体能力构思.md`](./具体能力构思.md)

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

---

## 2. Architecture Principles

### 2.1 本地优先

NeoCompanion 是一个完全本地运行的桌面应用。

- 数据存储在用户本地；
- 业务逻辑在本地执行；
- 不依赖自建云服务；
- AI 能力通过外部 LLM API 调用，但上下文组装和结果处理在本地完成；
- 用户无需注册账户即可使用（v1）。

### 2.2 隐私可控

- 敏感信息在本地处理，不上传；
- 发送至 LLM 的内容用户可审查和过滤；
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

```
┌─ Tauri App ──────────────────────────────────────────────┐
│                                                            │
│  ┌─ Rust Core ─────────────────────────────────────────┐  │
│  │  窗口检测 │ 应用状态事件 │ 屏幕感知 │ 系统托盘      │  │
│  │  Sidecar 生命周期管理 │ 文件系统访问 │ LanceDB 向量  │  │
│  │  Internal HTTP Server (localhost:RUST_PORT)          │  │
│  └────────┬───────────────────────────────┬─────────┘  │
│           │ Tauri IPC (invoke / events)    │              │
│  ┌─ WebView (React) ──────────────────┐   │              │
│  │  陪伴 UI │ 对话面板 │ 任务面板 │ 设置│   │              │
│  │  Zustand (状态) │ TanStack Query   │   │              │
│  └──────────────────┬─────────────────┘   │              │
│                     │ HTTP (localhost:PORT) │              │
│  ┌─ Fastify Sidecar ──────────────────────┘              │
│  │  业务逻辑 │ AI 调度 │ 上下文管道 │ SQLite              │
│  │  Task │ Context │ Memory │ Review │ Settings           │
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

### 3.2 Communication Patterns

| 通信路径 | 协议 | 用途 |
|----------|------|------|
| WebView ↔ Rust Core | Tauri IPC (`invoke` / `listen`) | 系统级能力调用、事件订阅 |
| WebView → Fastify | HTTP (fetch + TanStack Query) | 业务请求 (CRUD) |
| WebView ↔ Fastify | WebSocket (`ws://localhost:PORT/ws`) | AI 流式响应、陪伴反馈推送、实时事件 |
| Fastify → Rust Core | HTTP (`localhost:RUST_PORT`, internal) | 系统级能力调用（向量检索等）。**内部实现通道，非业务 API** |
| Fastify → LLM API | HTTPS | 外部模型调用 |
| Rust Core → Fastify | HTTP (localhost) | 系统事件推送 (窗口切换等) |

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
  | 'companion:feedback'   // 陪伴反馈推送
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

### 3.3 Capability Model → Technical Module Mapping

| 产品能力层 | 技术模块 | 所在包 |
|-----------|----------|--------|
| Companion Layer | 陪伴 UI + 状态反馈逻辑 | `apps/desktop`, `packages/server-local` |
| Context Layer | 上下文管道 + Rust 感知 | `packages/server-local` (v1 内联), `crates/` |
| Workflow Layer | 任务服务 + AI 辅助 | `packages/server-local`, `packages/ai` |
| Growth Layer | 复盘服务 + 数据分析 | `packages/server-local`, `packages/db` |
| System Layer | Tauri 运行时 + 同步 (v3) | `apps/desktop`, `crates/` |

---

## 4. Monorepo Structure

```
neo-companion/
├── apps/
│   ├── desktop/                # Tauri + React 桌面应用
│   │   ├── src/                # React 前端源码
│   │   ├── src-tauri/          # Tauri Rust 后端
│   │   │   ├── src/
│   │   │   ├── Cargo.toml
│   │   │   └── tauri.conf.json
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   └── web/                    # Web 管理端 (v2+)
│       ├── src/
│       ├── vite.config.ts
│       └── package.json
├── packages/
│   ├── server-local/           # Fastify 本地服务 (sidecar)
│   │   ├── src/
│   │   │   ├── modules/        # 业务模块 (task, context, ai, companion, memory, review, settings)
│   │   │   ├── plugins/        # Fastify 插件
│   │   │   └── index.ts        # 入口
│   │   └── package.json
│   ├── shared/                 # 类型、校验、常量
│   │   ├── src/
│   │   │   ├── types/          # TypeScript 类型定义
│   │   │   ├── validators/     # Zod schema
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
│   │   │   ├── schema/         # Drizzle schema 定义
│   │   │   ├── migrations/     # 迁移文件
│   │   │   ├── queries/        # 查询封装
│   │   │   └── index.ts
│   │   └── package.json
│   └── ui/                     # 共享 UI 组件
│       ├── src/
│       │   └── components/     # shadcn 组件 (desktop + web 复用)
│       ├── tailwind.config.ts
│       └── package.json
├── crates/                     # Tauri Rust 插件
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
apps/desktop → packages/ui, packages/shared
apps/web     → packages/ui, packages/shared
packages/server-local → packages/ai, packages/db, packages/shared
packages/ai → packages/shared
packages/db → packages/shared
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
| `packages/shared/src/types/` | 跨包共享的 DTO、API 请求/响应类型、枚举 | `TaskStatus`, `ApiResponse<T>`, `CompanionStatus` |
| `packages/shared/src/validators/` | 跨包共享的运行时校验 (Zod schema) | `createTaskSchema`, `settingsSchema` |
| `server-local/modules/context/models/` | 上下文模型类型 (v1 单一真相源，v2 抽离为 `packages/context-engine`) | `TaskContext`, `BehaviorContext`, `FullContext` |
| `packages/ai/src/adapters/types.ts` | AI 相关接口类型 | `ModelAdapter`, `ChatParams`, `ChatChunk` |
| `packages/db/src/schema/` | 数据库表结构类型 (Drizzle 推断) | `typeof tasks.$inferSelect` |
| `server-local/modules/*/schema.ts` | 请求参数验证 schema (不定义业务模型) | Fastify JSON Schema |

**原则**: 业务模型类型由拥有该领域逻辑的包定义，`shared` 只放"多包都需要导入"的公共类型。避免在 `shared` 中堆积所有接口。

---

## 5. Desktop Architecture (Tauri)

### 5.1 Rust Core 职责

Rust 侧只负责 WebView 和 Node.js 无法直接完成的系统级能力：

| 能力 | 说明 | 阶段 |
|------|------|------|
| 窗口检测 | 获取当前活跃窗口标题、进程名、应用类型 | v1 |
| 系统托盘 | 常驻托盘图标、快捷菜单 | v1 |
| 全局快捷键 | 唤醒/隐藏/快速操作 | v1 |
| Sidecar 管理 | 启动/停止 Fastify 进程、健康检查 | v1 |
| 应用切换事件 | 监听焦点变化、推送事件到 Fastify | v1 |
| 屏幕内容获取 | 用户授权下截图/OCR (v2) | v2 |
| 选中文本提取 | 获取用户选中内容 (v2) | v2 |
| 文件系统监听 | 监听指定目录变化 (v2) | v2 |
| 内部 HTTP 端点 | 暴露 localhost-only 系统能力接口供 Fastify 调用（如 LanceDB 向量操作、钥匙链读取）。**内部实现通道，不承载业务逻辑** | v1 |

### 5.2 Tauri IPC 接口设计

```rust
// src-tauri/src/commands.rs

#[tauri::command]
fn get_active_window() -> Result<WindowInfo, String> { ... }

#[tauri::command]
fn get_running_apps() -> Result<Vec<AppInfo>, String> { ... }

#[tauri::command]
fn start_sidecar(port: u16) -> Result<(), String> { ... }

#[tauri::command]
fn stop_sidecar() -> Result<(), String> { ... }

#[tauri::command]
fn set_tray_status(status: CompanionStatus) -> Result<(), String> { ... }
```

### 5.3 Sidecar 生命周期

```
Tauri App 启动
    │
    ├─ 1. Rust 初始化 (托盘、快捷键、事件监听)
    │
    ├─ 2. 启动 Fastify Sidecar (子进程)
    │      ├─ 选择可用端口
    │      ├─ 启动 Node.js 进程
    │      └─ 健康检查 (GET /health)
    │
    ├─ 3. WebView 加载 React 应用
    │      └─ 连接本地 Fastify (localhost:PORT)
    │
    └─ App 退出时
           └─ 关闭 Sidecar 进程
```

### 5.4 WebView (React) 架构

```
src/
├── app/
│   ├── routes/              # React Router 页面
│   │   ├── companion/       # 主陪伴界面
│   │   ├── chat/            # 对话面板
│   │   ├── tasks/           # 任务面板
│   │   ├── review/          # 复盘面板
│   │   └── settings/        # 设置
│   ├── layout.tsx           # 应用布局
│   └── router.tsx           # 路由配置
├── features/                # 按功能组织
│   ├── companion/           # 陪伴相关组件和逻辑
│   ├── task/                # 任务相关
│   ├── chat/                # 对话相关
│   └── context/             # 上下文展示
├── stores/                  # Zustand stores
│   ├── companion.ts         # 陪伴状态
│   ├── task.ts              # 任务状态
│   └── settings.ts          # 设置状态
├── hooks/                   # 自定义 hooks
│   ├── use-tauri.ts         # Tauri IPC 封装
│   ├── use-api.ts           # TanStack Query hooks
│   └── use-ws.ts            # WebSocket 消息订阅 hooks
├── lib/
│   ├── api-client.ts        # Fastify HTTP 客户端 (CRUD)
│   ├── ws-client.ts         # WebSocket 连接管理 (重连、心跳、消息分发)
│   └── platform.ts          # 平台抽象层
└── main.tsx
```

### 5.5 Feature Ownership (前后端分工)

| 功能 | 前端 (WebView) | 后端 (Fastify) |
|------|---------------|---------------|
| Companion | UI 渲染、动画、状态展示 | 反馈决策逻辑 (何时触发、触发什么类型) |
| Task | 任务列表 UI、拖拽交互 | 任务状态机、CRUD、关联数据 |
| Chat | 消息列表渲染、输入框、WebSocket 消息消费 | 上下文组装、AI 调度、WS 流式推送 |
| Context | 当前状态展示（可选 debug 面板） | 管道编排、事件处理、建模 |

**判断标准**:
- 仅依赖 UI 状态 → 前端 (Zustand store)
- 依赖任务数据 / 上下文 / AI → 后端 (server module)
- v1 陪伴反馈逻辑简单时可暂时纯前端，复杂化后迁移到后端

---

## 6. Local Backend (Fastify)

### 6.1 Overview

Fastify 作为本地 sidecar 进程运行，提供 HTTP API 供 WebView 调用。选型理由：高性能、插件式模块隔离、TypeScript-first、JSON Schema 内置验证。

### 6.2 Module Structure

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
│   ├── memory/
│   │   ├── routes.ts        # /api/memory/*
│   │   ├── service.ts       # 记忆 CRUD + 向量检索
│   │   └── schema.ts
│   ├── event/
│   │   ├── routes.ts        # /api/events/*
│   │   └── service.ts       # 应用事件记录
│   ├── companion/
│   │   ├── routes.ts        # /api/companion/*
│   │   └── service.ts       # 陪伴反馈决策 (任务状态机、反馈规则)
│   ├── review/
│   │   ├── routes.ts        # /api/review/*
│   │   └── service.ts       # 复盘生成
│   └── settings/
│       ├── routes.ts        # /api/settings/*
│       └── service.ts       # 用户设置、模型配置
└── plugins/
    ├── db.ts                # SQLite 连接插件
    ├── websocket.ts         # WebSocket 连接管理 (@fastify/websocket)
    ├── cors.ts              # CORS (localhost)
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
| `modules/memory/service.ts` | `packages/db` (queries) | 调用 db 包的向量检索封装 |
| `modules/review/service.ts` | `packages/ai` + `packages/db` | 聚合数据后调用 AI 生成复盘 |

**判断标准**: 逻辑是否可能被多个 consumer 复用？是 → 抽为独立 package；否 → 直接写在 module service 中。

### 6.3 Core API Routes

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | `/health` | 健康检查 | v1 |
| POST | `/api/ai/chat` | AI 对话 (通过 WebSocket 流式推送) | v1 |
| GET | `/api/tasks` | 任务列表 | v1 |
| POST | `/api/tasks` | 创建任务 | v1 |
| PATCH | `/api/tasks/:id` | 更新任务状态 | v1 |
| POST | `/api/events` | 写入应用事件 | v1 |
| GET | `/api/context/current` | 获取当前任务上下文 | v1 |
| GET | `/api/memory/search` | 向量检索记忆 | v2 |
| POST | `/api/memory` | 写入记忆 | v2 |
| GET | `/api/review/daily` | 获取日复盘 | v2 |
| GET | `/api/settings` | 获取设置 | v1 |
| PUT | `/api/settings` | 更新设置 | v1 |

### 6.4 Sidecar 打包策略

Fastify sidecar 需要作为独立可执行文件随 Tauri 应用分发，无需用户预装 Node.js。

**首选方案**: Node.js SEA (Single Executable Applications)

Node.js 21+ 内置 SEA 支持，可将 JS bundle 嵌入 Node.js 二进制生成单个可执行文件。构建流程：

```
esbuild bundle (server-local → 单文件 JS)
    → Node.js SEA 注入 (生成平台可执行文件)
    → Tauri externalBin 分发
```

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
  apiKey: string;
  baseUrl?: string;         // 自定义端点
  model: string;            // 模型名称
  isDefault: boolean;
}
```

内置 DeepSeek 作为默认，用户可添加其他模型。API Key 存储在本地 SQLite 中（加密存储）。

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
| 向量记忆 | 写入正常（embedding 生成暂停，排队等待恢复），检索使用已有索引 |

**设计原则**: AI 是增强能力，不是核心流程的阻塞依赖。用户在离线时仍能完成任务管理和专注跟踪。

---

## 8. Context Pipeline

Context Pipeline 是 NeoCompanion 的核心差异化模块，负责将分散的系统事件、应用状态和用户行为转化为结构化的任务上下文。

### 8.1 Pipeline Architecture

```
┌─ Rust Core ──────────────────────────────┐     ┌─ Fastify ──────────────────────────────────────┐
│  窗口检测    应用事件    屏幕感知        │     │                                                 │
│                                          │────▶│  Collector → Processor → Model → Store         │
│  ▲ Internal HTTP (vector write/search)   │     │      │           │          │        │          │
│  │                                       │◀────│      ▼           ▼          ▼        ▼          │
│  └─ LanceDB 向量数据库                   │     │   原始事件    结构化数据   上下文模型  SQLite     │
└──────────────────────────────────────────┘     │                                  (关系型元数据) │
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
   - 长期记忆的语义文本写入 SQLite memories 表，同时通过内部 HTTP 端点将其对应的向量特征 (embedding) 写入 Rust Core 侧的 LanceDB 向量数据库进行索引

5. 消费 (Consume)
   - AI 对话时，通过内部 HTTP 端点在 Rust Core 侧的 LanceDB 中执行语义检索，获取匹配的记忆 ID，并从 SQLite 中拉取对应记忆文本注入上下文
   - 任务恢复时查询历史上下文和最近应用事件
   - 复盘时聚合分析上下文与统计数据
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
  relevantMemories: string[];   // 向量检索结果
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

- **SQLite**: 本地关系型存储，零配置、单文件、高性能读写
- **LanceDB (Rust Core, 内部通道)**: 嵌入式向量数据库，运行在 Rust Core 中，Fastify 通过 localhost 内部 HTTP 端点访问
- **Drizzle ORM**: TypeScript-first ORM，类型安全、轻量

### 9.2 Core Schema

```typescript
// packages/db/src/schema/index.ts

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// 任务
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  goal: text('goal'),
  status: text('status').notNull().default('pending'),
  // 'pending' | 'in_progress' | 'paused' | 'completed' | 'cancelled'
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
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

// 长期记忆 (关系型元数据，向量与语义检索在 Rust Core 侧的 LanceDB 执行)
export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  category: text('category').notNull(),
  // 'task_pattern' | 'user_preference' | 'knowledge' | 'context_snapshot'
  createdAt: text('created_at').notNull(),
  lastAccessedAt: text('last_accessed_at'),
  accessCount: integer('access_count').default(0),
});

// 复盘
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

### 9.3 Vector Storage (LanceDB in Rust Core)

语义记忆的向量存储与相似度检索使用 **LanceDB**，内嵌在 **Tauri Rust Core** 中，规避 Node.js 原生 C 库在 Sidecar 跨平台分发时的兼容性问题。

SQLite 负责保存记忆的元数据和文本（`memories` 表），Rust 侧的 LanceDB 负责存储 `(id, embedding)` 索引并处理语义查询。

Fastify 通过 Rust Core 的 **localhost-only 内部 HTTP 端点** 访问 LanceDB。该端点是内部实现通道，不对外暴露，不承载业务逻辑。

#### 9.3.1 Rust Core 内部 HTTP 端点

Rust 侧使用 axum 启动一个轻量 HTTP server，绑定 `127.0.0.1:RUST_PORT`，仅暴露向量操作接口：

```rust
// src-tauri/src/internal_api.rs
use axum::{Router, Json, routing::post, extract::State};
use lancedb::{connect, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Serialize, Deserialize, Clone)]
pub struct Record {
    pub id: String,
    pub vector: Vec<f32>,
}

#[derive(Deserialize)]
pub struct InsertRequest { id: String, vector: Vec<f32> }

#[derive(Deserialize)]
pub struct SearchRequest { query_vector: Vec<f32>, limit: usize }

pub fn router(db: Arc<Connection>) -> Router {
    Router::new()
        .route("/vectors/insert", post(insert_vector))
        .route("/vectors/search", post(search_vectors))
        .with_state(db)
}

async fn insert_vector(
    State(db): State<Arc<Connection>>,
    Json(req): Json<InsertRequest>,
) -> Result<Json<()>, String> {
    let table = db.open_table("memories").await.map_err(|e| e.to_string())?;
    let records = vec![Record { id: req.id, vector: req.vector }];
    table.add(records).await.map_err(|e| e.to_string())?;
    Ok(Json(()))
}

async fn search_vectors(
    State(db): State<Arc<Connection>>,
    Json(req): Json<SearchRequest>,
) -> Result<Json<Vec<String>>, String> {
    let table = db.open_table("memories").await.map_err(|e| e.to_string())?;
    let results = table.search(req.query_vector).limit(req.limit)
        .execute().await.map_err(|e| e.to_string())?;
    let ids = results.iter().map(|r| r.id.clone()).collect();
    Ok(Json(ids))
}
```

**端点范围严格限定**：v2 仅 `POST /vectors/insert` 和 `POST /vectors/search`，未来可按需扩展少量系统级能力。

#### 9.3.2 Fastify 侧的消费逻辑

Fastify 通过 HTTP 调用 Rust Core 内部端点完成向量操作，然后从 SQLite 拉取文本内容：

```typescript
// packages/server-local/src/modules/memory/service.ts

const RUST_INTERNAL_URL = `http://127.0.0.1:${process.env.RUST_PORT}`;

export async function querySemanticMemories(queryEmbedding: number[], limit = 5) {
  // 1. 通过内部 HTTP 端点调用 Rust Core 侧的 LanceDB 检索
  const res = await fetch(`${RUST_INTERNAL_URL}/vectors/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query_vector: queryEmbedding, limit }),
  });
  const matchedIds: string[] = await res.json();

  if (matchedIds.length === 0) return [];

  // 2. 从 SQLite 中获取对应记忆文本
  return db.select()
    .from(memories)
    .where(inArray(memories.id, matchedIds));
}
```

#### 9.3.3 Embedding 生成策略

向量记忆需要将文本转化为 embedding 向量。生成策略如下：

- **v2**：复用已配置的 LLM provider 的 embedding API（如 DeepSeek / OpenAI embedding 端点），在 Fastify 侧的 `packages/ai` 中调用，生成后通过内部 HTTP 端点写入 Rust Core 的 LanceDB
- **v3（可选）**：预留本地 embedding 模型接口（ONNX Runtime），但 v2 不实现

```typescript
// packages/ai/src/adapters/types.ts

export interface EmbeddingAdapter {
  readonly id: string;
  embed(texts: string[]): Promise<number[][]>;
  dimensions: number;
}
```

### 9.4 Data Location

```
用户数据目录 (Tauri app data):
├── neo-companion.db          # 主 SQLite 数据库
├── neo-companion.db-wal      # WAL 日志
├── lancedb/                  # LanceDB 向量数据 (v2+)
├── logs/                     # 结构化日志文件
│   ├── server-YYYY-MM-DD.log # Fastify 日志 (pino JSON)
│   └── core-YYYY-MM-DD.log   # Rust Core 日志 (tracing JSON)
└── backups/                  # 定期自动备份
```

数据目录由 Tauri 的 `app_data_dir()` 管理，跨平台统一。

### 9.5 Migration Strategy

使用 Drizzle Kit 管理数据库迁移：

```bash
pnpm --filter db drizzle-kit generate  # 生成迁移
pnpm --filter db drizzle-kit migrate   # 执行迁移
```

应用启动时自动检查并执行待应用的迁移。

---

## 10. Privacy & Security

### 10.1 Data Classification

| 分类 | 说明 | 存储位置 | 是否发送至 LLM |
|------|------|----------|----------------|
| 任务数据 | 任务名称、目标、状态 | 本地 SQLite | 是 (作为上下文) |
| 应用事件 | 窗口标题、应用名 | 本地 SQLite | 可选 (用户控制) |
| 对话历史 | 用户与 AI 的对话 | 本地 SQLite | 是 (上下文窗口内) |
| 屏幕内容 | 截图/OCR 结果 | 本地 (临时) | 仅摘要 (v2) |
| API Key | 模型密钥 | 本地加密存储 | 否 |
| 长期记忆 | AI 提取的记忆 | 本地 SQLite | 是 (检索结果) |
| 用户设置 | 偏好配置 | 本地 SQLite | 否 |

### 10.2 LLM Request Filter

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

### 10.3 User Control

用户可在设置中控制：

- 开关窗口检测
- 开关应用事件记录
- 设置应用黑名单
- 查看将要发送给 AI 的上下文内容
- 清除所有本地数据
- 导出数据
- 关闭所有感知能力（纯聊天模式）

### 10.4 API Key Storage & Env Override

为了同时兼顾普通用户的低门槛、高安全性以及开发人员的极简调试，系统采用 **安全钥匙链为主，本地环境变量覆写为辅** 的鉴权配置机制：

1. **安全钥匙链加密存储（生产环境）**：
   用户在应用 UI 的“设置”页面中输入的 API Key，通过 Tauri 后端直接调用系统的原生钥匙链（Windows Credential Manager / macOS Keychain / Linux Secret Service）进行高强度加密存取，用户端无感且杜绝本地明文越权。

2. **本地环境变量覆写（开发/测试环境）**：
   系统在初始化模型实例时，优先检查系统变量或本地 `.env` 中的 `DEEPSEEK_API_KEY` 等参数。若检测到配置，则直接覆写并采用此变量。这避免了开发人员调试或 CI/CD 自动化测试时需要通过 GUI 手动设置的麻烦。

```typescript
// 读取 API Key 的决策模型示例
export async function getApiKey(provider: string): Promise<string> {
  // 1. 优先读取环境变量 (环境隔离，方便开发/CI)
  const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  if (envKey) return envKey;

  // 2. 备选通过 Rust Core 内部 HTTP 端点安全读取 OS 钥匙链
  const res = await fetch(`${RUST_INTERNAL_URL}/keychain/get`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: `${provider}_api_key` }),
  });
  return await res.text();
}
```

---

## 11. Phased Technical Milestones

### 11.1 v1: Single-Scenario Companion (最小闭环)

**目标**: 验证"任务启动 → 低打扰陪伴 → 状态反馈 → 完成记录"闭环。

**技术范围**:

| 模块 | v1 范围 |
|------|---------|
| apps/desktop | Tauri 基础框架、React UI、系统托盘 |
| packages/server-local | Fastify 核心、Task/AI/Context/Companion/Settings 模块（含基础窗口检测、简单任务相关性判断） |
| packages/ai | DeepSeek adapter、基础 Prompt、流式响应 |
| packages/db | 核心 schema (tasks, sessions, conversations, settings) |
| packages/shared | 基础类型定义 |
| packages/ui | 基础组件 |
| crates/ | plugin-window-detect (基础) |

**v1 不做**:
- Web 端
- 完整上下文管道
- 向量记忆
- 复盘系统
- 屏幕内容获取
- 移动端

### 11.2 v2: Multi-Scenario Context Collaboration

**目标**: 完整上下文理解 + 跨应用协作 + Web 管理端。

**新增技术范围**:

| 模块 | v2 新增 |
|------|---------|
| apps/web | Web 管理端 (复盘看板、设置、历史) |
| packages/server-local | Context/Memory/Review/Event 模块完整实现 |
| packages/ai | 多模型支持、上下文压缩、记忆提取 |
| packages/context-engine | 从 server-local 抽离为独立包，完整管道 (采集→处理→建模→存储→消费) |
| packages/db | 关系表、events 表、reviews 表、迁移 |
| crates/ | plugin-screen-context, plugin-app-events |

### 11.3 v3: Personal AI Workflow Companion System

**目标**: 多端协同 + 可控执行 + 完整记忆。

**新增技术范围**:

| 模块 | v3 新增 |
|------|---------|
| 移动端 | Tauri v2 Mobile (iOS/Android) |
| 云同步 | 可选云服务、增量同步、冲突处理 |
| 执行层 | 用户确认下的轻量自动化动作 |
| 记忆系统 | 完整长期记忆、用户画像、个性化策略 |
| 连接能力 | 外部工具状态接入 |

---

## 12. Technical Risks & Mitigations

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Tauri sidecar 打包体积 | Node.js runtime 增加安装包大小 | Node.js SEA 打包为单文件；备选 Bun compile |
| SQLite 并发写入 | 高频事件写入可能冲突 | 使用 WAL 模式；事件批量写入；写操作队列化 |
| LanceDB Rust 编译与多端分发风险 | Rust 核心集成 LanceDB 导致跨端编译问题 | 锁定稳定的 Rust/LanceDB 库版本，在 CI 中统一多平台交叉编译 Target，预打包静态库 |
| 内部端口管理 | Fastify + Rust Core 各需一个 localhost 端口，端口冲突或泄露 | 启动时动态分配可用端口；Rust Core 端口通过环境变量传递给 Sidecar；端口仅绑定 127.0.0.1 |
| LLM API 延迟 | 外部 API 响应慢影响体验 | WebSocket 流式展示；本地缓存常见响应；超时降级 |
| Rust 开发门槛 | 团队需要 Rust 能力 | 将 Rust 范围限制在系统级能力；业务逻辑全部在 TypeScript |
| Sidecar 进程管理 | 子进程异常退出 | 健康检查 + 自动重启；进程守护；错误上报到 UI |
| 屏幕感知隐私 | 用户不信任 | 默认关闭；明确授权 UI；本地处理；不上传原始数据 |

---

## 13. Development Conventions

### 13.1 Branch Strategy

- `main`: 稳定版本
- `dev`: 开发集成
- `feat/*`: 功能分支
- `fix/*`: 修复分支

### 13.2 Naming Conventions

- 包名: `@neo-companion/shared`, `@neo-companion/ai`, etc.
- 文件: kebab-case (`task-service.ts`)
- 类型: PascalCase (`TaskContext`)
- 变量/函数: camelCase (`getActiveWindow`)
- 数据库列: snake_case (`created_at`)

### 13.3 Testing Strategy

- 单元测试: Vitest (packages/ai, server-local modules)
- 集成测试: Vitest + 内存 SQLite (packages/server-local)
- E2E 测试: Playwright (v2+, Web 端)
- 桌面端测试: Tauri 的 WebDriver 支持 (选择性)

---

## 14. Logging & Observability

本地桌面应用缺少远程监控手段，结构化日志是排查问题的主要依据。

### 14.1 Fastify 日志

- 使用 Fastify 内置的 **pino**，输出结构化 JSON 日志
- 日志写入 `app_data_dir()/logs/server-YYYY-MM-DD.log`
- 按天轮转，保留最近 7 天
- 日志级别：生产环境 `info`，开发环境 `debug`

### 14.2 Rust Core 日志

- 使用 **tracing** crate + `tracing-appender`
- 输出到 `app_data_dir()/logs/core-YYYY-MM-DD.log`
- 与 Fastify 日志格式对齐（JSON，含 timestamp + level + module）

### 14.3 错误上报到 UI

- 错误级别日志通过 WebSocket 推送到 WebView（消息类型 `error:log`）
- UI 侧可展示最近错误列表，方便用户反馈问题

---

## 15. Auto-Update

使用 Tauri 的 `@tauri-apps/plugin-updater` 实现应用自动更新：

| 参数 | 值 | 说明 |
|------|-----|------|
| 检查频率 | 每次启动时 + 每 24 小时 | 避免频繁请求 |
| 更新方式 | 用户确认后下载安装 | 不静默更新 |
| 分发方式 | GitHub Releases / 自建静态服务器 | 签名验证 |

更新仅覆盖应用二进制，用户数据目录不受影响。

---

## 16. Summary

NeoCompanion 是一个**完全本地运行**的桌面 AI 陪伴系统。

技术架构核心：

- **Tauri (Rust)** 提供系统级能力和桌面运行时；
- **Fastify (TypeScript)** 作为本地 sidecar 处理业务逻辑和 AI 调度；
- **React + Vite** 提供 UI；
- **SQLite (关系型元数据) + LanceDB (向量数据，运行在 Rust Core 中，Fastify 通过内部 HTTP 通道访问)** 本地存储全部数据；
- **外部 LLM API (DeepSeek)** 提供 AI 能力，用户可自定义模型；
- **Context Pipeline** 将系统事件转化为结构化任务上下文，是核心差异化模块。

所有数据不离开用户本地，不依赖云服务，不需要账户注册。

架构设计遵循渐进复杂度原则：v1 只落地最小闭环，v2 扩展完整上下文和 Web 端，v3 引入多端和执行层。
