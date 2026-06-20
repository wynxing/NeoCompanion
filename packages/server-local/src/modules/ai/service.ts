import type { AiConversationStore, KnowledgeStore } from "@neo-companion/db";
import type {
  AiAnswer,
  AiRetrievalMode,
  ChatMessage,
  ContextLevel,
  KnowledgeSource
} from "@neo-companion/shared";
import type { WsHub } from "../../ws-hub";
import type { KnowledgeService } from "../knowledge/service";
import { buildAskBlocks, packContext, type ContextBlock } from "./context";
import { injectSources, parseAndAuditCitations, buildSources } from "./citation";

/** Token budget reserved for packed knowledge context (notes/tasks/chunks). */
const CONTEXT_TOKEN_BUDGET = 6000;
const DEFAULT_SYSTEM_PROMPT = "你是 NeoCompanion 的中文温柔陪伴助手，回答简洁、具体，不使用强主宠称呼。";

export interface ChatContextSelection {
  notes: Record<string, ContextLevel>;
  tasks: Record<string, ContextLevel>;
}

export interface AiServiceDeps {
  conversationStore: AiConversationStore | null;
  knowledgeService: KnowledgeService | null;
  knowledgeStore: KnowledgeStore | null;
  aiStream: (messages: ChatMessage[]) => AsyncIterable<string>;
  hub: WsHub;
}

export interface ChatRequest {
  message: string;
  projectId?: string | null;
  context?: ChatContextSelection;
  conversationId?: string;
}

export interface AskRequest {
  message: string;
  projectId?: string | null;
}

