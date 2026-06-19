<script setup lang="ts">
import { computed, provide, ref, toRef, watch } from "vue";
import { createEditorStore, EDITOR_STORE_KEY } from "./state/createEditorStore";
import { useNoteInit } from "./hooks/useNoteInit";
import EditorContent from "./EditorContent.vue";
import EditorToolbar from "./EditorToolbar.vue";
import PlainEditor from "./plain-editor/PlainEditor.vue";
import type { EditorController } from "./types/editorController";

interface Props {
  /** Markdown 原文（双向绑定）。 */
  modelValue: string;
  placeholder?: string;
  /** 是否可编辑；false 时只读、不显示 toolbar。 */
  editable?: boolean;
  /** 是否显示 toolbar（即使 editable，也可由父级控制隐藏）。 */
  showToolbar?: boolean;
  /** 已配置的标签列表（v2 接 sidecar 后传入），仅 WYSIWYG 模式生效。 */
  availableTags?: () => string[];
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: "记点什么…",
  editable: true,
  showToolbar: true,
  availableTags: () => [] as string[],
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const store = createEditorStore({ initialBody: props.modelValue });
provide(EDITOR_STORE_KEY, store);

const bodyRef = toRef(props, "modelValue");
useNoteInit({ body: bodyRef, store });

// 把外部 modelValue 同步到 store.content（store 在切模式时被两个编辑器读做初值）。
watch(
  () => props.modelValue,
  (next) => {
    store.setContent(next);
  },
);

const wysiwygRef = ref<EditorController | null>(null);
const plainRef = ref<EditorController | null>(null);

const activeRef = computed<EditorController | null>(() => {
  return store.editorMode.value === "wysiwyg" ? wysiwygRef.value : plainRef.value;
});

function handleEditorUpdate(value: string): void {
  store.setContent(value);
  emit("update:modelValue", value);
}

const toolbarVisible = computed(() => props.showToolbar && props.editable);

// 模式切换后把焦点还给新编辑器（首次 mount 不做，避免抢走父组件想保留的焦点）。
let firstModeChange = true;
watch(
  () => store.editorMode.value,
  () => {
    if (firstModeChange) {
      firstModeChange = false;
      return;
    }
    setTimeout(() => activeRef.value?.focus(), 50);
  },
);

const forwardingController: EditorController = {
  focus: () => activeRef.value?.focus(),
  hasFocus: () => activeRef.value?.hasFocus() ?? false,
  isEmpty: () => activeRef.value?.isEmpty() ?? true,
  getMarkdown: () => activeRef.value?.getMarkdown() ?? store.content.value,
  setMarkdown: (md) => activeRef.value?.setMarkdown(md),
  insertMarkdown: (md) => activeRef.value?.insertMarkdown(md),
  scrollToCursor: () => activeRef.value?.scrollToCursor(),
  selectAll: () => activeRef.value?.selectAll(),
  toggleBold: () => activeRef.value?.toggleBold(),
  toggleItalic: () => activeRef.value?.toggleItalic(),
  toggleTaskList: () => activeRef.value?.toggleTaskList(),
};

defineExpose<EditorController>(forwardingController);
</script>

<template>
  <div class="nc-markdown-editor">
    <div v-if="store.loadGuardDegraded.value" class="md-degrade-banner">
      该笔记包含未完全支持的 Markdown 语法，已自动切换到纯 Markdown 编辑模式以保留原文。
    </div>

    <EditorToolbar
      v-if="toolbarVisible"
      @bold="forwardingController.toggleBold()"
      @italic="forwardingController.toggleItalic()"
      @task-list="forwardingController.toggleTaskList()"
    />

    <div class="nc-md-editor-body">
      <EditorContent
        v-if="store.editorMode.value === 'wysiwyg'"
        ref="wysiwygRef"
        :model-value="props.modelValue"
        :placeholder="props.placeholder"
        :editable="props.editable"
        :available-tags="props.availableTags"
        @update:model-value="handleEditorUpdate"
      />
      <PlainEditor
        v-else
        ref="plainRef"
        :model-value="props.modelValue"
        :placeholder="props.placeholder"
        :editable="props.editable"
        @update:model-value="handleEditorUpdate"
      />
    </div>
  </div>
</template>

<style>
.nc-markdown-editor {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.md-degrade-banner {
  position: sticky;
  top: 0;
  z-index: 5;
  margin-bottom: 8px;
  padding: 8px 12px;
  border: 1px solid var(--kw-border);
  border-radius: 8px;
  background: var(--kw-accent-soft);
  color: var(--kw-text);
  font-size: 0.82rem;
  backdrop-filter: blur(8px);
}

.nc-md-editor-body {
  flex: 1;
  min-height: 0;
}
</style>
