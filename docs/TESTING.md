# 测试说明

NeoCompanion 使用 [Vitest](https://vitest.dev/) 进行单元测试和集成测试。本文档介绍如何运行测试以及如何编写新测试。

## 运行测试

```bash
# 运行所有包的测试
pnpm test

# 运行指定包的测试
pnpm --filter @neo-companion/server-local test
pnpm --filter @neo-companion/ai test
pnpm --filter @neo-companion/db test
pnpm --filter @neo-companion/tts test

# 仅运行桌面端测试
pnpm --filter @neo-companion/desktop test
```

## 测试位置

| 包 | 测试文件 | 说明 |
|----|---------|------|
| `packages/ai` | `src/ai.test.ts` | DeepSeek 适配器测试 |
| `packages/db` | `src/db.test.ts` | SQLite store 测试 |
| `packages/tts` | `src/tts.test.ts` | MiMo TTS 适配器测试 |
| `packages/server-local` | `src/tests/app.test.ts`、`src/tests/hook.test.ts` | Fastify 集成测试 |
| `apps/desktop` | `tests/markdown-roundtrip.test.ts` | Markdown 编辑器往返语料测试 |

## 桌面端测试

桌面端测试在 `apps/desktop/vitest.config.ts` 配置的 `jsdom` 环境中运行。

### Markdown 往返测试

`apps/desktop/tests/markdown-roundtrip.test.ts` 验证 `src/components/markdown-editor/editor/markdownCodec.ts` 中自定义的 ProseMirror-to-Markdown 序列化器。

- **supported 语法夹具**（`tests/fixtures/markdown-corpus/supported/`）要求*语义级*往返：`parse → serialize → parse` 得到相同文档树。
- **preserved 语法夹具**（`tests/fixtures/markdown-corpus/preserved/`）要求*字节级*往返：序列化器不能改动原始 Markdown。

添加新夹具：

1. 在 `supported/` 或 `preserved/` 目录创建 `.md` 文件。
2. 运行 `pnpm --filter @neo-companion/desktop test`。
3. 若是 preserved 构造，确保 `roundTripMarkdown(source).trim() === source.trim()`。

## server-local 集成测试

server-local 测试使用依赖注入，避免访问真实外部 API 或文件系统。

示例模式（来自 `packages/server-local/src/tests/app.test.ts`）：

```typescript
import { createDatabase } from "@neo-companion/db";
import { createApp } from "../app";

const app = await createApp({
  database: createDatabase(":memory:"),
  startBackground: false,
  aiStream: async function* () { yield "模拟回复"; },
  ttsSpeak: async () => ({ audioUrl: "...", format: "mp3", provider: "mimo", cached: false }),
  weather: async () => ({ city: "Beijing", temperatureC: 20, precipitationChance: 0, text: "..." })
});
```

要点：

- 传入 `database: createDatabase(":memory:")`，避免触碰生产数据库。
- 传入 `startBackground: false`，关闭 30 秒窗口轮询定时器。
- mock `aiStream`、`ttsSpeak`、`weather`，保证测试快速且确定性高。
- 使用 `app.inject({ method, url, payload })` 进行 HTTP 断言。

## 编写新测试

1. 将测试文件放在被测模块旁边，或包内的 `tests/` 目录。
2. 使用 `vitest` 的 `describe`/`it`。
3. 推荐 Arrange-Act-Assert 结构。
4. 涉及数据库或 sidecar 的测试，使用上文依赖注入模式。
5. 提交前运行 `pnpm test`。

## 持续集成

`ci-check.yml` 工作流会在每个针对 `main` 的 Pull Request 上运行 `pnpm typecheck` 和 `pnpm test`。
