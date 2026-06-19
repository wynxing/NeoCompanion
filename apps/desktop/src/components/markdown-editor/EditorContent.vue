<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import { Extension } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { AllSelection, Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { buildExtensions } from "./editor/extensions";
import { SlashCommand } from "./suggestion/SlashCommand";
import { TagSuggestion } from "./suggestion/TagSuggestion";
import type { EditorController } from "./types/editorController";

interface Props {
  /** 当前 markdown（外部 SSOT）。组件 mount 时初值化；后续外部修改通过 watch 同步。 */
  modelValue: string;
  placeholder?: string;
  editable?: boolean;
  /** 已配置的标签列表（v2 接 sidecar 后传入）。 */
  availableTags?: () => string[];
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: "记点什么…",
  editable: true,
  availableTags: () => [] as string[],
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

/**
 * Ctrl+A 全选时 ProseMirror 用 AllSelection；删除后 `selection.map()` 仍返回
 * AllSelection（空文档），视觉上仍处于「整页选中」状态。删除后把选区折叠到首位
 * 是 memos 已知 patch（参考 Editor/index.tsx 的 CollapseAllSelectionAfterDelete）。
 */
const CollapseAllSelectionAfterDelete = Extension.create({
  name: "collapseAllSelectionAfterDelete",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("collapseAllSelectionAfterDelete"),
        appendTransaction: (transactions, _oldState, newState) => {
          if (
            !transactions.some((tr) => tr.docChanged) ||
            !(newState.selection instanceof AllSelection)
          ) {
            return null;
          }
          return newState.tr.setSelection(Selection.atStart(newState.doc));
        },
      }),
    ];
  },
});

const tagsGetter = computed(() => props.availableTags);

const editor = useEditor({
  content: props.modelValue,
  contentType: "markdown",
  editable: props.editable,
  extensions: [
    ...buildExtensions(),
    Placeholder.configure({ placeholder: props.placeholder }),
    SlashCommand,
    TagSuggestion.configure({ getTags: () => tagsGetter.value() }),
    CollapseAllSelectionAfterDelete,
  ],
  editorProps: {
    attributes: {
      class: "nc-md-root",
    },
  },
  onUpdate({ editor: e }) {
    const next = (e.getMarkdown?.() ?? "").trim();
    if (next !== props.modelValue) {
      emit("update:modelValue", next);
    }
  },
});

// 外部把 modelValue 重置时（例如切到下一篇 note），同步进 ProseMirror。
// 自身 onUpdate 触发的 emit 在父组件 echo 回来仍是同样字符串，setContent 会成 no-op。
watch(
  () => props.modelValue,
  (next) => {
    if (!editor.value) return;
    const current = (editor.value.getMarkdown?.() ?? "").trim();
    if (current === next.trim()) return;
    editor.value.commands.setContent(next, { contentType: "markdown" });
  },
);

watch(
  () => props.editable,
  (next) => {
    editor.value?.setEditable(next);
  },
);

onBeforeUnmount(() => {
  editor.value?.destroy();
});

const controller: EditorController = {
  focus(): void {
    editor.value?.commands.focus();
  },
  hasFocus(): boolean {
    return editor.value?.isFocused ?? false;
  },
  isEmpty(): boolean {
    return editor.value?.isEmpty ?? true;
  },
  getMarkdown(): string {
    return (editor.value?.getMarkdown?.() ?? "").trim();
  },
  setMarkdown(markdown: string): void {
    editor.value?.commands.setContent(markdown, { contentType: "markdown" });
  },
  insertMarkdown(markdown: string): void {
    if (!markdown || !editor.value) return;
    editor.value.commands.insertContent(markdown, { contentType: "markdown" });
  },
  scrollToCursor(): void {
    editor.value?.commands.scrollIntoView();
  },
  selectAll(): void {
    editor.value?.commands.selectAll();
  },
  toggleBold(): void {
    editor.value?.chain().focus().toggleBold().run();
  },
  toggleItalic(): void {
    editor.value?.chain().focus().toggleItalic().run();
  },
  toggleTaskList(): void {
    editor.value?.chain().focus().toggleTaskList().run();
  },
};

defineExpose<EditorController>(controller);
</script>

<template>
  <div class="nc-editor-wysiwyg">
    <EditorContent :editor="editor" />
  </div>
</template>

<style>
.nc-editor-wysiwyg .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--kw-text-muted);
  pointer-events: none;
  float: left;
  height: 0;
}
</style>
