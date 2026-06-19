<script setup lang="ts">
import { computed } from "vue";
import { useEditorStore } from "./hooks/useEditorStore";

interface Props {
  /** 当前活跃的编辑器（用来读 isActive 状态做 active 高亮）。WYSIWYG 才有 isActive；plain 模式忽略。 */
  activeFormats?: { bold: boolean; italic: boolean; taskList: boolean };
}

const props = withDefaults(defineProps<Props>(), {
  activeFormats: () => ({ bold: false, italic: false, taskList: false }),
});

const emit = defineEmits<{
  bold: [];
  italic: [];
  taskList: [];
}>();

const store = useEditorStore();
const mode = computed(() => store.editorMode.value);

function toggleMode(): void {
  store.setEditorMode(mode.value === "wysiwyg" ? "plain" : "wysiwyg");
}
</script>

<template>
  <div class="nc-editor-toolbar" role="toolbar">
    <button
      type="button"
      class="tb-btn"
      :class="{ active: props.activeFormats.bold }"
      title="粗体（Ctrl+B）"
      @click="emit('bold')"
    >
      <strong>B</strong>
    </button>
    <button
      type="button"
      class="tb-btn"
      :class="{ active: props.activeFormats.italic }"
      title="斜体（Ctrl+I）"
      @click="emit('italic')"
    >
      <em>I</em>
    </button>
    <button
      type="button"
      class="tb-btn"
      :class="{ active: props.activeFormats.taskList }"
      title="任务列表"
      @click="emit('taskList')"
    >
      ☑
    </button>

    <div class="tb-spacer" />

    <button
      type="button"
      class="tb-btn tb-mode"
      :title="mode === 'wysiwyg' ? '切换到纯 Markdown 编辑' : '切换到富文本编辑'"
      @click="toggleMode"
    >
      {{ mode === "wysiwyg" ? "WYSIWYG" : "Markdown" }}
    </button>
  </div>
</template>

<style>
.nc-editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--kw-border);
  background: var(--kw-surface-alt);
  border-radius: 8px 8px 0 0;
  font-size: 0.84rem;
}

.tb-btn {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  padding: 4px 10px;
  border-radius: 6px;
  color: var(--kw-text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  min-width: 28px;
}

.tb-btn:hover {
  background: var(--kw-tag-bg);
  color: var(--kw-text);
}

.tb-btn.active {
  background: var(--kw-accent-soft);
  color: var(--kw-accent);
  border-color: var(--kw-accent);
}

.tb-spacer {
  flex: 1;
}

.tb-mode {
  font-size: 0.78rem;
  font-family: "JetBrains Mono", "Fira Code", monospace;
  letter-spacing: 0.02em;
}
</style>
