import { computed, ref } from "vue";

/**
 * Knowledge workspace mock composable — 阶段 2（v1.5）：把笔记正文从 excerpt（HTML）
 * 升级为真正的 Markdown 字符串（body 字段），与 docs/ARCHITECTURE.md 第 717 行的
 * `Note { id, projectId, title, body, tags }` schema 对齐。仍是纯前端 mock，不连
 * sidecar/WS。
 *
 * 设计要点：
 * - body 是 markdown 全文（编辑器 single source of truth）；列表用 deriveExcerpt 从
 *   body 截取首段做摘要，避免重复存储。
 * - "收件箱" 项目 ID 固定为 "inbox"，对齐 PRD 4.1 不可缺省语义。
 * - indexStatus 区分 "ok" / "fts_only" / "indexing" 三态，对齐降级语义。
 */

export type KnowledgeViewKey = "notes" | "board" | "tasks";
export type IndexStatus = "ok" | "fts_only" | "indexing";

export interface KnowledgeProject {
  id: string;
  name: string;
  noteCount: number;
  taskCount: number;
  boardCount: number;
  isInbox?: boolean;
}

export interface KnowledgeNote {
  id: string;
  projectId: string;
  title: string;
  /** Markdown 全文（SSOT）。列表显示请用 `deriveExcerpt(body)` 派生。 */
  body: string;
  tags: string[];
  /** 显示用文本，例如 "06·12 14:32"。 */
  updatedAt: string;
}

export interface KnowledgeTask {
  id: string;
  projectId: string;
  title: string;
  status: "todo" | "doing" | "done" | "archived";
  boardColumnId?: string;
  linkedNoteId?: string;
  tags: string[];
}

export interface BoardColumnMock {
  id: string;
  title: string;
  status: "todo" | "doing" | "done" | "archived";
}

const PROJECTS: KnowledgeProject[] = [
  { id: "inbox", name: "收件箱", noteCount: 3, taskCount: 5, boardCount: 0, isInbox: true },
  { id: "proj-product", name: "产品研究", noteCount: 12, taskCount: 8, boardCount: 1 },
  { id: "proj-learning", name: "学习笔记", noteCount: 7, taskCount: 3, boardCount: 1 },
  { id: "proj-writing", name: "写作素材", noteCount: 5, taskCount: 1, boardCount: 0 },
];

