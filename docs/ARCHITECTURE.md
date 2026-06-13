# NeoAssistant 系统架构文档

## Document Header

- **Title**: NeoAssistant System Architecture Document
- **Owner**: Engineering
- **Status**: Draft (Aligned with Concept v3.0 / PRD v3.2)
- **Version**: 1.2
- **Last Updated**: 2026-06-12
- **Audience**: Engineering, Product
- **Related Docs**:
  - [`README.md`](../README.md)
  - [`docs/PRD_overview.md`](./PRD_overview.md)
  - [`docs/具体能力构思.md`](./具体能力构思.md)
  - [`docs/WALLPAPER_STATUS_LAYER.md`](./WALLPAPER_STATUS_LAYER.md)

---

## 1. Document Purpose

本文档定义 NeoAssistant 的系统架构、技术选型、模块划分、数据流和工程实现方案。

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

NeoAssistant 是一个完全本地运行的桌面应用。

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

系统提供三种灵活的挂载拓扑，以满足本地低门槛开发、绝对高安全零端口冲突、以及跨物理机算力卸载等多样化极客场景：

#### 模式 A：本地 TCP 端口挂载 (默认模式 - Local TCP Port)
*最便利的 Web 级开发与浏览器调试生态，兼容性最佳。*

```
┌─ Tauri App ──────────────────────────────────────────────┐
│                                                            │
│  ┌─ Rust Core ─────────────────────────────────────────┐  │
│  │  窗口检测 │ 应用状态事件 │ 屏幕感知 │ 系统托盘      │  │
│  │  Sidecar 生命周期管理 │ 文件系统访问 │ LanceDB 向量  │  │
│  │  Internal HTTP Server (localhost:RUST_PORT)          │  │
│  └────────┬───────────────────────────────┬─────────┘  │
│           │ Tauri IPC (invoke / events)    │              │
│  ┌─ WebView (Vue) ────────────────────┐   │              │
│  │  陪伴 UI │ 对话面板 │ 任务面板 │ 设置│   │              │
│  │  壁纸状态层 │ Hook角标              │   │              │
│  │  Pinia (状态) │ TanStack Query     │   │              │
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

#### 模式 B：零端口本地域套接字挂载 (Zero-Port IPC Socket)
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
│  │  助手 UI │ 对话面板 │ 任务面板 │ 设置│   │                   │
│  │  api-client (UDS Adapter 适配器)   │   │                   │
│  └────────────────────────────────────┘   │                   │
│                                           ▼                   │
│  ┌─ Fastify Sidecar (绑定 UDS / 零端口) ────────────────────┐ │
│  │  业务逻辑 │ AI 调度 │ 上下文管道 │ SQLite                  │ │
│  │  (监听 unix:neo-companion.sock)                          │ │
│  │  ▲ 调用系统向量库 → 请求 unix:neo-core.sock (axum 侧)      │ │
│  └──────────────────┬───────────────────────────────────────┘ │
│                     │                                         │
└─────────────────────┼─────────────────────────────────────────┘
                      │ HTTPS (外部)
                ┌─────▼──────────┐
                │  LLM API       │
                └────────────────┘
```

#### 模式 C：分布式远程宿主挂载 (Distributed Remote Hosting)
*将繁重的 SQLite 读写与 LanceDB 向量检索卸载至 NAS 或私有云服务器，降低工作机负载。*

