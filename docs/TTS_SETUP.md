# TTS 配置指南

NeoCompanion 使用[小米 MiMo TTS](https://www.mimoai.com/) 作为助手语音反馈引擎。本文档说明如何配置。

## 需要准备的内容

1. MiMo TTS API key
2. MiMo TTS 服务端点 base URL
3. （可选）偏好的音色名称

## 环境变量

在根目录 `.env` 文件中添加：

```bash
MIMO_API_KEY=你的-mimo-api-key
MIMO_TTS_BASE_URL=https://api.mimoai.com/v1/tts   # 示例；请使用控制台提供的实际地址
MIMO_TTS_VOICE=茉莉
```

| 变量 | 是否必填 | 默认值 | 说明 |
|------|----------|--------|------|
| `MIMO_API_KEY` | 是 | — | MiMo TTS API key |
| `MIMO_TTS_BASE_URL` | 是 | — | MiMo TTS HTTP 端点 base URL |
| `MIMO_TTS_MODEL` | 否 | `mimo-v2.5-tts` | TTS 模型标识 |
| `MIMO_TTS_VOICE` | 否 | `茉莉` | 音色名称 |

## 获取凭证

1. 登录小米 MiMo TTS 控制台。
2. 在开发者/设置页面创建或复制 API key。
3. 从 API 文档中复制对应区域/套餐的端点 URL。
4. 将两项填入 `.env`。

## 测试 TTS

配置好 `.env` 后启动应用：

```bash
pnpm dev:tauri
```

然后触发一次专注时段结束，或直接调用 TTS 端点：

```bash
curl -X POST http://127.0.0.1:10103/api/tts/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"你好，NeoCompanion 已准备就绪。"}'
```

配置正确时，响应会包含 base64 编码的音频 URL：

```json
{
  "audioUrl": "data:audio/mp3;base64,...",
  "format": "mp3",
  "provider": "mimo",
  "cached": false
}
```

## 故障排查

### `Missing MIMO_API_KEY`

`.env` 中未设置 `MIMO_API_KEY`。添加你的 API key 并重启 sidecar。

### `Missing MIMO_TTS_BASE_URL`

`.env` 中未设置 `MIMO_TTS_BASE_URL`。将控制台提供的端点 URL 填入 `.env` 并重启 sidecar。

### `MiMo TTS request failed: 401`

API key 无效或已过期。请在 MiMo 控制台中核对并更新 `.env`。

### `MiMo TTS request failed: 4xx/5xx`

- 检查 `MIMO_TTS_BASE_URL` 是否正确，是否包含端点要求的完整路径。
- 确认所选模型和音色在你的套餐中可用。

## 降级行为

TTS 失败时，助手仍会在 UI 中显示反馈文本。TTS 被视为增强体验，不是核心功能的硬依赖。