const NOTES_INIT: KnowledgeNote[] = [
  {
    id: "n-001",
    projectId: "proj-product",
    title: "竞品分析：本地优先笔记应用",
    body:
      "# 竞品分析：本地优先笔记应用\n\n" +
      "Obsidian、Logseq、Reflect 在本地数据、双向链接、AI 检索三个维度的能力对比。\n\n" +
      "| 应用 | 本地数据 | 双向链接 | AI 检索 |\n" +
      "| ---- | -------- | -------- | ------- |\n" +
      "| Obsidian | ✅ Markdown 文件 | ✅ 强 | ⚠️ 插件 |\n" +
      "| Logseq | ✅ Markdown/Org | ✅ 强 | ⚠️ 插件 |\n" +
      "| Reflect | ⚠️ 云优先 | ✅ 中 | ✅ 内建 |\n\n" +
      "结论：本地优先 + 内建 AI 检索是差异化方向。",
    tags: ["竞品", "调研"],
    updatedAt: "06·12 14:32",
  },
  {
    id: "n-002",
    projectId: "proj-product",
    title: "用户访谈纪要 · 06-10",
    body:
      "# 用户访谈纪要 · 06-10\n\n" +
      "和三位深度用户聊了使用习惯。\n\n" +
      "> 「我希望 AI 引用的来源是真实文件，不是它编出来的。」 — P02\n\n" +
      "## 共性诉求\n\n" +
      "- 引用透明：召回结果必须显示原文与位置\n" +
      "- 离线可用：不能强依赖云\n" +
      "- 数据可导出：Markdown 即可\n\n" +
      "#访谈 #用户故事",
    tags: ["访谈", "用户故事"],
    updatedAt: "06·11 09:18",
  },
  {
    id: "n-003",
    projectId: "proj-product",
    title: "FTS5 与 sqlite-vec 融合策略",
    body:
      "# FTS5 与 sqlite-vec 融合策略\n\n" +
      "本地知识工作空间需要在 **FTS5 全文检索** 与 **sqlite-vec 语义向量** 两路结果之间做融合。\n\n" +
      "## Reciprocal Rank Fusion (RRF)\n\n" +
      "对每路结果取倒数排名累加：\n\n" +
      "```\nscore(d) = Σ 1 / (k + rank_i(d))\n```\n\n" +
      "实测中 `k = 60` 时排名稳定性最好，对短查询更宽容。\n\n" +
      "## 降级条件\n\n" +
      "- 未配置 Embedding Provider\n" +
      "- 云端额度不足或网络失败\n" +
      "- sqlite-vec 扩展加载失败\n\n" +
      "任一条件触发后退化为纯 FTS5，并在 UI 显式标注「仅 FTS 可用」。",
    tags: ["技术", "检索"],
    updatedAt: "06·09 22:04",
  },
  {
    id: "n-004",
    projectId: "proj-product",
    title: "知识工作空间 v2 设计草稿",
    body:
      "# 知识工作空间 v2 设计草稿\n\n" +
      "项目结构、笔记标签、看板列、AI 范围切换的交互草图与文案规范。\n\n" +
      "## 待办\n\n" +
      "- [x] 完成 v1 mock UI\n" +
      "- [x] 移植 memos 编辑器\n" +
      "- [ ] 实现看板拖拽\n" +
      "  - [ ] 列内排序\n" +
      "  - [ ] 跨列移动 → 同步任务 status\n" +
      "- [ ] 接入 sidecar 的真实笔记数据\n\n" +
      "参考：[memos 项目首页](https://github.com/usememos/memos)\n\n" +
      "#设计 #v2",
    tags: ["设计", "v2"],
    updatedAt: "06·08 16:50",
  },
  {
    id: "n-005",
    projectId: "proj-product",
    title: "降级体验文案",
    body:
      "# 降级体验文案\n\n" +
      "Embedding 不可用时如何向用户清晰说明，避免误以为 AI 在编造。\n\n" +
      "原则：*告诉用户当前能力的真实边界*，使用 `仅 FTS 可用` 这种带形容词的明确文案，\n" +
      "而不是模糊的 `检索受限`。\n\n" +
      "#文案",
    tags: ["文案"],
    updatedAt: "06·06 11:22",
  },
  {
    id: "n-006",
    projectId: "proj-learning",
    title: "Rust borrow checker 速记",
    body:
      "# Rust borrow checker 速记\n\n" +
      "可变借用与不可变借用同时存在的 4 个常见场景及修复策略。\n\n" +
      "## 模式：split borrow\n\n" +
      "```rust\nfn split(buf: &mut [u8]) -> (&mut [u8], &mut [u8]) {\n    let mid = buf.len() / 2;\n    buf.split_at_mut(mid)\n}\n```\n\n" +
      "## 关键判断\n\n" +
      "1. NLL（non-lexical lifetimes）允许借用提前结束\n" +
      "2. `split_at_mut` 在 stdlib 内用 unsafe 划分，外面看到两个不重叠的 &mut\n" +
      "3. 字段级借用：编译器能识别 struct 字段独立\n\n" +
      "#Rust #笔记",
    tags: ["Rust", "笔记"],
    updatedAt: "06·12 23:18",
  },
];

const TASKS: KnowledgeTask[] = [
  { id: "t-101", projectId: "proj-product", title: "整理 6 月用户访谈共性问题", status: "doing", boardColumnId: "col-doing", linkedNoteId: "n-002", tags: ["访谈"] },
  { id: "t-102", projectId: "proj-product", title: "草拟 v2 看板拖拽交互", status: "todo", boardColumnId: "col-todo", linkedNoteId: "n-004", tags: ["设计"] },
  { id: "t-103", projectId: "proj-product", title: "对比 chunk 大小 800 / 1200 / 1600", status: "todo", boardColumnId: "col-todo", linkedNoteId: "n-003", tags: ["技术"] },
  { id: "t-104", projectId: "proj-product", title: "确认 sqlite-vec 在 Windows ARM 上的可行性", status: "doing", boardColumnId: "col-doing", tags: ["技术"] },
  { id: "t-105", projectId: "proj-product", title: "降级文案 Review", status: "done", boardColumnId: "col-done", linkedNoteId: "n-005", tags: ["文案"] },
  { id: "t-106", projectId: "proj-product", title: "归档 5 月旧迭代记录", status: "archived", boardColumnId: "col-archived", tags: [] },
  { id: "t-107", projectId: "proj-product", title: "整理 RRF 公式来源出处", status: "done", boardColumnId: "col-done", linkedNoteId: "n-003", tags: ["技术"] },
  { id: "t-108", projectId: "proj-product", title: "导出本周专注热力图", status: "todo", boardColumnId: "col-todo", tags: [] },
];

