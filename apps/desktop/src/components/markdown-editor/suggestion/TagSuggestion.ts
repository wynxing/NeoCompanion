import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { createSuggestionRenderer } from "./createSuggestionRenderer";
import SuggestionMenu from "./SuggestionMenu.vue";

/**
 * `#` 标签浮层。对应 wynxing/memos `Editor/TagSuggestion.ts`。
 * `getTags` 是惰性 getter，方便外部按需返回最新 tag 列表（v2 接 sidecar 时实现）；
 * 本期未接数据源，默认返回空数组——`#` 仍能进入 schema、写入 markdown 时变 pill。
 */

export interface TagSuggestionOptions {
  getTags: () => string[];
}

const MAX_SUGGESTIONS = 20;

export const TagSuggestion = Extension.create<TagSuggestionOptions>({
  name: "tagSuggestion",

  addOptions() {
    return { getTags: () => [] };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<string>({
        editor: this.editor,
        pluginKey: new PluginKey("tagSuggestion"),
        char: "#",
        allowSpaces: false,
        items: ({ query }) => {
          if (query.length === 0) return [];
          const q = query.toLowerCase();
          return this.options
            .getTags()
            .filter((tag) => tag.toLowerCase().includes(q))
            .slice(0, MAX_SUGGESTIONS);
        },
        command: ({ editor, range, props: tag }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: "text", text: `#${tag}`, marks: [{ type: "tag", attrs: { tag } }] },
              { type: "text", text: " " },
            ])
            .run();
        },
        render: createSuggestionRenderer<string>({
          component: SuggestionMenu,
          buildProps: (props) => ({
            items: props.items,
            command: props.command,
            itemKey: (tag: string) => tag,
            itemLabel: (tag: string) => tag,
            prefix: "#",
          }),
        }),
      }),
    ];
  },
});