```
┌─ Local Client (本地 Tauri 客户端) ───────────────────────────┐
│                                                               │
│  ┌─ Rust Core (仅做轻量级本地系统事件抓取) ───────────┐        │
│  │  本地窗口检测 │ 系统托盘管理 │ 快捷键拦截             │        │
│  └────────┬───────────────────────────────────────────┘        │
│           │ Tauri IPC Event                                   │
│  ┌────────▼───────────────────────────────────────────┐        │
│  │  WebView (Vue)                                     │        │
│  │  api-client (Remote HTTP/WS Adapter + JWT 授权头)  │        │
│  └────────┬───────────────────────────────────────────┘        │
│           │                                                   │
└───────────┼───────────────────────────────────────────────────┘
            │
            │  HTTPS + WSS / JWT 握手安全连接 (局域网/公网)
            ▼
┌─ Remote Server (模式 C - 远程宿主机如 NAS/私有云) ────────────┐
│                                                               │
│  ┌─ Fastify Server (远程自持运行服务) ───────────────────────┐ │
│  │  业务逻辑主核 │ AI 编排 │ 上下文管道                         │ │
│  │  Drizzle SQLite 关系型数据库 (远程 .db 文件)              │ │
│  │  Node 原生 LanceDB 向量数据库 (本地依赖无编译打包体积限制)  │ │
│  └──────────────────┬───────────────────────────────────────┘ │
│                     │                                         │
└─────────────────────┼─────────────────────────────────────────┘
                      │ HTTPS (外部)
                ┌─────▼──────────┐
                │  LLM API       │
                └────────────────┘
```

---

### 3.2 Communication Patterns

系统采用多挂载统一抽象层，三种模式下各通道的物理路由与网络流向如下表所示：

| 通信路径 | 模式 A (本地 TCP Port) | 模式 B (零端口 UDS Socket) | 模式 C (远程宿主 Hosting) |
|---|---|---|---|
| **WebView → Fastify (API 请求)** | HTTP 请求 (`fetch` 协议)<br>目标: `http://localhost:PORT` | Tauri Rust IPC Bridge<br>WebView 调 `uds_request`<br>Rust 转发至 `neo-companion.sock` | HTTPS 请求 (`fetch` 协议)<br>目标: 远程 NAS URL<br>附带 JWT 握手鉴权头 |
| **WebView ↔ Fastify (实时推送)** | 标准 WebSocket 连接<br>目标: `ws://localhost:PORT/ws` | **Tauri 原生事件广播机制**<br>无需网络和 WS 代理转换。WebView 通过 `tauri::event::listen` 订阅；Fastify 通过 UDS 向 Rust Core 写入推送，由 Rust Core 原生广播 | 安全 WSS 握手加密连接<br>目标: `wss://REMOTE_IP/ws`<br>附带 JWT 安全校验 |
| **Fastify → Rust Core (系统向量检索)** | **无跨进程向量调用**<br>本地 Fastify 直接进程内调用 TS/WASM (hnswlib/MiniSearch) 完成向量检索 | **无跨进程向量调用**<br>本地 Fastify 直接进程内调用 TS/WASM (hnswlib/MiniSearch) 完成向量检索 | **无需跨机调用 Rust Core**<br>远程 Fastify 直接本地加载并读写 Node 版 `@lancedb/lancedb` |
| **Rust Core → Fastify (系统事件同步)** | 内部 HTTP 推送<br>目标: `http://localhost:PORT/events` | UDS 套接字文件直写<br>目标: `neo-companion.sock` | 本地 WebView 拦截 Rust 事件，通过安全 HTTPS 转推远端服务器 |
| **外部 Hook 注入 (如 OpenClaw)** | HTTP POST 推送<br>目标: `/api/hook/push` | **File Watcher Hook** (免网络文件监听)<br>或直连 `neo-companion.sock` | HTTPS 推送 (带 API Key/JWT)<br>目标: 远程主机 API |

**为什么用 WebSocket？**

NeoAssistant 需要服务端随时主动推送内容（AI 流式回复、陪伴反馈、上下文变化通知），且未来交互频率会增长。WebSocket 从 v1 开始建立双向通道，避免后期 SSE→WS 迁移成本。

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

##### 2. 后端主服务三种“挂载绑定模式” (Backend Mounting Modes)
系统支持在设置或环境变量中动态切换不同的后端绑定与托管形态：

* **A. 本地 TCP 端口挂载 (Local TCP Port - 默认模式)**
  * **协议**: Local Loopback TCP (HTTP + WebSocket)
  * **地址**: `http://localhost:PORT` & `ws://localhost:PORT/ws`
  * **特点**: 兼容性与标准化程度高，极为便利的 Web 级开发与浏览器调试生态。