export function createAiService(deps: AiServiceDeps) {
  const { conversationStore, knowledgeService, knowledgeStore, aiStream, hub } = deps;

  async function streamReply(messages: ChatMessage[]): Promise<string> {
    let text = "";
    for await (const chunk of aiStream(messages)) {
      text += chunk;
      hub.broadcast({ type: "ai:chunk", payload: { chunk } });
    }
    return text;
  }

  /** Plain fallback chat (no knowledge context), preserving existing behavior. */
  async function plainChat(message: string): Promise<AiAnswer> {
    const messages: ChatMessage[] = [
      { role: "system", content: DEFAULT_SYSTEM_PROMPT },
      { role: "user", content: message }
    ];
    hub.broadcast({ type: "companion:feedback", payload: { state: "thinking", text: "我想一想。", speak: false } });
    const text = await streamReply(messages);
    const answer: AiAnswer = { text, sources: [], retrievalMode: "chat" };
    hub.broadcast({ type: "ai:done", payload: answer });
    return answer;
  }

  async function handleChat(req: ChatRequest): Promise<AiAnswer> {
    const ctx = req.context;
    const hasSelection = ctx && (Object.keys(ctx.notes).length || Object.keys(ctx.tasks).length);
    if (!hasSelection || !knowledgeStore) {
      return plainChat(req.message);
    }

    // Resolve selected notes/tasks into context blocks.
    const noteBlocks: ContextBlock[] = [];
    const sourceLookup = new Map<string, KnowledgeSource>();
    for (const [noteId, level] of Object.entries(ctx.notes)) {
      if (level === "excluded") continue;
      const note = knowledgeStore.getNote(noteId);
      if (!note) continue;
      noteBlocks.push({
        type: "note",
        ref: note.id,
        content: level === "summary" ? note.body.slice(0, 400) : `${note.title}\n\n${note.body}`,
        weight: level === "summary" ? 70 : 100,
        ordinal: noteBlocks.length
      });
      sourceLookup.set(note.id, {
        sourceType: "note", sourceId: note.id, projectId: note.projectId,
        title: note.title, excerpt: note.body.slice(0, 120), chunkId: note.id
      });
    }
    const taskBlocks: ContextBlock[] = [];
    for (const [taskId, level] of Object.entries(ctx.tasks)) {
      if (level === "excluded") continue;
      const task = knowledgeStore.tasksForProject(req.projectId ?? "").find((t) => t.id === taskId);
      if (!task) continue;
      const content = task.description ? `${task.title}\n\n${task.description}` : task.title;
      taskBlocks.push({ type: "task", ref: task.id, content, weight: 55, ordinal: taskBlocks.length });
      sourceLookup.set(task.id, {
        sourceType: "task", sourceId: task.id, projectId: task.projectId,
        title: task.title, excerpt: content.slice(0, 120), chunkId: task.id
      });
    }

    const packed = packContext([...noteBlocks, ...taskBlocks], CONTEXT_TOKEN_BUDGET);
    if (!packed.ordered.length) return plainChat(req.message);

    const injected = injectSources(packed.ordered);
    const validIds = new Set(injected.idToRef.keys());

    // Multi-turn: load history for the conversation.
    let conversationId = req.conversationId;
    const historyMessages: ChatMessage[] = [];
    if (conversationStore && conversationId) {
      const msgs = conversationStore.listMessages(conversationId);
      for (const m of msgs) {
        if (m.role === "user" || m.role === "assistant") {
          historyMessages.push({ role: m.role, content: m.content });
        }
      }
    } else if (conversationStore && req.projectId !== undefined) {
      const conv = conversationStore.createConversation(req.projectId ?? null, "chat");
      conversationId = conv.id;
    }

    const messages: ChatMessage[] = [
      { role: "system", content: `${injected.systemPrompt}\n\n${injected.contextText}` },
      ...historyMessages,
      { role: "user", content: req.message }
    ];

    hub.broadcast({ type: "companion:feedback", payload: { state: "thinking", text: "我想一想。", speak: false } });
    let text: string;
    try {
      text = await streamReply(messages);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "AI request failed";
      hub.broadcast({ type: "ai:error", payload: { message: msg } });
      throw error;
    }

    const audited = parseAndAuditCitations(text, validIds);
    const sources = buildSources(injected, audited.citedIds, sourceLookup);

    // Persist the turn.
    if (conversationStore && conversationId) {
      conversationStore.appendMessage(conversationId, "user", req.message);
      conversationStore.appendMessage(conversationId, "assistant", audited.cleanedText, sources);
    }

    const answer: AiAnswer = { text: audited.cleanedText, sources, retrievalMode: "chat" };
    hub.broadcast({ type: "ai:done", payload: answer });
    return answer;
  }

  async function handleAsk(req: AskRequest): Promise<AiAnswer> {
    if (!knowledgeService || !req.projectId) return plainChat(req.message);

    const sources = await knowledgeService.searchHybrid(req.projectId, req.message, 8);
    if (!sources.length) return plainChat(req.message);

    const sourceLookup = new Map<string, KnowledgeSource>();
    sources.forEach((s) => sourceLookup.set(s.sourceId, s));
    const blocks = buildAskBlocks(sources, new Map());
    const packed = packContext(blocks, CONTEXT_TOKEN_BUDGET);
    if (!packed.ordered.length) return plainChat(req.message);

    const injected = injectSources(packed.ordered);
    const validIds = new Set(injected.idToRef.keys());

    const messages: ChatMessage[] = [
      { role: "system", content: `${injected.systemPrompt}\n\n${injected.contextText}` },
      { role: "user", content: req.message }
    ];

    hub.broadcast({ type: "companion:feedback", payload: { state: "thinking", text: "我查一下笔记。", speak: false } });
    let text: string;
    try {
      text = await streamReply(messages);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "AI request failed";
      hub.broadcast({ type: "ai:error", payload: { message: msg } });
      throw error;
    }

    const audited = parseAndAuditCitations(text, validIds);
    const finalSources = buildSources(injected, audited.citedIds, sourceLookup);

    // Ask is one-shot; persist a single-turn conversation for history.
    if (conversationStore && req.projectId) {
      const conv = conversationStore.createConversation(req.projectId, "ask");
      conversationStore.appendMessage(conv.id, "user", req.message);
      conversationStore.appendMessage(conv.id, "assistant", audited.cleanedText, finalSources);
    }

    const answer: AiAnswer = { text: audited.cleanedText, sources: finalSources, retrievalMode: "ask" };
    hub.broadcast({ type: "ai:done", payload: answer });
    return answer;
  }

  return { handleChat, handleAsk, plainChat };
}

export type AiService = ReturnType<typeof createAiService>;

export function resolveMode(mode: unknown): AiRetrievalMode {
  return mode === "ask" ? "ask" : "chat";
}
