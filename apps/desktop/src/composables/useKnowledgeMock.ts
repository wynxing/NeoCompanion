import { computed, ref } from "vue";

/**
 * Knowledge workspace mock composable — v2 redesign phase.
 * 支持嵌套项目、按项目自定义看板列、笔记/任务 CRUD、双向链接扫描。
 * 仍是纯前端 mock，不连 sidecar/WS，但数据模型与 docs/ARCHITECTURE.md 对齐。
 */

export type KnowledgeViewTab = "notes" | "board" | "tasks" | "projects" | "ai";
export type IndexStatus = "ok" | "fts_only" | "indexing";
export type TaskStatus = "todo" | "doing" | "done" | "archived";

export interface KnowledgeProject {
  id: string;
  title: string;
  description?: string;
  parentId: string | null;
  color?: string;
  icon?: string;
  isInbox?: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeNote {
  id: string;
  projectId: string;
  title: string;
  /** Markdown 全文（SSOT）。列表显示请用 `deriveExcerpt(body)` 派生。 */
  body: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeTask {
  id: string;
  projectId: string;
  columnId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  order: number;
  linkedNoteId?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface BoardColumn {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  order: number;
}

export interface KnowledgeLink {
  sourceId: string;
  sourceType: "note" | "task";
  targetId: string;
  targetType: "note" | "task";
  label: string;
}

const NOW = Date.now();
const DAY = 86_400_000;

const PROJECTS: KnowledgeProject[] = [
  {
    id: "inbox",
    title: "收件箱",
    description: "临时想法与未分类内容",
    parentId: null,
    color: "#6b7280",
    isInbox: true,
    order: 0,
    createdAt: NOW - DAY * 30,
    updatedAt: NOW - DAY,
  },
  {
    id: "proj-product",
    title: "产品研究",
    description: "NeoCompanion 产品方向与迭代",
    parentId: null,
    color: "#3b82f6",
    order: 1,
    createdAt: NOW - DAY * 20,
    updatedAt: NOW - DAY * 2,
  },
  {
    id: "proj-product-competitor",
    title: "竞品调研",
    description: "本地优先笔记与 AI 助手竞品",
    parentId: "proj-product",
    color: "#0ea5e9",
    order: 0,
    createdAt: NOW - DAY * 15,
    updatedAt: NOW - DAY * 3,
  },
  {
    id: "proj-product-user",
    title: "用户研究",
    description: "用户访谈与需求分析",
    parentId: "proj-product",
    color: "#8b5cf6",
    order: 1,
    createdAt: NOW - DAY * 12,
    updatedAt: NOW - DAY * 4,
  },
  {
    id: "proj-learning",
    title: "学习笔记",
    description: "技术、设计与阅读",
    parentId: null,
    color: "#22c55e",
    order: 2,
    createdAt: NOW - DAY * 18,
    updatedAt: NOW - DAY * 1,
  },
  {
    id: "proj-writing",
    title: "写作素材",
    description: "文章、文案与灵感",
    parentId: null,
    color: "#f59e0b",
    order: 3,
    createdAt: NOW - DAY * 10,
    updatedAt: NOW - DAY * 5,
  },
];

const NOTES_INIT: KnowledgeNote[] = [
  {
    id: "n-001",
    projectId: "proj-product-competitor",
    title: "竞品分析：本地优先笔记应用",
    body:
      "# 竞品分析：本地优先笔记应用\n\n" +
      "Obsidian、Logseq、Reflect 在本地数据、双向链接、AI 检索三个维度的能力对比。\n\n" +
      "| 应用 | 本地数据 | 双向链接 | AI 检索 |\n" +
      "| ---- | -------- | -------- | ------- |\n" +
      "| Obsidian | ✅ Markdown 文件 | ✅ 强 | ⚠️ 插件 |\n" +
      "| Logseq | ✅ Markdown/Org | ✅ 强 | ⚠️ 插件 |\n" +
      "| Reflect | ⚠️ 云优先 | ✅ 中 | ✅ 内建 |\n\n" +
      "结论：本地优先 + 内建 AI 检索是差异化方向。\n\n" +
      "相关：[[Rust borrow checker 速记]]",
    tags: ["竞品", "调研"],
    createdAt: NOW - DAY * 5,
    updatedAt: NOW - DAY * 2,
  },
  {
    id: "n-002",
    projectId: "proj-product-user",
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
    createdAt: NOW - DAY * 6,
    updatedAt: NOW - DAY * 4,
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
      "任一条件触发后退化为纯 FTS5，并在 UI 显式标注「仅 FTS 可用」。\n\n" +
      "延伸阅读：[[竞品分析：本地优先笔记应用]]",
    tags: ["技术", "检索"],
    createdAt: NOW - DAY * 8,
    updatedAt: NOW - DAY * 3,
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
    createdAt: NOW - DAY * 10,
    updatedAt: NOW - DAY * 6,
  },
  {
    id: "n-005",
    projectId: "proj-product",
    title: "降级体验文案",
    body:
      "# 降级体验文案\n\n" +
      "Embedding 不可用时如何向用户清晰说明，避免误以为 AI 在编造。\n\n" +
      "原则：*告诉用户当前能力的真实边界*，使用 `仅 FTS 可用` 这种带形容词的明确文案，" +
      "而不是模糊的 `检索受限`。\n\n" +
      "#文案",
    tags: ["文案"],
    createdAt: NOW - DAY * 12,
    updatedAt: NOW - DAY * 8,
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
    createdAt: NOW - DAY * 4,
    updatedAt: NOW - DAY * 1,
  },
  {
    id: "n-007",
    projectId: "inbox",
    title: "临时想法：AI 引用卡片",
    body:
      "# 临时想法：AI 引用卡片\n\n" +
      "在 AI 回答里把引用来源做成可点击卡片，跳转到对应笔记段落。\n\n" +
      "参考：[[FTS5 与 sqlite-vec 融合策略]]",
    tags: ["想法"],
    createdAt: NOW - DAY * 2,
    updatedAt: NOW - DAY * 1,
  },
];

const BOARD_COLUMNS_INIT: BoardColumn[] = [
  { id: "col-product-todo", projectId: "proj-product", title: "待办", status: "todo", order: 0 },
  { id: "col-product-doing", projectId: "proj-product", title: "进行中", status: "doing", order: 1 },
  { id: "col-product-done", projectId: "proj-product", title: "已完成", status: "done", order: 2 },
  { id: "col-competitor-todo", projectId: "proj-product-competitor", title: "待调研", status: "todo", order: 0 },
  { id: "col-competitor-done", projectId: "proj-product-competitor", title: "已整理", status: "done", order: 1 },
  { id: "col-user-todo", projectId: "proj-product-user", title: "待访谈", status: "todo", order: 0 },
  { id: "col-user-doing", projectId: "proj-product-user", title: "分析中", status: "doing", order: 1 },
  { id: "col-user-done", projectId: "proj-product-user", title: "已归档", status: "done", order: 2 },
  { id: "col-learning-todo", projectId: "proj-learning", title: "待学", status: "todo", order: 0 },
  { id: "col-learning-done", projectId: "proj-learning", title: "已总结", status: "done", order: 1 },
  { id: "col-writing-todo", projectId: "proj-writing", title: "素材", status: "todo", order: 0 },
  { id: "col-writing-done", projectId: "proj-writing", title: "成稿", status: "done", order: 1 },
  { id: "col-inbox-todo", projectId: "inbox", title: "待处理", status: "todo", order: 0 },
  { id: "col-inbox-done", projectId: "inbox", title: "已归档", status: "done", order: 1 },
];

const TASKS_INIT: KnowledgeTask[] = [
  { id: "t-101", projectId: "proj-product-user", columnId: "col-user-doing", title: "整理 6 月用户访谈共性问题", status: "doing", order: 0, linkedNoteId: "n-002", tags: ["访谈"], createdAt: NOW - DAY * 4, updatedAt: NOW - DAY * 1 },
  { id: "t-102", projectId: "proj-product", columnId: "col-product-todo", title: "草拟 v2 看板拖拽交互", status: "todo", order: 0, linkedNoteId: "n-004", tags: ["设计"], createdAt: NOW - DAY * 5, updatedAt: NOW - DAY * 2 },
  { id: "t-103", projectId: "proj-product", columnId: "col-product-todo", title: "对比 chunk 大小 800 / 1200 / 1600", status: "todo", order: 1, linkedNoteId: "n-003", tags: ["技术"], createdAt: NOW - DAY * 5, updatedAt: NOW - DAY * 2 },
  { id: "t-104", projectId: "proj-product", columnId: "col-product-doing", title: "确认 sqlite-vec 在 Windows ARM 上的可行性", status: "doing", order: 0, tags: ["技术"], createdAt: NOW - DAY * 3, updatedAt: NOW - DAY * 1 },
  { id: "t-105", projectId: "proj-product", columnId: "col-product-done", title: "降级文案 Review", status: "done", order: 0, linkedNoteId: "n-005", tags: ["文案"], createdAt: NOW - DAY * 8, updatedAt: NOW - DAY * 6 },
  { id: "t-106", projectId: "proj-product", columnId: "col-product-done", title: "归档 5 月旧迭代记录", status: "done", order: 1, tags: [], createdAt: NOW - DAY * 10, updatedAt: NOW - DAY * 8 },
  { id: "t-107", projectId: "proj-product-competitor", columnId: "col-competitor-done", title: "整理 RRF 公式来源出处", status: "done", order: 0, linkedNoteId: "n-003", tags: ["技术"], createdAt: NOW - DAY * 6, updatedAt: NOW - DAY * 4 },
  { id: "t-108", projectId: "proj-learning", columnId: "col-learning-todo", title: "导出本周专注热力图", status: "todo", order: 0, tags: [], createdAt: NOW - DAY * 2, updatedAt: NOW - DAY * 1 },
  { id: "t-109", projectId: "inbox", columnId: "col-inbox-todo", title: "把 AI 引用卡片想法写成笔记", status: "todo", order: 0, linkedNoteId: "n-007", tags: ["想法"], createdAt: NOW - DAY * 1, updatedAt: NOW - DAY * 1 },
];

let nextId = 1000;

function uid(prefix: string): string {
  nextId += 1;
  return `${prefix}-${String(nextId).padStart(4, "0")}`;
}

export function formatKwTime(timestamp: number): string {
  const d = new Date(timestamp);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${m}·${day} ${hh}:${mm}`;
}

export function deriveExcerpt(body: string, maxChars = 120): string {
  if (!body) return "";
  const blocks = body.split(/\n{2,}/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (/^(#{1,6}\s|>\s|```|---|\[)/.test(trimmed)) continue;
    if (/^[*\-+]\s|^\d+\.\s/.test(trimmed)) {
      const stripped = trimmed.replace(/^[*\-+]\s|^\d+\.\s/, "");
      return clampExcerpt(stripMarkdown(stripped), maxChars);
    }
    return clampExcerpt(stripMarkdown(trimmed), maxChars);
  }
  return clampExcerpt(stripMarkdown(body.trim()), maxChars);
}

function stripMarkdown(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/[#>*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clampExcerpt(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1)}…`;
}

const LINK_REGEX = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

function parseWikiLink(raw: string): { target: string; display: string } {
  const parts = raw.split("|").map((s) => s.trim());
  const target = parts[0];
  const display = parts[1] ?? target;
  return { target, display };
}

function scanLinks(notes: KnowledgeNote[], tasks: KnowledgeTask[]): KnowledgeLink[] {
  const noteByTitle = new Map<string, KnowledgeNote>();
  const noteById = new Map<string, KnowledgeNote>();
  const taskById = new Map<string, KnowledgeTask>();

  for (const note of notes) {
    noteById.set(note.id, note);
    noteByTitle.set(note.title.toLowerCase(), note);
  }
  for (const task of tasks) {
    taskById.set(task.id, task);
  }

  const links: KnowledgeLink[] = [];

  for (const note of notes) {
    for (const match of note.body.matchAll(LINK_REGEX)) {
      const { target } = parseWikiLink(match[1]);
      const resolved = resolveLinkTarget(target, noteByTitle, noteById, taskById);
      if (resolved) {
        links.push({
          sourceId: note.id,
          sourceType: "note",
          targetId: resolved.id,
          targetType: resolved.type,
          label: target,
        });
      }
    }
  }

  return links;
}

function resolveLinkTarget(
  label: string,
  noteByTitle: Map<string, KnowledgeNote>,
  noteById: Map<string, KnowledgeNote>,
  taskById: Map<string, KnowledgeTask>,
): { type: "note" | "task"; id: string } | null {
  const key = label.toLowerCase();
  const noteByTitleMatch = noteByTitle.get(key);
  if (noteByTitleMatch) return { type: "note", id: noteByTitleMatch.id };
  const noteByIdMatch = noteById.get(label);
  if (noteByIdMatch) return { type: "note", id: noteByIdMatch.id };
  const taskByIdMatch = taskById.get(label);
  if (taskByIdMatch) return { type: "task", id: taskByIdMatch.id };
  return null;
}

export function useKnowledgeMock() {
  const projects = ref<KnowledgeProject[]>([...PROJECTS]);
  const notesRef = ref<KnowledgeNote[]>([...NOTES_INIT]);
  const tasksRef = ref<KnowledgeTask[]>([...TASKS_INIT]);
  const columnsRef = ref<BoardColumn[]>([...BOARD_COLUMNS_INIT]);
  const indexStatus = ref<IndexStatus>("ok");
  // Mock is always ready synchronously; satisfies KnowledgeDataSource.
  const lastError = ref<string | null>(null);

  const projectById = computed(() => buildProjectById(projects.value));
  const childrenByParentId = computed(() => buildChildrenByParentId(projects.value));
  const links = computed(() => scanLinks(notesRef.value, tasksRef.value));

  function childProjects(projectId: string): KnowledgeProject[] {
    return childrenByParentId.value.get(projectId) ?? [];
  }

  function projectPath(projectId: string): KnowledgeProject[] {
    const path: KnowledgeProject[] = [];
    let current = projectById.value.get(projectId);
    while (current) {
      path.unshift(current);
      current = current.parentId ? projectById.value.get(current.parentId) : undefined;
    }
    return path;
  }

  function notesForProject(projectId: string): KnowledgeNote[] {
    return notesRef.value.filter((n) => n.projectId === projectId);
  }

  function tasksForProject(projectId: string): KnowledgeTask[] {
    return tasksRef.value.filter((t) => t.projectId === projectId);
  }

  function columnsForProject(projectId: string): BoardColumn[] {
    return columnsRef.value
      .filter((c) => c.projectId === projectId)
      .sort((a, b) => a.order - b.order);
  }

  function createNote(projectId: string, title: string): KnowledgeNote {
    const now = Date.now();
    const note: KnowledgeNote = {
      id: uid("n"),
      projectId,
      title: title.trim(),
      body: `# ${title.trim()}\n\n`,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    notesRef.value = [...notesRef.value, note];
    return note;
  }

  function updateNote(id: string, patch: Partial<KnowledgeNote>): void {
    const now = Date.now();
    const allowed: Partial<KnowledgeNote> = {
      title: patch.title,
      body: patch.body,
      tags: patch.tags,
      projectId: patch.projectId,
    };
    notesRef.value = notesRef.value.map((n) =>
      n.id === id ? { ...n, ...allowed, updatedAt: now } : n,
    );
  }

  function deleteNote(id: string): void {
    notesRef.value = notesRef.value.filter((n) => n.id !== id);
    tasksRef.value = tasksRef.value.map((t) =>
      t.linkedNoteId === id ? { ...t, linkedNoteId: undefined } : t,
    );
  }

  function createTask(projectId: string, columnId: string, title: string): KnowledgeTask | null {
    const column = columnsRef.value.find((c) => c.id === columnId);
    if (!column) return null;
    const now = Date.now();
    const maxOrder = tasksRef.value
      .filter((t) => t.columnId === columnId)
      .reduce((max, t) => Math.max(max, t.order), -1);
    const task: KnowledgeTask = {
      id: uid("t"),
      projectId,
      columnId,
      title: title.trim(),
      status: column.status,
      order: maxOrder + 1,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    tasksRef.value = [...tasksRef.value, task];
    return task;
  }

  function updateTask(id: string, patch: Partial<KnowledgeTask>): void {
    const now = Date.now();
    tasksRef.value = tasksRef.value.map((t) =>
      t.id === id ? { ...t, ...patch, updatedAt: now } : t,
    );
  }

  function deleteTask(id: string): void {
    tasksRef.value = tasksRef.value.filter((t) => t.id !== id);
  }

  function moveTask(taskId: string, targetColumnId: string, targetIndex: number): void {
    const task = tasksRef.value.find((t) => t.id === taskId);
    const targetColumn = columnsRef.value.find((c) => c.id === targetColumnId);
    if (!task || !targetColumn) return;

    const others = tasksRef.value.filter((t) => t.id !== taskId);
    const columnTasks = others
      .filter((t) => t.columnId === targetColumnId)
      .sort((a, b) => a.order - b.order);
    const before = columnTasks.slice(0, targetIndex);
    const after = columnTasks.slice(targetIndex);

    const nextTasks = others.filter((t) => t.columnId !== targetColumnId);

    const movedTask: KnowledgeTask = {
      ...task,
      columnId: targetColumnId,
      status: targetColumn.status,
      updatedAt: Date.now(),
    };

    const reordered = [...before, movedTask, ...after].map((t, index) => ({
      ...t,
      order: index,
    }));

    tasksRef.value = [...nextTasks, ...reordered];
  }

  function resolveLink(label: string): { type: "note" | "task"; id: string } | null {
    const { target } = parseWikiLink(label);
    const noteByTitle = new Map<string, KnowledgeNote>();
    const noteById = new Map<string, KnowledgeNote>();
    const taskById = new Map<string, KnowledgeTask>();
    for (const note of notesRef.value) {
      noteById.set(note.id, note);
      noteByTitle.set(note.title.toLowerCase(), note);
    }
    for (const task of tasksRef.value) {
      taskById.set(task.id, task);
    }
    return resolveLinkTarget(target, noteByTitle, noteById, taskById);
  }

  function backlinksFor(id: string): KnowledgeLink[] {
    return links.value.filter((l) => l.targetId === id);
  }

  return {
    projects,
    notes: notesRef,
    tasks: tasksRef,
    columns: columnsRef,
    indexStatus,
    lastError,
    projectById,
    childrenByParentId,
    childProjects,
    projectPath,
    notesForProject,
    tasksForProject,
    columnsForProject,
    links,
    createNote,
    updateNote,
    deleteNote,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    resolveLink,
    backlinksFor,
  };
}

function buildProjectById(projects: KnowledgeProject[]): Map<string, KnowledgeProject> {
  return projects.reduce((map, p) => {
    map.set(p.id, p);
    return map;
  }, new Map<string, KnowledgeProject>());
}

function buildChildrenByParentId(projects: KnowledgeProject[]): Map<string, KnowledgeProject[]> {
  const grouped = projects.reduce<Record<string, KnowledgeProject[]>>((acc, p) => {
    const key = p.parentId ?? "__root__";
    acc[key] = [...(acc[key] ?? []), p];
    return acc;
  }, {});

  return Object.entries(grouped).reduce((map, [key, list]) => {
    map.set(key, [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    return map;
  }, new Map<string, KnowledgeProject[]>());
}

export type KnowledgeMockState = ReturnType<typeof useKnowledgeMock>;

export const TAB_LABELS: Record<KnowledgeViewTab, string> = {
  notes: "笔记",
  board: "看板",
  tasks: "任务",
  projects: "子项目",
  ai: "AI",
};

export const INDEX_STATUS_LABELS: Record<IndexStatus, string> = {
  ok: "FTS+向量 正常",
  fts_only: "仅 FTS 可用",
  indexing: "索引中…",
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "待办",
  doing: "进行中",
  done: "已完成",
  archived: "已归档",
};