* **B. 零端口本地域套接字挂载 (Zero-Port IPC Socket - 高安稳定)**
  * **协议**: Unix Domain Sockets (UDS) / Windows Named Pipes
  * **地址**: macOS/Linux: `/tmp/neo-companion.sock` | Windows: `\\.\pipe\neo-companion`
  * **特点**: **100% 避免本地网络端口冲突**，彻底绕过操作系统防火墙（无网络警告弹窗），且进程间通信吞吐率和延迟表现均优于 TCP 回环。
* **C. 分布式远程宿主挂载 (Distributed Remote Hosting - 算力与漫游)**
  * **协议**: HTTPS + WSS + JWT 握手鉴权
  * **地址**: 用户自定义远程 NAS、局域网服务器或公网主机 URL
  * **特点**: 将繁重的 LanceDB 向量检索、Drizzle SQLite 读写及 OpenClaw GUI 编排卸载到**家用 NAS 或专属服务器**中，极大降低本地工作电脑的 CPU 与内存负载。同时实现跨办公室与家庭多设备的**助手性格、记忆和待办漫游同步**。


##### 3. 多通道 Hook 挂载机制 (Multi-channel Hook Mounts)
除了标准的 HTTP REST 推送，系统提供更加优雅的第三方 Hook 注入通道：
* **文件系统哨兵挂载 (File Watcher Hook)**：Fastify 侧监听特定本地文件目录（如 `~/.neo-companion/hooks/`）的 JSON 文件覆盖写入。自定义编译/自动化脚本无需调用 curl 网络请求，直接 `echo '...' > hooks/git.json` 即可静默挂载助手动态，极大降低 Hook 编写难度并确保在无网环境下 100% 可用。
* **标准流管道挂载 (Stdio Pipe Hook)**：在 Tauri 启动外部 Agent（如 OpenClaw）子进程时，直接将其标准输出流（stdout/stderr）挂载并拦截，实现“零端口占用”的状态提取。
* **局域网消息总线挂载 (MQTT / HA Hook)**：支持 Fastify 挂载作为 MQTT 客户端订阅家庭局域网消息队列，实现与实体智能家居/智能传感器的助手状态联动。

### 3.3 Capability Model → Technical Module Mapping

| 产品能力层 | 技术模块 | 所在包 |
|-----------|----------|--------|
| Assistant Layer | 陪伴 UI + 状态反馈逻辑 | `apps/desktop`, `packages/server-local` |
| Assistant Layer (壁纸状态) | 壁纸层纯状态显示组件 | `apps/desktop` (独立壁纸窗口) |
| Context Layer | 上下文管道 + Rust 感知 | `packages/server-local` (v1 内联), `crates/` |
| Workflow Layer | 任务服务 + AI 辅助 | `packages/server-local`, `packages/ai` |
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
│       │   └── components/     # shadcn-vue 组件 (desktop + web 复用)
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
| `packages/shared/src/types/` | 跨包共享的 DTO、API 请求/响应类型、枚举 | `TaskStatus`, `ApiResponse<T>`, `AssistantStatus` |
| `packages/shared/src/validators/` | 跨包共享的运行时校验 (Zod schema) | `createTaskSchema`, `settingsSchema` |
| `server-local/modules/context/models/` | 上下文模型类型 (v1 单一真相源，v2 抽离为 `packages/context-engine`) | `TaskContext`, `BehaviorContext`, `FullContext` |
| `packages/ai/src/adapters/types.ts` | AI 相关接口类型 | `ModelAdapter`, `ChatParams`, `ChatChunk` |
| `packages/db/src/schema/` | 数据库表结构类型 (Drizzle 推断) | `typeof tasks.$inferSelect` |
| `server-local/modules/*/schema.ts` | 请求参数验证 schema (不定义业务模型) | Fastify JSON Schema |

**原则**: 业务模型类型由拥有该领域逻辑的包定义，`shared` 只放"多包都需要导入"的公共类型。避免在 `shared` 中堆积所有接口。

