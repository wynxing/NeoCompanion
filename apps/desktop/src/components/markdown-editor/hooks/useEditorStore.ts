import { inject } from "vue";
import { EDITOR_STORE_KEY, type EditorStore } from "../state/createEditorStore";

/**
 * 在 MarkdownEditor.vue 内部 provide('editorStore', store) 之后，子组件
 * （EditorContent / PlainEditor / EditorToolbar）通过这个 hook 取出 store。
 */
export function useEditorStore(): EditorStore {
  const store = inject<EditorStore>(EDITOR_STORE_KEY);
  if (!store) {
    throw new Error("useEditorStore() called outside an EditorStore provider");
  }
  return store;
}
