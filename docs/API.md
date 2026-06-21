# Sidecar API 参考

NeoCompanion sidecar 是一个本地 Fastify 应用，为 Vue 前端提供 REST API 和 WebSocket 端点。它由 Tauri Rust 核心管理。

- **开发环境 Base URL**：`http://127.0.0.1:10103`
- **默认端口**：`10103`（可通过 `NEO_SERVER_PORT` 修改）
- **WebSocket 端点**：`/ws`

所有端点默认返回 JSON，除非另有说明。

---

## 健康检查

### `GET /health`

返回服务健康状态和当前时间戳。

**响应：**

```json
{
  "ok": true,
  "service": "neo-companion-server-local",
  "time": "2026-06-19T12:34:56.789Z"
}
```

---

## 任务

### `GET /api/tasks`

列出所有任务。

**响应：**

```json
[
  {
    "id": "task-1",
    "title": "阅读 API 文档",
    "status": "open",
    "createdAt": "2026-06-19T12:00:00.000Z",
    "completedAt": null
  }
]
```

### `POST /api/tasks`

创建新任务。

**请求体：**

```json
{
  "title": "写测试"
}
```

**响应：** 创建后的任务对象。

**错误：**

- `400` — `title is required`

### `PATCH /api/tasks/:id`

更新任务标题或状态。

**请求体：**

```json
{
  "title": "更新后的标题",
  "status": "done"
}
```

**响应：** 更新后的任务对象。

**错误：**

- `404` — 任务不存在

---

## 专注计时

### `POST /api/focus/start`

开始新的专注时段。

**请求体：**

```json
{
  "taskId": "task-1",
  "durationMinutes": 25
}
```

- `taskId` 可选；`durationMinutes` 默认 `25`。

**响应：** 创建的专注会话。

### `POST /api/focus/:id/complete`

完成一个进行中的专注会话。

**响应：** 完成后的专注会话。

**错误：**

- `404` — 专注会话不存在

---

## 天气

### `GET /api/weather`

获取配置城市（`NEO_CITY`）的天气摘要。

**响应：**

```json
{
  "city": "Beijing",
  "temperatureC": 24,
  "precipitationChance": 10,
  "text": "晴朗，24°C"
}
```

---

## AI 聊天

### `POST /api/ai/chat`

向助手发送消息，并通过 WebSocket 流式返回结果。

**请求体：**

```json
{
  "message": "向量检索怎么工作？",
  "mode": "ask",
  "projectId": "<可选，限定检索范围>",
  "context": "可选，Chat 模式下手选条目与三级权限",
  "conversationId": "可选，Chat 模式多轮续接"
}
```

`mode` 取值：

- `ask` — RAG 自动检索（`searchHybrid`）相关分块作答，单次问答。
- `chat` — 基于用户手选上下文（`context`）多轮对话，支持 `conversationId` 续接。

`context`（Chat 模式）为数组，每项含条目 id、`contextLevel: "full" | "summary" | "excluded"`。

**响应：**

```json
{
  "text": "知识库使用 sqlite-vec 做向量检索……",
  "sources": [
    { "sourceType": "note", "sourceId": "...", "projectId": "...", "title": "...", "excerpt": "...", "chunkId": "..." }
  ],
  "retrievalMode": "ask",
  "conversationId": "可选，用于续接"
}
```

`sources` 由服务端根据实际召回/引用审计结果生成（模型输出无权新增，编造的引用 ID 会被剔除）。

**请求过程中会广播以下 WebSocket 事件：**

- `companion:feedback`，状态为 `thinking`
- `ai:chunk` 每个流式片段
- `ai:done` 响应完成
- `ai:error` 失败时

**错误：**

- `400` — `message is required`
- `500` — AI 请求失败

---

## 语音合成

### `POST /api/tts/speak`

使用配置的 MiMo TTS 提供商将文本转为语音。

**请求体：**

```json
{
  "text": "专注完成，休息一下吧！",
  "style": "温柔、自然"
}
```

- `style` 可选。

**响应：**

```json
{
  "audioUrl": "data:audio/mp3;base64,...",
  "format": "mp3",
  "provider": "mimo",
  "cached": false
}
```

**WebSocket 事件：**

- `tts:started`
- `tts:done`

**错误：**

- `400` — `text is required`
- TTS 提供商错误会返回 `500`

配置说明见 [`docs/TTS_SETUP.md`](TTS_SETUP.md)。

---

## 窗口活动

### `GET /api/window/active`

捕获当前活动窗口并持久化。

**响应：**

```json
{
  "title": "Visual Studio Code",
  "processName": "Code.exe",
  "capturedAt": "2026-06-19T12:34:56.789Z",
  "dwellSeconds": 120,
  "classification": "focused"
}
```

