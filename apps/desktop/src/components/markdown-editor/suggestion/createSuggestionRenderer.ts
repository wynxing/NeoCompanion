import type { Component } from "vue";
import { VueRenderer } from "@tiptap/vue-3";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";

/**
 * 把 Tiptap Suggestion plugin 的 React 渲染契约（memos `Editor/suggestionMenu.tsx`）
 * 改造成 Vue：用 `@tiptap/vue-3` 的 `VueRenderer` 挂载传入的 SFC，
 * 容器追在 caret rect 之下；编辑器 blur 自动销毁；onKeyDown 转发到 SFC 的 expose 接口。
 */
export interface SuggestionRendererOptions<T> {
  /** Vue SFC，必须 expose `onKeyDown(props): boolean`。 */
  component: Component;
  /** 把 SuggestionProps 映射成 SFC 的 props。 */
  buildProps: (props: SuggestionProps<T>) => Record<string, unknown>;
}

export function createSuggestionRenderer<T>(
  options: SuggestionRendererOptions<T>,
): SuggestionOptions<T>["render"] {
  return () => {
    let renderer: VueRenderer | null = null;
    let container: HTMLDivElement | null = null;
    let removeBlurListener: (() => void) | null = null;

    const reposition = (props: SuggestionProps<T>): void => {
      const rect = props.clientRect?.();
      if (!rect || !container) return;
      container.style.left = `${rect.left + window.scrollX}px`;
      container.style.top = `${rect.bottom + window.scrollY + 4}px`;
    };

    const destroy = (): void => {
      removeBlurListener?.();
      removeBlurListener = null;
      renderer?.destroy();
      container?.remove();
      renderer = null;
      container = null;
    };

    return {
      onStart(props) {
        renderer = new VueRenderer(options.component, {
          props: options.buildProps(props),
          editor: props.editor,
        });

        container = document.createElement("div");
        container.style.position = "absolute";
        container.style.zIndex = "50";
        if (renderer.element) {
          container.appendChild(renderer.element);
        }
        document.body.appendChild(container);
        reposition(props);

        const handleBlur = (): void => destroy();
        props.editor.on("blur", handleBlur);
        removeBlurListener = () => props.editor.off("blur", handleBlur);
      },
      onUpdate(props) {
        renderer?.updateProps(options.buildProps(props));
        reposition(props);
      },
      onKeyDown(props) {
        if (props.event.key === "Escape") {
          destroy();
          return true;
        }
        // SFC 的 defineExpose 暴露 onKeyDown：通过 renderer.ref 取到调用。
        const ref = renderer?.ref as { onKeyDown?: (p: typeof props) => boolean } | null;
        return ref?.onKeyDown?.(props) ?? false;
      },
      onExit() {
        destroy();
      },
    };
  };
}
