import { Static, Type } from "@sinclair/typebox";

// ── Common Params ──
export const IdParamSchema = Type.Object({ id: Type.String({ minLength: 1 }) });
export type IdParam = Static<typeof IdParamSchema>;

export const ProjectIdParamSchema = Type.Object({ id: Type.String({ minLength: 1 }) });
export type ProjectIdParam = Static<typeof ProjectIdParamSchema>;

export const NoteIdParamSchema = Type.Object({ id: Type.String({ minLength: 1 }) });
export type NoteIdParam = Static<typeof NoteIdParamSchema>;

export const ColumnIdParamSchema = Type.Object({ id: Type.String({ minLength: 1 }) });
export type ColumnIdParam = Static<typeof ColumnIdParamSchema>;

export const TaskIdParamSchema = Type.Object({ id: Type.String({ minLength: 1 }) });
export type TaskIdParam = Static<typeof TaskIdParamSchema>;

// ── Error Response ──
export const ErrorSchema = Type.Object({
  error: Type.String(),
  code: Type.Optional(Type.String()),
  details: Type.Optional(Type.Unknown())
});
export type Error = Static<typeof ErrorSchema>;

// ── Tasks (pet-panel simple task) ──
export const TaskListQuerySchema = Type.Object({
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Number({ minimum: 0, default: 0 }))
});
export type TaskListQuery = Static<typeof TaskListQuerySchema>;

export const TaskListResponseSchema = Type.Object({
  items: Type.Array(
    Type.Object({
      id: Type.String(),
      title: Type.String(),
      status: Type.Union([Type.Literal("open"), Type.Literal("done")]),
      createdAt: Type.String(),
      completedAt: Type.Union([Type.String(), Type.Null()])
    })
  ),
  total: Type.Integer({ minimum: 0 })
});
export type TaskListResponse = Static<typeof TaskListResponseSchema>;

export const TaskCreateBodySchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 500 })
});
export type TaskCreateBody = Static<typeof TaskCreateBodySchema>;

export const TaskPatchBodySchema = Type.Object({
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
  status: Type.Optional(Type.Union([Type.Literal("open"), Type.Literal("done")]))
});
export type TaskPatchBody = Static<typeof TaskPatchBodySchema>;

// ── TTS ──
export const TtsSpeakBodySchema = Type.Object({
  text: Type.String({ minLength: 1, maxLength: 10000 }),
  style: Type.Optional(Type.String({ maxLength: 200 }))
});
export type TtsSpeakBody = Static<typeof TtsSpeakBodySchema>;

// ── AI Chat ──
export const ContextLevelSchema = Type.Union([
  Type.Literal("full"),
  Type.Literal("summary"),
  Type.Literal("excluded")
]);
export const ChatContextSelectionSchema = Type.Object({
  notes: Type.Record(Type.String(), ContextLevelSchema),
  tasks: Type.Record(Type.String(), ContextLevelSchema)
});

export const AiChatBodySchema = Type.Object({
  message: Type.String({ minLength: 1, maxLength: 50000 }),
  mode: Type.Optional(Type.Union([Type.Literal("chat"), Type.Literal("ask")])),
  projectId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  context: Type.Optional(ChatContextSelectionSchema),
  conversationId: Type.Optional(Type.String())
});
export type AiChatBody = Static<typeof AiChatBodySchema>;

// ── Focus ──
export const FocusStartBodySchema = Type.Object({
  taskId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  durationMinutes: Type.Optional(Type.Number({ minimum: 1, maximum: 180, default: 25 }))
});
export type FocusStartBody = Static<typeof FocusStartBodySchema>;

// ── Hooks ──
export const HookPushBodySchema = Type.Object({
  agentId: Type.String({ minLength: 1 }),
  type: Type.Literal("status"),
  state: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  timestamp: Type.Optional(Type.Number({ minimum: 0 }))
});
export type HookPushBody = Static<typeof HookPushBodySchema>;

export const HookPermissionBodySchema = Type.Object({
  agentId: Type.String({ minLength: 1 }),
  command: Type.String({ minLength: 1 }),
  severity: Type.Number({ minimum: 0, maximum: 10 }),
  description: Type.Optional(Type.String())
});
export type HookPermissionBody = Static<typeof HookPermissionBodySchema>;

export const HookAlwaysRuleDeleteBodySchema = Type.Object({
  agentId: Type.String({ minLength: 1 }),
  commandPrefix: Type.String({ minLength: 1 })
});
export type HookAlwaysRuleDeleteBody = Static<typeof HookAlwaysRuleDeleteBodySchema>;

// ── Knowledge: Projects ──
export const ProjectListQuerySchema = Type.Object({
  parentId: Type.Optional(Type.String()),
  root: Type.Optional(Type.Union([Type.Literal("1"), Type.Literal("0")]))
});
export type ProjectListQuery = Static<typeof ProjectListQuerySchema>;

