import { watch, type Ref } from "vue";
import { isLosslessRoundTrip } from "../editor/markdownCodec";
import type { EditorStore } from "../state/createEditorStore";

/**
 * Load-guard：当 body 包含会被 markdown round-trip 改变的语法时，本会话强制降级到
 * plain 模式（不写 storage），并把 `loadGuardDegraded` 置 true 触发 banner。
 *
 * 对应 wynxing/memos `hooks/useMemoInit.ts`；本期没有 toast 系统，banner 由
 * MarkdownEditor.vue 顶部条幅承载。
 *
 * 当 body 变化（切换到下一篇 note）时重新校验。
 */
export function useNoteInit(opts: { body: Ref<string>; store: EditorStore }): void {
  const { body, store } = opts;

  function check(): void {
    const text = body.value ?? "";
    if (!text.trim()) {
      store.loadGuardDegraded.value = false;
      return;
    }
    if (store.editorMode.value === "wysiwyg" && !isLosslessRoundTrip(text)) {
      console.warn("[useNoteInit] note content failed wysiwyg round-trip; falling back to plain editor for this session");
      store.forceDegradeToPlain();
    } else {
      store.loadGuardDegraded.value = false;
    }
  }

  watch(body, check, { immediate: true });
}