---

## 5. Desktop Architecture (Tauri)

### 5.1 Rust Core 职责

Rust 侧只负责 WebView 和 Node.js 无法直接完成的系统级能力，并在零端口模式下充当关键的通信桥梁：

| 能力 | 说明 | 阶段 |
|------|------|------|
| 窗口检测 | 获取当前活跃窗口标题、进程名、应用类型 | v1 |
| 系统托盘 | 常驻托盘图标、快捷菜单 | v1 |
| 全局快捷键 | 唤醒/隐藏/快速操作 | v1 |
| Sidecar 管理 | 启动/停止 Fastify 进程、健康检查 | v1 |
| 应用切换事件 | 监听焦点变化、推送事件到 Fastify | v1 |
| UDS/管道 IPC 代理 | **模式 B 下的通信关键**。由于 Webview 浏览器沙箱限制无法直接访问 Unix 套接字与命名管道，由 Rust Core 建立原生 IPC 连接并作为 Bridge 双向透传 WebView 与 Fastify 间的 API 请求与推送事件 | v2 |
| 子进程 stdio 挂载 | 当启动外部 CLI（如 OpenClaw）时，以管道挂载其标准输出，拦截捕获微观状态 | v2 |
| 屏幕内容获取 | 用户授权下截图/OCR (v2) | v2 |
| 选中文本提取 | 获取用户选中内容 (v2) | v2 |
| 文件系统监听 | 监听指定目录变化 (v2)。在模式 B 中用于挂载文件监听哨兵 (File Watcher) | v2 |
| 内部系统能力端点 | **模式 A** 下由 Rust Core 暴露 localhost-only 端点安全获取系统钥匙链中加密的 API Key（携带 APP_AUTH_TOKEN 校验，不参与任何向量检索或数据库业务）；**模式 B** 下通过本地域套接字 (`unix:neo-core.sock`) 安全通信，实现 100% 绝对零网络端口占用；**模式 C** 下该端点不参与交互。 | v1 |


### 5.2 Tauri IPC 接口设计

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
│  桌面图标层 (SHELLDLL_DefView)   │  ← 系统层
├──────────────────────────────────┤
│  壁纸窗口 (WorkerW 子窗口) ★      │  ← 纯状态显示
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

- **纯展示**：壁纸窗口全局 `pointer-events: none`，不拦截任何鼠标事件
- **只消费**：`useWallpaperState` composable 只通过 WebSocket 接收状态数据，不发送交互命令
- **可降级**：WorkerW 不可用时自动 detach 回退到纯悬浮模式
- **低开销**：CPU < 2%，使用 CSS 动画而非 JS 逐帧更新

详细设计见 [`WALLPAPER_STATUS_LAYER.md`](./WALLPAPER_STATUS_LAYER.md)。

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
│   ├── hook/
│   │   ├── routes.ts        # /api/hooks/* (包含 /api/hook/push 与 /api/hook/permission)
│   │   ├── service.ts       # Hook 自动配置扫描、免代码文件监听哨兵 (Watcher)、局域网 MQTT 订阅器、审批流程内存 Promise 挂起与状态机引擎
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
| `modules/memory/service.ts` | `packages/db` (queries) | 调用 db 包的向量检索封装 |
| `modules/review/service.ts` | `packages/ai` + `packages/db` | 聚合数据后调用 AI 生成复盘 |
| `modules/hook/service.ts` | 直接实现 | 自动配置打桩（扫描 OpenClaw 等 CLI）、内存挂起审批映射控制流 |

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
| POST | `/api/hook/push` | 外部用户自定义脚本/通知状态推送 | v2 |
| POST | `/api/hook/permission` | 外部 Agent 敏感指令挂起审批请求 (Permission Bubble) | v2 |
| GET | `/api/settings` | 获取设置 | v1 |
| PUT | `/api/settings` | 更新设置 | v1 |

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
* **解决策略**：必须采用 **Node.js 22.5.0+ 的内置 SQLite 接口 (`node:sqlite`)**。它是编译并直接内嵌入 Node.js 运行时本身的，没有任何外部二进制依赖，完美支持 esbuild 编译和 SEA 单文件注入。
* **ORM 配套**：Drizzle ORM 原生支持 `node:sqlite` 驱动，开发中统一使用内置的 `node:sqlite` 替代 `better-sqlite3`，从而兼顾极小体积分发与 100% 的打包兼容性。

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