const BOARD_COLUMNS: BoardColumnMock[] = [
  { id: "col-todo", title: "待办", status: "todo" },
  { id: "col-doing", title: "进行中", status: "doing" },
  { id: "col-done", title: "已完成", status: "done" },
  { id: "col-archived", title: "归档", status: "archived" },
];

/**
 * 从 markdown body 中派生列表用摘要：取第一段非标题/非空白文本，去掉常见 markdown 标记。
 * 实现简单，够列表展示用；不追求完整反 markdown 解析。
 */
export function deriveExcerpt(body: string, maxChars = 120): string {
  if (!body) return "";
  const blocks = body.split(/\n{2,}/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    // 跳过标题、引用、代码块、列表项符号
    if (/^(#{1,6}\s|>\s|```|---|\[)/.test(trimmed)) continue;
    if (/^[*\-+]\s|^\d+\.\s/.test(trimmed)) {
      // 列表项也可作摘要，但去掉前缀
      const stripped = trimmed.replace(/^[*\-+]\s|^\d+\.\s/, "");
      return clampExcerpt(stripMarkdown(stripped), maxChars);
    }
    return clampExcerpt(stripMarkdown(trimmed), maxChars);
  }
  return clampExcerpt(stripMarkdown(body.trim()), maxChars);
}

function stripMarkdown(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // 链接 / 图片 → alt 文本
    .replace(/`([^`]+)`/g, "$1") // 行内 code
    .replace(/\*\*([^*]+)\*\*/g, "$1") // 粗体
    .replace(/\*([^*]+)\*/g, "$1") // 斜体
    .replace(/[#>*_~`]/g, "") // 残留符号
    .replace(/\s+/g, " ")
    .trim();
}

function clampExcerpt(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1)}…`;
}

function formatNowKwStyle(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${m}·${d} ${hh}:${mm}`;
}

export function useKnowledgeMock() {
  const projects = ref<KnowledgeProject[]>(PROJECTS);
  const notesRef = ref<KnowledgeNote[]>([...NOTES_INIT]);
  const activeProjectId = ref<string>("proj-product");
  const activeView = ref<KnowledgeViewKey>("notes");
  const activeNoteId = ref<string>("n-003");
  const searchQuery = ref<string>("");
  const indexStatus = ref<IndexStatus>("ok");

  const activeProject = computed<KnowledgeProject | null>(
    () => projects.value.find((p) => p.id === activeProjectId.value) ?? null,
  );

  const projectNotes = computed<KnowledgeNote[]>(() =>
    notesRef.value.filter((n) => n.projectId === activeProjectId.value),
  );

  const projectTasks = computed<KnowledgeTask[]>(() =>
    TASKS.filter((t) => t.projectId === activeProjectId.value),
  );

  const activeNote = computed<KnowledgeNote | null>(() => {
    const list = projectNotes.value;
    return list.find((n) => n.id === activeNoteId.value) ?? list[0] ?? null;
  });

  function selectProject(id: string): void {
    activeProjectId.value = id;
    const firstNote = notesRef.value.find((n) => n.projectId === id);
    activeNoteId.value = firstNote?.id ?? "";
  }

  function selectView(view: KnowledgeViewKey): void {
    activeView.value = view;
  }

  function selectNote(id: string): void {
    activeNoteId.value = id;
  }

  /**
   * 写入笔记正文（仅内存，刷新即丢失，符合 mock 范围）。
   */
  function setNoteBody(id: string, body: string): void {
    const next = notesRef.value.map((n) =>
      n.id === id ? { ...n, body, updatedAt: formatNowKwStyle() } : n,
    );
    notesRef.value = next;
  }

  return {
    projects,
    activeProject,
    activeProjectId,
    activeView,
    activeNoteId,
    activeNote,
    projectNotes,
    projectTasks,
    boardColumns: ref<BoardColumnMock[]>(BOARD_COLUMNS),
    searchQuery,
    indexStatus,
    selectProject,
    selectView,
    selectNote,
    setNoteBody,
  };
}

export type KnowledgeMockState = ReturnType<typeof useKnowledgeMock>;

export const VIEW_LABELS: Record<KnowledgeViewKey, string> = {
  notes: "笔记",
  board: "看板",
  tasks: "任务",
};

export const INDEX_STATUS_LABELS: Record<IndexStatus, string> = {
  ok: "FTS+向量 正常",
  fts_only: "仅 FTS 可用",
  indexing: "索引中…",
};
