<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import getCaretCoordinates from "textarea-caret";
import type { EditorController } from "../types/editorController";

interface Props {
  modelValue: string;
  placeholder?: string;
  editable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: "记点什么…",
  editable: true,
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const editorRef = ref<HTMLTextAreaElement | null>(null);

/**
 * 自适应高度：每次 input 后把高度归零再读 scrollHeight，避免"先增后减"卡死在最大值。
 */
function updateHeight(): void {
  const el = editorRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * 光标接近视口底部时把光标滚到中央位置（参考 memos PlainEditor 的 scrollToCaret）。
 */
function scrollToCaret(force = false): void {
  const el = editorRef.value;
  if (!el) return;
  const caret = getCaretCoordinates(el, el.selectionEnd);
  if (force) {
    el.scrollTop = Math.max(0, caret.top - el.clientHeight / 2);
    return;
  }
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
  const viewportBottom = el.scrollTop + el.clientHeight;
  if (caret.top + lineHeight * 2 > viewportBottom) {
    el.scrollTop = Math.max(0, caret.top - el.clientHeight / 2);
  }
}

function handleInput(): void {
  const el = editorRef.value;
  if (!el) return;
  emit("update:modelValue", el.value);
  updateHeight();
  scrollToCaret();
}

// 同步外部 modelValue 变更（如切到下一篇 note 或模式切换从 WYSIWYG 切回来）。
watch(
  () => props.modelValue,
  async (next) => {
    const el = editorRef.value;
    if (!el || el.value === next) return;
    el.value = next;
    await nextTick();
    updateHeight();
  },
);

onMounted(async () => {
  const el = editorRef.value;
  if (el) {
    el.value = props.modelValue;
  }
  await nextTick();
  updateHeight();
});

onBeforeUnmount(() => {
  // textarea-caret 把 mirror div 挂在 body 上，库不暴露清理 API，自己擦。
  document
    .querySelectorAll("div[style*='caret']")
    .forEach((node) => {
      const inline = (node as HTMLElement).getAttribute("style") ?? "";
      // 仅删 textarea-caret 留下的 mirror（rich style 复制 + position:absolute）。
      if (inline.includes("position: absolute") && inline.includes("visibility: hidden")) {
        node.remove();
      }
    });
});

const isFocused = computed(() => {
  return editorRef.value !== null && document.activeElement === editorRef.value;
});

const TASK_PREFIX = "- [ ] ";

function applyDelimiter(delimiter: string): void {
  const el = editorRef.value;
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const value = el.value;
  const sel = value.slice(start, end);
  const wrapped = isWrapped(sel, delimiter);
  let next: string;
  let cursorEnd: number;
  if (wrapped) {
    const inner = sel.slice(delimiter.length, -delimiter.length);
    next = value.slice(0, start) + inner + value.slice(end);
    cursorEnd = start + inner.length;
  } else {
    next = value.slice(0, start) + delimiter + sel + delimiter + value.slice(end);
    cursorEnd = start + delimiter.length + sel.length;
  }
  el.value = next;
  emit("update:modelValue", next);
  el.focus();
  const cursorStart = wrapped ? start : start + delimiter.length;
  el.setSelectionRange(cursorStart, cursorEnd);
  updateHeight();
}

function isWrapped(text: string, delimiter: string): boolean {
  if (!text.startsWith(delimiter) || !text.endsWith(delimiter)) return false;
  if (delimiter !== "*") return true;
  // `*sel*` 与 `**sel**` 共用同一字符；按头尾连续 `*` 数量是否奇数判断属于斜体还是粗体。
  const leading = countConsecutive(text, "*", "start");
  const trailing = countConsecutive(text, "*", "end");
  return leading % 2 === 1 && trailing % 2 === 1;
}

function countConsecutive(text: string, ch: string, side: "start" | "end"): number {
  let count = 0;
  let i = side === "start" ? 0 : text.length - 1;
  while (i >= 0 && i < text.length && text[i] === ch) {
    count += 1;
    i += side === "start" ? 1 : -1;
  }
  return count;
}

function toggleTaskOnCurrentLine(): void {
  const el = editorRef.value;
  if (!el) return;
  const value = el.value;
  const cursor = el.selectionStart;
  const lineStart = value.lastIndexOf("\n", Math.max(cursor - 1, 0)) + 1;
  const lineEnd = value.indexOf("\n", cursor);
  const end = lineEnd === -1 ? value.length : lineEnd;
  const line = value.slice(lineStart, end);
  const taskMatch = line.match(/^(\s*)- \[[ xX]\] /);
  let nextLine: string;
  if (taskMatch) {
    nextLine = taskMatch[1] + line.slice(taskMatch[0].length);
  } else {
    const indent = line.match(/^(\s*)/)?.[1] ?? "";
    nextLine = `${indent}${TASK_PREFIX}${line.slice(indent.length)}`;
  }
  const next = value.slice(0, lineStart) + nextLine + value.slice(end);
  el.value = next;
  emit("update:modelValue", next);
  el.focus();
  const cursorOffset = nextLine.length - line.length;
  el.setSelectionRange(cursor + cursorOffset, cursor + cursorOffset);
  updateHeight();
}

const controller: EditorController = {
  focus(): void {
    editorRef.value?.focus();
  },
  hasFocus(): boolean {
    return isFocused.value;
  },
  isEmpty(): boolean {
    return (editorRef.value?.value ?? "").trim() === "";
  },
  getMarkdown(): string {
    return editorRef.value?.value ?? "";
  },
  setMarkdown(markdown: string): void {
    const el = editorRef.value;
    if (!el) return;
    el.value = markdown;
    emit("update:modelValue", markdown);
    updateHeight();
  },
  insertMarkdown(markdown: string): void {
    const el = editorRef.value;
    if (!el || !markdown) return;
    const cursor = el.selectionStart;
    const before = el.value.slice(0, cursor);
    const after = el.value.slice(cursor);
    const prefix =
      before.length === 0 || before.endsWith("\n\n")
        ? ""
        : before.endsWith("\n")
          ? "\n"
          : "\n\n";
    const suffix =
      after.length === 0 || after.startsWith("\n\n")
        ? ""
        : after.startsWith("\n")
          ? "\n"
          : "\n\n";
    const inserted = prefix + markdown + suffix;
    const next = before + inserted + after;
    el.value = next;
    emit("update:modelValue", next);
    el.focus();
    const newCursor = cursor + inserted.length;
    el.setSelectionRange(newCursor, newCursor);
    updateHeight();
  },
  scrollToCursor(): void {
    scrollToCaret(true);
  },
  selectAll(): void {
    const el = editorRef.value;
    if (!el) return;
    el.setSelectionRange(0, el.value.length);
  },
  toggleBold(): void {
    applyDelimiter("**");
  },
  toggleItalic(): void {
    applyDelimiter("*");
  },
  toggleTaskList(): void {
    toggleTaskOnCurrentLine();
  },
};

defineExpose<EditorController>(controller);
</script>

<template>
  <div class="nc-editor-plain">
    <textarea
      ref="editorRef"
      class="nc-md-root nc-plain-textarea"
      rows="1"
      :placeholder="placeholder"
      :readonly="!editable"
      @input="handleInput"
    />
  </div>
</template>

<style>
.nc-editor-plain {
  width: 100%;
}

.nc-plain-textarea {
  display: block;
  width: 100%;
  resize: none;
  border: 0;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 0.92rem;
  line-height: 1.7;
  color: var(--kw-text);
  white-space: pre-wrap;
  word-wrap: break-word;
  min-height: 1.7em;
  padding: 0;
}

.nc-plain-textarea::placeholder {
  color: var(--kw-text-muted);
  opacity: 0.7;
}
</style>
