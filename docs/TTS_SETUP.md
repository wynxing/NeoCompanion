# TTS Setup

NeoCompanion uses [Xiaomi MiMo TTS](https://www.mimoai.com/) for spoken assistant feedback. This guide explains how to configure it.

## What You Need

1. A MiMo TTS API key.
2. The base URL for the MiMo TTS endpoint.
3. (Optional) A preferred voice name.

## Environment Variables

Add these variables to your root `.env` file:

```bash
MIMO_API_KEY=your-mimo-api-key
MIMO_TTS_BASE_URL=https://api.mimoai.com/v1/tts   # example; use the URL from your console
MIMO_TTS_VOICE=茉莉
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MIMO_API_KEY` | Yes | — | Your MiMo TTS API key. |
| `MIMO_TTS_BASE_URL` | Yes | — | The base URL of the MiMo TTS HTTP endpoint. |
| `MIMO_TTS_MODEL` | No | `mimo-v2.5-tts` | TTS model identifier. |
| `MIMO_TTS_VOICE` | No | `茉莉` | Voice name. |

## How to Get Your Credentials

1. Log in to the Xiaomi MiMo TTS console.
2. Create or copy an API key from the developer/settings page.
3. Copy the endpoint URL shown in the API documentation for your region/plan.
4. Paste both values into `.env`.

## Testing TTS

After configuring `.env`, start the app:

```bash
pnpm dev:tauri
```

Then trigger a focus session or call the TTS endpoint directly:

```bash
curl -X POST http://127.0.0.1:10103/api/tts/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"你好，NeoCompanion 已准备就绪。"}'
```

If configured correctly, the response contains a base64-encoded audio URL:

```json
{
  "audioUrl": "data:audio/mp3;base64,...",
  "format": "mp3",
  "provider": "mimo",
  "cached": false
}
```

## Troubleshooting

### `Missing MIMO_API_KEY`

`MIMO_API_KEY` is not set in `.env`. Add your API key and restart the sidecar.

### `Missing MIMO_TTS_BASE_URL`

`MIMO_TTS_BASE_URL` is not set. Add the endpoint URL from the MiMo TTS console to `.env` and restart the sidecar.

### `MiMo TTS request failed: 401`

The API key is invalid or expired. Verify it in the MiMo console and update `.env`.

### `MiMo TTS request failed: 4xx/5xx`

- Check that `MIMO_TTS_BASE_URL` is correct and includes the full path expected by the endpoint.
- Confirm the selected model and voice are available in your plan.

## Fallback Behavior

If TTS fails, the assistant still displays the feedback text in the UI. TTS is treated as an enhancement, not a hard dependency for core features.
