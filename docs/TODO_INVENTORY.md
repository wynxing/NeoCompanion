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

- **文件**：`apps/desktop/src/composables/useKnowledgeMock.ts`
- **已交付（v3.3 UI）**：
  - 卡片化项目浏览器与嵌套项目导航。
  - 项目工作区（笔记 / 看板 / 任务 / 子项目 tab）。
  - 按项目自定义看板列与原生 HTML5 拖拽排序。
  - 双向 wiki 链接 `[[目标]]` / `[[目标|显示文本]]` 与 backlinks 面板。
  - 底部快速创建条与全局 light/dark 主题切换。
- **仍为 mock（v2 接入）**：
  - 真正的后端端点（`/api/notes`、`/api/boards`、`/api/tasks`、`/api/knowledge/*`）。
  - SQLite 持久化存储、FTS5 全文检索和 `sqlite-vec` 向量检索。
- **另见**：`docs/ARCHITECTURE.md` §1.2 Document Scope

### 数据模型与迁移待对齐项

- **项目/看板字段名**：`docs/ARCHITECTURE.md` §9.2 原 schema 使用 `projects.name` / `boards.name`，但 v3.3 前端 mock 与 UI 已统一使用 `title`。v2 后端实现时需以 `title` 为准，并在首次迁移中处理。
- **任务状态枚举**：现有 `tasks.status` 为 `'open' | 'done'`，v3.3 看板工作流为 `'todo' | 'doing' | 'done' | 'archived'`。v2 迁移需将旧任务状态映射到看板列与新枚举。
- **看板列默认值**：v3.3 中各项目可拥有不同的看板列（如“待办/进行中/已完成/归档”或“待调研/已整理”）。v2 首次迁移需为项目创建默认列，并支持自定义列持久化。

## 如何更新本清单

1. 在提交文档 PR 前运行 `./scripts/verify-docs.sh`。
2. TODO 解决后，从本文件移除对应条目，并更新 `CHANGELOG.md`。
3. 新增文档与代码不一致的 TODO 时，按文件路径、行号、影响补充到此处。