**🔊 拟人化 TTS 离线双模引擎降级策略**：
* **在线状态**：调用极高拟真度、带有情绪表现力的云端 TTS 合成接口（如 Edge-TTS, OpenAI TTS 等），通过 Fastify 管道流式传输至 WebView 播放，塑造高度拟人化的声音体验。
* **离线降级状态**：若检测到网络中断或 API 失联，系统自动降级无缝回退至浏览器内置的 **Web Speech API (`window.speechSynthesis`)**。
  * 它直接调用操作系统内置的 TTS 引擎（如 Windows SAPI5，macOS SpeechSynthesis）。
  * 此策略**0 体积开销**（无需本地捆绑 100MB+ 的 Sherpa-ONNX 离线包），且**100% 离线可用**，能够确保在断网环境下助手绝不失声，实现长效陪伴。

---

## 8. Context Pipeline

Context Pipeline 是 NeoAssistant 的核心差异化模块，负责将分散的系统事件、应用状态和用户行为转化为结构化的任务上下文。

### 8.1 Pipeline Architecture

```
┌─ Rust Core ──────────────────────────────┐     ┌─ Fastify (Mode A/B) ───────────────────────────┐
│  窗口检测    应用事件    屏幕感知        │     │                                                 │
│                                          │────▶│  Collector → Processor → Model → Store         │
└──────────────────────────────────────────┘     │      │           │          │        │          │
                                                 │      ▼           ▼          ▼        ▼          │
                                                 │   原始事件    结构化数据   上下文模型  SQLite     │
                                                 │   (TS/WASM HNSW 内存索引)            (含向量)   │
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
   - 长期记忆的语义文本写入 SQLite memories 表，同时根据运行模式生成向量索引：Mode A/B 下由 Fastify 本地调用 WASM/TS 向量库直接对该条记忆更新索引；Mode C 下写入服务端本地的 LanceDB 中。

5. 消费 (Consume)
   - AI 对话时，根据运行模式对长期记忆执行相似度检索：Mode A/B 下通过 Fastify 本地内存 WASM/TS 检索服务执行语义检索，Mode C 下直查远程服务端本地的 LanceDB。获取匹配的记忆 ID 后，从 SQLite 中拉取对应记忆文本注入上下文。
   - 任务恢复时查询历史上下文和最近应用事件
   - 复盘时聚合分析上下文与统计数据

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

// 长期记忆 (含高维向量持久化与关系型元数据。模式 A/B 下通过 Fastify 进程内 HNSW 检索，模式 C 下通过远程 LanceDB 检索)
export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  category: text('category').notNull(),
  // 'task_pattern' | 'user_preference' | 'knowledge' | 'context_snapshot'
  embeddingVector: text('embedding_vector'), // 向量数据的 JSON 数组或 BLOB 持久化
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

### 9.3 Vector Storage & Hybrid Retrieval Architecture

为了在数据检索能力、安装包体积与跨端交叉编译 (CI) 的开发效率上取得完美平衡，系统针对不同模式采用**混合向量检索架构 (Hybrid Vector Search)**：

- **模式 A (本地 TCP 端口 - 默认) & 模式 B (零端口 UDS)**：采用**轻量级本地混合向量库与 SQLite 融合持久化方案（策略甲）**。在 Fastify Sidecar (TypeScript) 侧直接运行纯 TS/WASM 版的高维向量检索组件（如 [hnswlib-wasm](https://www.npmjs.com/package/hnswlib-wasm) 或 MiniSearch 的轻量级混合检索引擎）。
  * **向量持久化机制**：高维向量 Embeddings 本身直接作为 BLOB 或 JSON 数组保存在本地主 SQLite 的 `memories` 关系表中（即 `embedding_vector` 字段）。
  * **内存索引重建**：当系统启动时，由 Fastify 在 Drizzle/SQLite 初始化完毕后秒级从 SQLite 中批量读取已有的向量，并在内存中构建 HNSW 索引树（在 1 万条以内的数据规模下重建耗时小于 100ms）。此策略不仅确保了向量数据的完整原子性持久化，更**100% 避免了在 Rust 侧打包整合重型 LanceDB 时导致的庞大编译开销 (Arrow/DataFusion) 与 CI/CD 跨平台构建故障**，同时让 Tauri 安装包体积减少约 40MB，且重启后无需再次调用 API 重新向量化。
- **模式 C (分布式远程宿主)**：由于远程 Fastify 服务通常托管于性能更好、且不受安装包体积限制的专业服务器环境 (如 NAS Docker / Linux 云服务器)，因此采用**物理 LanceDB 引擎**。Fastify 在远程服务端自持完整的SQLite 元数据与 `@lancedb/lancedb` Node 原生版，实现海量高效的语义相似度检索，并完全卸载本地工作电脑的算力。

#### 9.3.1 Rust Core 内部系统能力端点 (带 APP_AUTH_TOKEN 校验)

Rust 侧使用 axum 启动一个轻量 HTTP server，绑定 `127.0.0.1:RUST_PORT`，仅暴露钥匙链读取等敏感的系统级接口：

```rust
// src-tauri/src/internal_api.rs
use axum::{
    Router, Json, routing::post, http::{StatusCode, HeaderMap},
    response::IntoResponse
};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct KeychainGetRequest {
    pub key: String,
}

