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

## 知识工作空间手动验证清单

以下流程在 `pnpm dev:tauri` 启动后，通过 panel 的「知识工作空间」入口打开独立窗口验证：

1. **项目浏览器**
   - 根视图展示顶层项目卡片（收件箱、产品研究、学习笔记、写作素材）。
   - 点击「产品研究」（非底层项目）进入子项目卡片网格（竞品调研、用户研究）。
   - 点击任意底层项目进入工作区。

2. **工作区导航**
   - 面包屑显示当前路径，点击任意段可跳转。
   - 「返回上级」回到父项目或根浏览器。

3. **笔记**
   - 创建新笔记，标题出现在左侧列表。
   - 编辑笔记正文，使用 `[[Rust borrow checker 速记]]` 建立链接。
   - 切换到只读预览，点击链接跳转到目标笔记。
   - 在目标笔记详情查看 backlinks 面板，确认来源列出。

4. **看板**
   - 在看板列底部输入创建任务。
   - 拖拽任务跨列，确认列计数与任务状态同步更新。
   - 在同一列内拖拽任务，确认排序变化。
   - 使用键盘方向键（←↑↓→）移动聚焦的任务卡片。

5. **任务列表**
   - 切换「任务」tab，确认 flat 列表与看板数据一致。
   - 使用状态筛选按钮过滤任务。

6. **主题切换**
   - 点击知识窗口 header 的主题按钮，确认 knowledge/panel/settings 三视图均切换 light/dark。

## 持续集成

`ci-check.yml` 工作流会在每个针对 `main` 的 Pull Request 上运行 `pnpm typecheck` 和 `pnpm test`。
