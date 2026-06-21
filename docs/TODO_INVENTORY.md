# 已知的文档与代码不一致 TODO 清单

本文档跟踪源码中表示文档/预期功能与当前实现存在差距的 TODO 注释。在每次文档维护 pass 中手动更新。

## UI 组件

### `apps/desktop/src/components/panel/cards/WeeklyFocusCard.vue`

- **行号**：约 42
- **TODO**：`<!-- TODO: 接入真实数据 -->`
- **影响**：周专注总结卡展示硬编码的柱状图和"12h 40min"总量，不反映 SQLite 中的真实专注记录。
- **计划阶段**：v1.x 完善或 v2

### `apps/desktop/src/components/panel/cards/DiaryCard.vue`

- **行号**：约 3
- **TODO**：`// TODO: 接入真实数据`
- **影响**：日记卡展示静态占位内容，未从专注/任务数据生成或加载真实日报。
- **计划阶段**：v1.x 完善或 v2

### `apps/desktop/src/components/panel/TopNav.vue`

- **行号**：约 5、约 12
- **TODOs**：
  - `// TODO: Phase 2 -- use for dynamic avatar state`
  - `// TODO: Phase 2 -- global search feature`
- **影响**：顶部导航接受 `petState` prop 并声明了 search emit，但动态头像状态和全局搜索均未实现。
- **计划阶段**：v2

## 设置

### `apps/desktop/src/components/settings/sections/ModelSection.vue`

- **行号**：约 53
- **TODO**：`// TODO: Phase 2 -- 在 Rust 侧校验 URL scheme 为 https 且禁止 loopback/私有地址，防止 SSRF`
- **影响**：模型设置中输入的自定义 API 端点 URL 尚未在 Rust 侧进行 SSRF 校验。
- **计划阶段**：v2

## 知识工作空间

- **文件**：`apps/desktop/src/composables/useKnowledgeMock.ts`（现仅作开发/降级数据源）、`packages/server-local/src/modules/knowledge/`（后端）、`packages/db/src/index.ts`（存储）
- **已交付（v3.3 UI + v2 后端 Phase 0–4）**：
  - 卡片化项目浏览器与嵌套项目导航。
  - 项目工作区（笔记 / 看板 / 任务 / 子项目 / AI tab）。
  - 按项目自定义看板列与原生 HTML5 拖拽排序。
  - 双向 wiki 链接 `[[目标]]` / `[[目标|显示文本]]` 与 backlinks 面板。
  - 底部快速创建条与全局 light/dark 主题切换。
  - 后端 SQLite CRUD + 混合文件镜像（Obsidian 友好 Markdown/JSONL）。
  - FTS5 全文检索（trigram，支持 CJK）、`sqlite-vec` 向量检索 + RRF 融合。
  - Embedding Adapter（OpenAI 兼容，配置落库 + 环境变量双通道）。
  - AI Chat/Ask 双模式 + 三级上下文权限 + 引用审计反幻觉 + 多轮会话持久化。
  - 前端通过 `useKnowledgeApi` 接入真实 API，API 不可用时自动降级 mock 并显示 banner。
- **另见**：`docs/ARCHITECTURE.md` §1.2 Document Scope、§9.3 向量与混合检索、§9.4 AI Chat/Ask 双模式与引用审计。

### 数据模型与迁移待对齐项

- **任务状态枚举（延后决策）**：现有 v1 `tasks.status` 为 `'open' | 'done'`（驱动 pet 面板/focus），v2 `knowledge_tasks` 为四态 `'todo' | 'doing' | 'done' | 'archived'`。统一枚举是行为变更，暂延后；knowledge 用独立表 `knowledge_tasks`。
- **看板列默认值**：v2 首次迁移需为项目创建默认列，并支持自定义列持久化。

## 如何更新本清单

1. 在提交文档 PR 前运行 `./scripts/verify-docs.sh`。
2. TODO 解决后，从本文件移除对应条目，并更新 `CHANGELOG.md`。
3. 新增文档与代码不一致的 TODO 时，按文件路径、行号、影响补充到此处。
