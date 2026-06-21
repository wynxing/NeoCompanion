<script setup lang="ts">
import { ref } from "vue";
import type { KnowledgeWorkspaceState } from "../../composables/useKnowledgeWorkspace";
import {
  stripCitations,
  type KnowledgeAiState
} from "../../composables/useKnowledgeAi";
import type { ContextLevel, KnowledgeSource } from "@neo-companion/shared";

const props = defineProps<{
  workspace: KnowledgeWorkspaceState;
  ai: KnowledgeAiState;
}>();

const inputText = ref("");
const contextOpen = ref(false);

function onSend(): void {
  if (!inputText.value.trim() || props.ai.chatLoading.value) return;
  const text = inputText.value;
  inputText.value = "";
  void props.ai.send(text);
}

function levelOf(id: string): string {
  return props.ai.contextLabel[props.ai.contextSelection.value[id] ?? "full"];
}

function levelClassOf(id: string): ContextLevel {
  return props.ai.contextSelection.value[id] ?? "full";
}

function sourceKindLabel(source: KnowledgeSource): string {
  return source.sourceType === "note" ? "笔记" : "任务";
}
</script>

<template>
  <div class="knowledge-ai-panel">
    <header class="knowledge-ai-header">
      <div class="quick-create-modes knowledge-ai-modes">
        <button
          type="button"
          class="quick-create-mode"
          :class="{ active: ai.aiMode.value === 'chat' }"
          @click="ai.aiMode.value = 'chat'"
        >
          对话
        </button>
        <button
          type="button"
          class="quick-create-mode"
          :class="{ active: ai.aiMode.value === 'ask' }"
          @click="ai.aiMode.value = 'ask'"
        >
          问答
        </button>
      </div>

      <p class="knowledge-ai-hint">
        {{ ai.aiMode.value === "chat" ? "基于你勾选的笔记/任务上下文多轮对话。" : "向知识库提问，自动检索相关片段作答。" }}
      </p>

      <button
        v-if="ai.aiMode.value === 'chat'"
        type="button"
        class="knowledge-ai-context-toggle"
        @click="contextOpen = !contextOpen"
      >
        {{ contextOpen ? "收起上下文" : "上下文选择" }}
      </button>
    </header>

    <section v-if="ai.aiMode.value === 'chat' && contextOpen" class="knowledge-ai-context">
      <div
        v-if="workspace.currentNotes.value.length === 0 && workspace.currentTasks.value.length === 0"
        class="knowledge-ai-context-empty"
      >
        当前项目暂无笔记/任务。
      </div>
      <ul v-else class="knowledge-ai-context-list">
        <li v-for="note in workspace.currentNotes.value" :key="`n-${note.id}`" class="knowledge-ai-context-row">
          <span class="knowledge-ai-context-kind knowledge-ai-context-kind--note">笔记</span>
          <span class="knowledge-ai-context-title">{{ note.title }}</span>
          <button
            type="button"
            class="knowledge-ai-context-level"
            :class="`is-${levelClassOf(note.id)}`"
            @click="ai.cycleContextLevel(note.id)"
          >
            {{ levelOf(note.id) }}
          </button>
        </li>
        <li v-for="task in workspace.currentTasks.value" :key="`t-${task.id}`" class="knowledge-ai-context-row">
          <span class="knowledge-ai-context-kind knowledge-ai-context-kind--task">任务</span>
          <span class="knowledge-ai-context-title">{{ task.title }}</span>
          <button
            type="button"
            class="knowledge-ai-context-level"
            :class="`is-${levelClassOf(task.id)}`"
            @click="ai.cycleContextLevel(task.id)"
          >
            {{ levelOf(task.id) }}
          </button>
        </li>
      </ul>
    </section>

    <div class="knowledge-ai-messages">
      <div v-if="ai.messages.value.length === 0" class="knowledge-ai-empty">
        <p>向知识助手提问，或就当前项目笔记展开对话。</p>
      </div>

      <div
        v-for="message in ai.messages.value"
        :key="message.id"
        class="knowledge-ai-message"
        :class="[`is-${message.role}`, { 'is-error': message.error, 'is-streaming': message.streaming }]"
      >
        <div class="knowledge-ai-message-bubble">
          <template v-if="message.role === 'assistant'">
            <span v-if="message.streaming && !message.text" class="knowledge-ai-thinking">思考中…</span>
            <span v-else class="knowledge-ai-message-text">{{ stripCitations(message.text) }}</span>
          </template>
          <span v-else class="knowledge-ai-message-text">{{ message.text }}</span>
        </div>

        <ul v-if="message.sources && message.sources.length > 0" class="knowledge-ai-sources">
          <li v-for="source in message.sources" :key="`${source.sourceType}-${source.sourceId}`">
            <button
              type="button"
              class="knowledge-ai-source"
              :disabled="ai.chatLoading.value"
              @click="ai.openSource(source)"
            >
              <span class="knowledge-ai-source-kind" :class="`is-${source.sourceType}`">{{ sourceKindLabel(source) }}</span>
              <span class="knowledge-ai-source-title">{{ source.title }}</span>
              <span class="knowledge-ai-source-excerpt">{{ source.excerpt }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>

    <form class="knowledge-ai-input" @submit.prevent="onSend">
      <input
        v-model="inputText"
        type="text"
        class="knowledge-ai-input-field"
        placeholder="输入消息，Enter 发送"
        :disabled="ai.chatLoading.value"
        @keydown.enter.prevent="onSend"
      />
      <button type="submit" class="knowledge-ai-send" :disabled="ai.chatLoading.value || !inputText.trim()">
        {{ ai.chatLoading.value ? "…" : "发送" }}
      </button>
    </form>
  </div>
</template>