export const ProjectCreateBodySchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 200 }),
  parentId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  description: Type.Optional(Type.String()),
  color: Type.Optional(Type.String({ maxLength: 50 })),
  icon: Type.Optional(Type.String({ maxLength: 50 }))
});
export type ProjectCreateBody = Static<typeof ProjectCreateBodySchema>;

export const ProjectPatchBodySchema = Type.Object({
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  description: Type.Optional(Type.String()),
  color: Type.Optional(Type.String({ maxLength: 50 })),
  icon: Type.Optional(Type.String({ maxLength: 50 })),
  parentId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  order: Type.Optional(Type.Number())
});
export type ProjectPatchBody = Static<typeof ProjectPatchBodySchema>;

// ── Knowledge: Notes ──
export const NoteCreateBodySchema = Type.Object({
  title: Type.Optional(Type.String({ maxLength: 500 }))
});
export type NoteCreateBody = Static<typeof NoteCreateBodySchema>;

export const NotePatchBodySchema = Type.Object({
  title: Type.Optional(Type.String({ maxLength: 500 })),
  body: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String()))
});
export type NotePatchBody = Static<typeof NotePatchBodySchema>;

// ── Knowledge: Columns ──
export const KnowledgeTaskStatusSchema = Type.Union([
  Type.Literal("todo"),
  Type.Literal("doing"),
  Type.Literal("done"),
  Type.Literal("archived")
]);

export const ColumnCreateBodySchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 200 }),
  status: Type.Optional(KnowledgeTaskStatusSchema),
  order: Type.Optional(Type.Number())
});
export type ColumnCreateBody = Static<typeof ColumnCreateBodySchema>;

export const ColumnPatchBodySchema = Type.Object({
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  status: Type.Optional(KnowledgeTaskStatusSchema),
  order: Type.Optional(Type.Number())
});
export type ColumnPatchBody = Static<typeof ColumnPatchBodySchema>;

// ── Knowledge: Tasks (kanban) ──
export const KnowledgeTaskCreateBodySchema = Type.Object({
  columnId: Type.String(),
  title: Type.String({ minLength: 1, maxLength: 500 })
});
export type KnowledgeTaskCreateBody = Static<typeof KnowledgeTaskCreateBodySchema>;

export const KnowledgeTaskPatchBodySchema = Type.Object({
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
  description: Type.Optional(Type.String()),
  status: Type.Optional(KnowledgeTaskStatusSchema),
  columnId: Type.Optional(Type.String()),
  order: Type.Optional(Type.Number()),
  linkedNoteId: Type.Optional(Type.Union([Type.String(), Type.Null()]))
});
export type KnowledgeTaskPatchBody = Static<typeof KnowledgeTaskPatchBodySchema>;

export const KnowledgeTaskMoveBodySchema = Type.Object({
  columnId: Type.Optional(Type.String()),
  index: Type.Optional(Type.Number({ minimum: 0, default: 0 }))
});
export type KnowledgeTaskMoveBody = Static<typeof KnowledgeTaskMoveBodySchema>;

// ── Knowledge: Search ──
export const KnowledgeSearchQuerySchema = Type.Object({
  q: Type.String({ minLength: 1 }),
  projectId: Type.Optional(Type.String()),
  limit: Type.Optional(Type.String()) // Number.parseInt later
});
export type KnowledgeSearchQuery = Static<typeof KnowledgeSearchQuerySchema>;

// ── Knowledge: Reindex ──
export const KnowledgeReindexBodySchema = Type.Object({
  embeddingModel: Type.Optional(Type.String())
});
export type KnowledgeReindexBody = Static<typeof KnowledgeReindexBodySchema>;

// ── Knowledge: Embedding Config ──
export const EmbeddingProviderSchema = Type.Union([
  Type.Literal("none"),
  Type.Literal("openai"),
  Type.Literal("siliconflow"),
  Type.Literal("custom")
]);

export const EmbeddingConfigBodySchema = Type.Object({
  provider: Type.Optional(EmbeddingProviderSchema),
  baseUrl: Type.Optional(Type.String()),
  apiKey: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  model: Type.Optional(Type.String()),
  apiKeySource: Type.Optional(Type.Union([Type.Literal("env"), Type.Literal("keychain")]))
});
export type EmbeddingConfigBody = Static<typeof EmbeddingConfigBodySchema>;

// ── Knowledge: Root Path ──
export const RootPathBodySchema = Type.Object({
  path: Type.String()
});
export type RootPathBody = Static<typeof RootPathBodySchema>;

// ── Knowledge: Mirror ──
export const MirrorPathBodySchema = Type.Object({
  path: Type.Optional(Type.String())
});
export type MirrorPathBody = Static<typeof MirrorPathBodySchema>;
