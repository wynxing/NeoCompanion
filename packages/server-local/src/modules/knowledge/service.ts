import type { KnowledgeStore } from "@neo-companion/db";
import type { KnowledgeNote, KnowledgeTask, KnowledgeTaskStatus, KnowledgeSource, IndexStatus } from "@neo-companion/shared";
import { chunkMarkdown, chunkTask, resolveChunkingConfig, type Chunk } from "./chunker";

/**
 * Knowledge service: wraps the store so every note/task write triggers a
 * re-chunk + FTS5 sync. The chunker is pure (in this package); the store owns
 * the raw sqlite FTS writes. This keeps the db package free of a
 * server-local dependency.
 */
export function createKnowledgeService(store: KnowledgeStore) {
  const config = resolveChunkingConfig();

  function chunkNoteText(text: string): { content: string; contentHash: string }[] {
    return chunkMarkdown(text, config).map((c: Chunk) => ({ content: c.content, contentHash: c.contentHash }));
  }
  function chunkTaskText(text: string): { content: string; contentHash: string }[] {
    return chunkTask("", text, config).map((c: Chunk) => ({ content: c.content, contentHash: c.contentHash }));
  }

  return {
    config,

    reindexNote(note: KnowledgeNote): void {
      store.reindexNote(note, chunkNoteText);
    },

    reindexTask(task: KnowledgeTask): void {
      store.reindexTask(task, (text) => chunkTaskText(text));
    },

    search(projectId: string | null, query: string, limit = 20): KnowledgeSource[] {
      return store.searchFts(projectId, query, limit);
    },

    indexStatus(providerConfigured: boolean, vectorExtensionAvailable: boolean): IndexStatus {
      return store.getIndexStatus(providerConfigured, vectorExtensionAvailable);
    },

    markStale(embeddingModel?: string): void {
      store.markStale(embeddingModel);
    },

    /** Re-chunk every note + task in the workspace (manual rebuild). */
    reindexAll(): { notes: number; tasks: number } {
      let notes = 0;
      let tasks = 0;
      for (const project of store.listProjects()) {
        for (const note of store.notesForProject(project.id)) {
          store.reindexNote(note, chunkNoteText);
          notes += 1;
        }
        for (const task of store.tasksForProject(project.id)) {
          store.reindexTask(task, (text) => chunkTaskText(text));
          tasks += 1;
        }
      }
      return { notes, tasks };
    }
  };
}

export type KnowledgeService = ReturnType<typeof createKnowledgeService>;

// re-export status type for route typing
export type { KnowledgeTaskStatus };
