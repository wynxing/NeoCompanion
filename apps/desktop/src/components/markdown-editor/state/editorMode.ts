/**
 * 当前会话的编辑器模式偏好。对应 wynxing/memos 的 web/src/components/MemoEditor/editorMode.ts。
 * WYSIWYG 是默认值；plain 备用模式由用户主动切换或 load-guard 强制切入（后者不写 storage）。
 */

export type EditorMode = "wysiwyg" | "plain";

const STORAGE_KEY = "nc-knowledge-editor-mode";

export function getPreferredEditorMode(): EditorMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "plain" ? "plain" : "wysiwyg";
  } catch {
    return "wysiwyg";
  }
}

export function setPreferredEditorMode(mode: EditorMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage unavailable — preference won't persist this session.
  }
}