`classification` 取值：`focused`、`distracted`、`stuck`。

sidecar 启动后会每 30 秒自动轮询该端点。

---

## Hook 系统

外部 Agent 可通过 Hook API 推送状态更新或请求执行敏感命令的权限。

### `POST /api/hook/push`

推送外部 Agent 的状态更新。

**请求体：**

```json
{
  "agentId": "ci-server",
  "type": "status",
  "state": "success",
  "description": "构建通过",
  "timestamp": 1718800000000
}
```

- `timestamp` 可选，默认 `Date.now()`。

**响应：** `204 No Content`

**错误：**

- `400` — 缺少 `agentId`、无效 `type` 或缺少 `state`

有效 `state` 定义在 `@neo-companion/shared` 中：
`idle`、`thinking`、`working`、`building`、`waiting`、`success`、`error`、`juggling`、`sleeping`。

### `POST /api/hook/permission`

请求敏感命令的执行权限。

**请求体：**

```json
{
  "agentId": "deploy-bot",
  "command": "kubectl apply -f production.yaml",
  "severity": 3,
  "description": "部署到生产环境"
}
```

**响应：** 权限决议结果。

**错误：**

- `400` — 缺少必填字段
- `410` — 请求已过期或 Agent 状态变化
- `503` — 服务正在关闭

### `GET /api/hook/always-rules`

列出用户配置的"始终允许"规则。

**响应：**

```json
[
  {
    "agentId": "deploy-bot",
    "commandPrefix": "kubectl apply -f staging",
    "createdAt": 1718800000000
  }
]
```

### `DELETE /api/hook/always-rules`

移除一条"始终允许"规则。

**请求体：**

```json
{
  "agentId": "deploy-bot",
  "commandPrefix": "kubectl apply -f staging"
}
```

**响应：** `204 No Content`

---

## WebSocket

### `GET /ws`

升级为 WebSocket 连接，用于接收实时事件。

sidecar 会广播以下消息类型：

| 类型 | 方向 | 说明 |
|------|------|------|
| `ai:chunk` | 服务端 → 客户端 | AI 流式响应片段 |
| `ai:done` | 服务端 → 客户端 | AI 响应完成 |
| `ai:error` | 服务端 → 客户端 | AI 调用失败 |
| `companion:feedback` | 服务端 → 客户端 | 助手状态/反馈更新 |
| `task:statusChanged` | 服务端 → 客户端 | 任务创建或更新 |
| `focus:tick` | 服务端 → 客户端 | 专注计时 tick |
| `window:activeChanged` | 服务端 → 客户端 | 活动窗口快照更新 |
| `tts:started` | 服务端 → 客户端 | TTS 开始播放 |
| `tts:done` | 服务端 → 客户端 | TTS 播放完成 |
| `hook:statusChanged` | 服务端 → 客户端 | Hook Agent 状态变化 |
| `permission:request` | 服务端 → 客户端 | 权限请求待处理 |
| `permission:resolved` | 服务端 → 客户端 | 权限请求已决议 |
| `permission:autoDismiss` | 服务端 → 客户端 | 权限请求自动取消 |
| `permission:response` | 客户端 → 服务端 | 用户对权限请求的决议 |
| `ping` | 客户端 → 服务端 | 心跳 ping |
| `pong` | 服务端 → 客户端 | 心跳 pong |

### 示例：响应权限请求

```json
{
  "type": "permission:response",
  "payload": {
    "requestId": "req-123",
    "decision": "allow"
  }
}
```

`decision` 可选：`allow`、`deny`、`always`。

---

## 说明

- 知识工作空间后端端点（`/api/knowledge/*`）**已实现**：项目/笔记/看板列/任务的 CRUD、`GET /api/knowledge/search`（FTS5 + sqlite-vec 混合检索，参数 `q`/`projectId`/`limit`）、`GET /api/knowledge/index-status`、`POST /api/knowledge/reindex`、`GET/PUT /api/knowledge/embedding-config`（apiKey 不回显，落库持久化）、`GET/PUT /api/knowledge/root-path`、`POST /api/knowledge/mirror/export|import`。前端通过 `useKnowledgeApi` 接入，API 不可用时降级 mock 并显示 banner。详见 `docs/ARCHITECTURE.md` §9.3、§9.4。
- 当前 v1 `/api/tasks` 使用 `status: "open" | "done"`。v2 知识工作空间用独立表 `knowledge_tasks`（四态 `"todo" | "doing" | "done" | "archived"`），与看板列绑定；两表统一为延后决策。
- 错误响应格式通常为 `{ "error": "message" }`，除非另有说明。