pub fn router() -> Router {
    Router::new()
        .route("/keychain/get", post(get_keychain_value))
}

async fn get_keychain_value(
    headers: HeaderMap,
    Json(req): Json<KeychainGetRequest>,
) -> impl IntoResponse {
    // 1. 从 Header 提取 Bearer Token 并与全局持有的 APP_AUTH_TOKEN 校验
    if let Some(auth_header) = headers.get("Authorization") {
        if let Ok(auth_str) = auth_header.to_str() {
            if auth_str == format!("Bearer {}", crate::get_auth_token()) {
                // 2. 调用原生 Keyring 安全获取密码
                if let Ok(value) = keyring::get_password("neo-companion", &req.key) {
                    return (StatusCode::OK, value).into_response();
                }
                return (StatusCode::NOT_FOUND, "Key not found").into_response();
            }
        }
    }
    (StatusCode::UNAUTHORIZED, "Unauthorized").into_response()
}
```

**端点范围严格限定**：仅 `POST /keychain/get` 等需要携带动态 Bearer Token 鉴权的极简内部通道，**不承载向量检索或任何常规数据库业务**，实现 100% 网络沙箱隔离。

#### 9.3.2 Fastify 侧的消费逻辑

Fastify 通过 HTTP 调用 Rust Core 内部端点完成向量操作，然后从 SQLite 拉取文本内容：

```typescript
// packages/server-local/src/modules/memory/service.ts

