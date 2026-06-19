import { ref, type Ref } from "vue";
import { type EditorMode, getPreferredEditorMode, setPreferredEditorMode } from "./editorMode";

/**
 * 编辑器跨组件共享 store。对应 wynxing/memos 的 web/src/components/MemoEditor/state/
 * 中的 reducer + Context；改用 Vue refs + mutators，因为 Vue 3 reactivity 已经天然单向，
 * reducer 只是徒增样板。
 *
 * `content` 是 markdown 字符串的 single source of truth：WYSIWYG 与 PlainEditor 都把
 * 自身实时内容回写到这里，模式切换时新模式从这里读初值。
 */

export interface EditorStore {
  /** 当前 markdown 文本（SSOT）。 */
  content: Ref<string>;
  /** 当前活跃模式：wysiwyg / plain。 */
  editorMode: Ref<EditorMode>;
  /** 当前会话是否被 load-guard 强制降级到 plain（不写 storage）。 */
  loadGuardDegraded: Ref<boolean>;

  setContent(next: string): void;
  /** persist=true 写入 localStorage；false 仅本会话生效（load-guard 用）。 */
  setEditorMode(mode: EditorMode, opts?: { persist?: boolean }): void;
  forceDegradeToPlain(): void;
  /** 用一段 markdown 重置编辑器（外部 setMarkdown 时使用）。 */
  initContent(body: string): void;
}

export interface CreateEditorStoreOptions {
  initialBody?: string;
  initialMode?: EditorMode;
}

export function createEditorStore(opts: CreateEditorStoreOptions = {}): EditorStore {
  const content = ref<string>(opts.initialBody ?? "");
  const editorMode = ref<EditorMode>(opts.initialMode ?? getPreferredEditorMode());
  const loadGuardDegraded = ref<boolean>(false);

  return {
    content,
    editorMode,
    loadGuardDegraded,

    setContent(next: string): void {
      content.value = next;
    },

    setEditorMode(mode: EditorMode, options: { persist?: boolean } = {}): void {
      editorMode.value = mode;
      if (options.persist !== false) {
        setPreferredEditorMode(mode);
      }
    },

    forceDegradeToPlain(): void {
      loadGuardDegraded.value = true;
      editorMode.value = "plain";
      // 不写 storage —— 仅当前会话生效。
    },

    initContent(body: string): void {
      content.value = body;
      loadGuardDegraded.value = false;
    },
  };
}

export const EDITOR_STORE_KEY: symbol = Symbol("nc-editor-store");
