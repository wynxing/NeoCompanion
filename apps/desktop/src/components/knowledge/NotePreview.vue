<script setup lang="ts">
import type { KnowledgeNote } from "../../composables/useKnowledgeMock";
import MarkdownEditor from "../markdown-editor/MarkdownEditor.vue";

const props = defineProps<{
  note: KnowledgeNote | null;
  /** 是否处于编辑模式（toolbar + 可写入）。 */
  editable: boolean;
}>();

const emit = defineEmits<{
  "update:body": [body: string];
}>();

function handleUpdate(body: string): void {
  if (!props.note) return;
  emit("update:body", body);
}
</script>

<template>
  <article v-if="note" class="knowledge-note-preview">
    <header class="preview-head">
      <div>
        <div class="preview-title">{{ note.title }}</div>
        <div class="preview-meta">
          <span v-for="tag in note.tags" :key="tag" class="tag">{{ tag }}</span>
          <span class="time">最近修改 {{ note.updatedAt }}</span>
        </div>
      </div>
    </header>

    <!--
      readonly = 同一 Tiptap schema 渲染 markdown，与编辑模式视觉绝对一致；
      editable = true 时显示 Toolbar + 接受输入。
      MarkdownEditor 内部每次切 note 走 setContent 不重建 editor，避免 marked.use 副作用。
    -->
    <div class="preview-body">
      <MarkdownEditor
        :model-value="note.body"
        :editable="editable"
        :show-toolbar="editable"
        placeholder="开始编辑这篇笔记…"
        @update:model-value="handleUpdate"
      />
    </div>
  </article>
  <div v-else class="knowledge-empty">
    <p>当前项目暂无笔记</p>
    <small>v2 阶段可在此创建第一篇 Markdown 笔记</small>
  </div>
</template>
