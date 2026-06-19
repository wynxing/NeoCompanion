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
- **影响**：整个知识工作空间（项目、笔记、看板、任务）目前为前端 mock 数据。真正的后端端点、SQLite 存储、FTS5 全文检索和 `sqlite-vec` 向量检索计划在 v2 实现。
- **另见**：`docs/ARCHITECTURE.md` §1.2 Document Scope

## 如何更新本清单

1. 在提交文档 PR 前运行 `./scripts/verify-docs.sh`。
2. TODO 解决后，从本文件移除对应条目，并更新 `CHANGELOG.md`。
3. 新增文档与代码不一致的 TODO 时，按文件路径、行号、影响补充到此处。
