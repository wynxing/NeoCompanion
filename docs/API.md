# Sidecar API Reference

The NeoCompanion sidecar is a Fastify application that runs locally and exposes the REST API and WebSocket endpoints used by the Vue frontend. It is managed by the Tauri Rust core.

- **Base URL (development)**: `http://127.0.0.1:10103`
- **Default port**: `10103` (configurable via `NEO_SERVER_PORT`)
- **WebSocket endpoint**: `/ws`

All endpoints return JSON unless otherwise noted.

---

## Health

### `GET /health`

Returns service health and current timestamp.

**Response:**

```json
{
  "ok": true,
  "service": "neo-companion-server-local",
  "time": "2026-06-19T12:34:56.789Z"
}
```

---

## Tasks

### `GET /api/tasks`

List all tasks.

**Response:**

```json
[
  {
    "id": "task-1",
    "title": "Read API docs",
    "status": "open",
    "createdAt": "2026-06-19T12:00:00.000Z",
    "completedAt": null
  }
]
```

### `POST /api/tasks`

Create a new task.

**Request body:**

```json
{
  "title": "Write tests"
}
```

**Response:** the created task object.

**Errors:**

- `400` — `title is required`

### `PATCH /api/tasks/:id`

Update a task's title or status.

**Request body:**

```json
{
  "title": "Updated title",
  "status": "done"
}
```

**Response:** the updated task object.

**Errors:**

- `404` — task not found

---

## Focus Timer

### `POST /api/focus/start`

Start a new focus session.

**Request body:**

```json
{
  "taskId": "task-1",
  "durationMinutes": 25
}
```

- `taskId` is optional; `durationMinutes` defaults to `25`.

**Response:** the created focus session.

### `POST /api/focus/:id/complete`

Complete an active focus session.

**Response:** the completed focus session.

**Errors:**

- `404` — focus session not found

---

## Weather

### `GET /api/weather`

Get a weather summary for the configured city (`NEO_CITY`).

**Response:**

```json
{
  "city": "Beijing",
  "temperatureC": 24,
  "precipitationChance": 10,
  "text": "晴朗，24°C"
}
```

---

## AI Chat

### `POST /api/ai/chat`

Send a message to the assistant and receive a streamed response over WebSocket.

**Request body:**

```json
{
  "message": "What should I work on next?"
}
```

**Response:**

```json
{
  "text": "How about reviewing your open tasks?"
}
```

**WebSocket events emitted during the request:**

- `companion:feedback` with `state: "thinking"`
- `ai:chunk` for each streamed chunk
- `ai:done` when the response is complete
- `ai:error` on failure

**Errors:**

- `400` — `message is required`
- `500` — AI request failed

---

## Text-to-Speech

### `POST /api/tts/speak`

Convert text to speech using the configured MiMo TTS provider.

**Request body:**

```json
{
  "text": "Focus session complete. Take a break!",
  "style": "温柔、自然"
}
```

- `style` is optional.

**Response:**

```json
{
  "audioUrl": "data:audio/mp3;base64,...",
  "format": "mp3",
  "provider": "mimo",
  "cached": false
}
```

**WebSocket events:**

- `tts:started`
- `tts:done`

**Errors:**

- `400` — `text is required`
- Errors from the TTS provider are surfaced as `500`

See [`docs/TTS_SETUP.md`](TTS_SETUP.md) for configuration.

---

## Window Activity

### `GET /api/window/active`

Capture the currently active window and persist it.

**Response:**

```json
{
  "title": "Visual Studio Code",
  "processName": "Code.exe",
  "capturedAt": "2026-06-19T12:34:56.789Z",
  "dwellSeconds": 120,
  "classification": "focused"
}
```

`classification` is one of: `focused`, `distracted`, `stuck`.

This endpoint is polled automatically every 30 seconds when the sidecar starts.

---

## Hook System

External agents can push status updates and request permission to run commands through the Hook API.

### `POST /api/hook/push`

Push a status update from an external agent.

**Request body:**

```json
{
  "agentId": "ci-server",
  "type": "status",
  "state": "success",
  "description": "Build passed",
  "timestamp": 1718800000000
}
```

- `timestamp` is optional and defaults to `Date.now()`.

**Response:** `204 No Content`

**Errors:**

- `400` — missing `agentId`, invalid `type`, or missing `state`

Valid `state` values are defined in `@neo-companion/shared`:
`idle`, `thinking`, `working`, `building`, `waiting`, `success`, `error`, `juggling`, `sleeping`.

### `POST /api/hook/permission`

Request permission for a sensitive command.

**Request body:**

```json
{
  "agentId": "deploy-bot",
  "command": "kubectl apply -f production.yaml",
  "severity": 3,
  "description": "Deploy to production"
}
```

**Response:** the resolved permission decision.

**Errors:**

- `400` — missing required fields
- `410` — request became stale or agent state changed
- `503` — server shutting down

### `GET /api/hook/always-rules`

List "always allow" rules configured by the user.

**Response:**

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

Remove an "always allow" rule.

**Request body:**

```json
{
  "agentId": "deploy-bot",
  "commandPrefix": "kubectl apply -f staging"
}
```

**Response:** `204 No Content`

---

## WebSocket

### `GET /ws`

Upgrade to a WebSocket connection for real-time events.

The sidecar broadcasts these message types:

| Type | Direction | Description |
|------|-----------|-------------|
| `ai:chunk` | Server → Client | Streamed AI response chunk |
| `ai:done` | Server → Client | AI response complete |
| `ai:error` | Server → Client | AI call failed |
| `companion:feedback` | Server → Client | Assistant state/feedback update |
| `task:statusChanged` | Server → Client | A task was created or updated |
| `focus:tick` | Server → Client | Focus timer tick |
| `window:activeChanged` | Server → Client | Active window snapshot updated |
| `tts:started` | Server → Client | TTS playback started |
| `tts:done` | Server → Client | TTS playback finished |
| `hook:statusChanged` | Server → Client | Hook agent status changed |
| `permission:request` | Server → Client | Permission request pending |
| `permission:resolved` | Server → Client | Permission request resolved |
| `permission:autoDismiss` | Server → Client | Permission request auto-dismissed |
| `permission:response` | Client → Server | User decision for a permission request |
| `ping` | Client → Server | Keepalive ping |
| `pong` | Server → Client | Keepalive pong |

### Example: responding to a permission request

```json
{
  "type": "permission:response",
  "payload": {
    "requestId": "req-123",
    "decision": "allow"
  }
}
```

`decision` can be `allow`, `deny`, or `always`.

---

## Notes

- Endpoints related to the knowledge workspace search (`/api/knowledge/*`) are **not yet implemented**. The knowledge workspace UI is currently backed by a front-end mock.
- Error responses follow the shape `{ "error": "message" }` unless noted otherwise.