// 动态匹配运行模式
export async function querySemanticMemories(queryEmbedding: number[], limit = 5) {
  let matchedIds: string[] = [];

  if (process.env.RUNNING_MODE === 'distributed_hosting') {
    // Mode C: 远程 Sidecar 直接调用本地 LanceDB 库
    const lanceTable = await openLanceTable("memories");
    const results = await lanceTable.search(queryEmbedding).limit(limit).execute();
    matchedIds = results.map(r => r.id);
  } else {
    // Mode A/B: 本地模式，调用内存轻量级 WASM/TS 检索服务 (携带 APP_AUTH_TOKEN 校验)
    matchedIds = await localVectorIndex.search(queryEmbedding, limit);
  }

  if (matchedIds.length === 0) return [];

  // 从 SQLite 中获取对应记忆文本元数据
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

### 9.6 SQLite 并发并发安全与高频事件防抖写入 (SQLite Concurrency & Debounced Writes)

由于屏幕感知引擎与窗口检测模块会高频产生用户活动状态 Ticks（如窗口切换、空闲检测、打字活跃状态），如果每次微小变化都直接进行一次 SQLite 数据库写事务，将带来极高的磁盘 I/O 压力并诱发 `SQLITE_BUSY: database is locked` 并发锁定冲突。为此，系统强制应用以下并发优化：

1. **数据库层开启 WAL（Write-Ahead Logging）与忙等待**：
   在 Fastify 侧的数据库连接初始化插件中，强制设置连接参数：
   ```typescript
   // packages/db/src/index.ts
   db.run(sql`PRAGMA journal_mode = WAL;`);
   db.run(sql`PRAGMA busy_timeout = 5000;`); // 5秒锁等待超时，防止锁冲突直接抛错
   ```
2. **高频事件内存队列防抖合并（Debounced Write Queue）**：
   活跃检测相关的日志、小步长的心跳事件等，严禁直接触发 Drizzle 写入。
   * Fastify 的 `EventService` 内部维持一个 `memoryQueue: Event[]` 缓冲数组。
   * **缓冲策略**：采用 5 秒周期性批量合并写入 (`db.insert().values(queue)`)，或只在**用户活动状态发生断裂变化时**（如从专注 Focus 进入分心 Distracted，或者转为空闲 Idle）立即清空队列执行写入。
   * 这一合并机制可降低 SQLite 95% 以上的写事务吞吐，极大保护了用户的固态硬盘寿命，并消除助手动作渲染卡帧现象。

---

## 10. Hook & Permission Control System Architecture

Hook 机制与权限控制系统是 NeoAssistant 接入外部生态（如 OpenClaw）并实现安全保护与实时状态感知的基础。

### 10.1 配置文件扫描与自动打桩机制 (Auto-Registration Scanner)

为实现开箱即用的极客体验，系统在启动时由 Fastify Sidecar 发起自动探测与非破坏性配置合并。

#### 10.1.1 探测路径与机制
启动时，`HookService` 异步执行配置扫描：
1. **OpenClaw 配置扫描**：
   - 默认扫描路径：用户主目录下的 `~/.openclaw/openclaw.json`。
   - 行为：若存在，解析 JSON 内容，检查 `plugins` 或 `hooks` 段中是否已注册 NeoAssistant 的 Hook 端点。
2. **Claude Code 及其它 CLI 扫描**：
   - 扫描路径：`~/.claude/settings.json` 或 `settings.local.json`。

#### 10.1.2 非破坏性合并与打桩代码示例
系统在写入配置时遵循**非破坏性 Patch**原则，仅在指定位置追加，且通过 ID 确保幂等。

```typescript
// packages/server-local/src/modules/hook/service.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import os from 'os';

export async function autoPatchOpenClawConfig(localServerPort: number) {
  const homeDir = os.homedir();
  const configPath = path.join(homeDir, '.openclaw', 'openclaw.json');
  
  try {
    const rawData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(rawData);
    
    // 初始化 hooks 结构
    if (!config.hooks) {
      config.hooks = [];
    }
    
    const hookUrl = `http://127.0.0.1:${localServerPort}/api/hook/permission`;
    
    // 检查是否已打桩
    const hasHook = config.hooks.some((h: any) => h.url === hookUrl);
    if (!hasHook) {
      config.hooks.push({
        id: "neo-companion-auth-gate",
        url: hookUrl,
        events: ["pre_execute_tool", "command_execution"],
        severity_threshold: 6, // 仅拦截敏感度 >= 6 的操作
      });
      
      // 非破坏性写回
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      // 仅记录解析错误，不阻塞主进程启动
      server.log.error(`Failed to patch OpenClaw config: ${err.message}`);
    }
  }
}
```

---

### 10.2 异步 Promise 审批挂起机制 (Promise-based Suspension Pipeline)

当外部 Executor (如 OpenClaw) 发起涉及系统敏感指令（如危险脚本执行或文件覆写）的请求时，Fastify 端通过**内存挂起 Promise** 机制阻断 HTTP 请求，直至用户审批或超时。

#### 10.2.0 零端口模式 (Mode B) 下外部 Hook 的三维连通机制

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
   若外部 Agent (如 OpenClaw) 原生支持套接字协议，可直接通过 `unix:/tmp/neo-companion.sock:/api/hook/permission` 进行连接，实现端到端的绝对高安全零端口双向审批。
   
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
// packages/server-local/src/modules/hook/types.ts
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
// packages/server-local/src/modules/hook/routes.ts
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
// packages/server-local/src/modules/hook/websocket.ts
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
    source?: string;      // 来源 Agent 标识 (如 "OpenClaw")
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

### 10.4 全局热键拦截与状态驱动流 (Global Hotkeys Registry)

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
- 清除所有本地数据
- 导出数据
- 关闭所有感知能力（纯聊天模式）

### 11.4 API Key Storage, Env Override & Dynamic Auth Handshake

为了同时兼顾普通用户的低门槛、高安全性以及开发人员的极简调试，系统采用 **安全钥匙链为主，本地环境变量覆写为辅** 的鉴权配置机制。同时为防止恶意本地应用向 Rust Core 侧发起越权请求，Rust Core 与 Fastify Sidecar 之间引入了**动态单次 Token 鉴权握手机制**：

1. **安全钥匙链加密存储（生产环境）**：
   用户在应用 UI 的“设置”页面中输入的 API Key，通过 Tauri 后端直接调用系统的原生钥匙链（Windows Credential Manager / macOS Keychain / Linux Secret Service）进行高强度加密存取，用户端无感且杜绝本地明文越权。

2. **本地环境变量覆写（开发/测试环境）**：
   系统在初始化模型实例时，优先检查系统变量或本地 `.env` 中的 `DEEPSEEK_API_KEY` 等参数。若检测到配置，则直接覆写并采用此变量。这避免了开发人员调试或 CI/CD 自动化测试时需要通过 GUI 手动设置的麻烦。

3. **动态单次 Token 鉴权握手**：
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
- 向量记忆
- 复盘系统
- 屏幕内容获取
- 移动端

### 12.2 v2: Multi-Scenario Context Collaboration

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

### 12.3 v3: Personal AI Workflow Assistant System

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

## 13. Technical Risks & Mitigations

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Tauri sidecar 打包体积 | Node.js runtime 增加安装包大小 | Node.js SEA 打包为单文件；备选 Bun compile |
| SQLite 并发写入 | 高频事件写入可能冲突 | 使用 WAL 模式；事件批量写入；写操作队列化 |
| LanceDB 跨平台编译分发风险 | 传统在 Rust 核心集成 LanceDB 极易在跨平台编译和 CI 中报错 | 在本地模式（Mode A/B）下彻底移除 Rust 侧 LanceDB 绑定，改用 Fastify 进程内 WASM/TS 检索组件；仅在远程模式（Mode C）下由服务端自持 Node 版原生 LanceDB，完全规避客户端的 Rust 编译分发难题 |
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

NeoAssistant 是一个**完全本地运行**的桌面 AI 陪伴系统。

技术架构核心：

- **Tauri (Rust)** 提供系统级能力和桌面运行时；
- **Fastify (TypeScript)** 作为本地 sidecar 处理业务逻辑和 AI 调度；
- **Vue + Vite** 提供 UI；
- **SQLite (关系型元数据) + TS/WASM 混合向量检索 (本地模式 A/B) / 物理 LanceDB (分布式模式 C)** 本地存储全部数据；
- **外部 LLM API (DeepSeek)** 提供 AI 能力，用户可自定义模型；
- **Context Pipeline** 将系统事件转化为结构化任务上下文，是核心差异化模块。

所有数据不离开用户本地，不依赖云服务，不需要账户注册。

架构设计遵循渐进复杂度原则：v1 只落地最小闭环，v2 扩展完整上下文和 Web 端，v3 引入多端和执行层。
