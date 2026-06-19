import { type Editor, Extension, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { createSuggestionRenderer } from "./createSuggestionRenderer";
import SuggestionMenu from "./SuggestionMenu.vue";

/**
 * `/` 命令浮层。对应 wynxing/memos `Editor/SlashCommand.ts`。
 * 命令列表与 memos 对齐：todo / code / link / table（H1/Quote 等可后续扩充）。
 */

export interface SlashCommandItem {
  name: string;
  apply: (editor: Editor, range: Range) => void;
}

export const slashCommandItems: SlashCommandItem[] = [
  {
    name: "todo",
    apply: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    name: "code",
    apply: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    name: "link",
    apply: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent("[text](url)", { contentType: "markdown" })
        .setTextSelection({ from: range.from, to: range.from + 4 })
        .run(),
  },
  {
    name: "table",
    apply: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent(
          "| Header | Header |\n| ------ | ------ |\n| Cell   | Cell |",
          { contentType: "markdown" },
        )
        .setTextSelection(range.from + 2)
        .run(),
  },
  {
    name: "quote",
    apply: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    name: "h1",
    apply: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
  },
  {
    name: "h2",
    apply: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
  },
  {
    name: "h3",
    apply: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
  },
];

export function filterSlashCommands(query: string): SlashCommandItem[] {
  const q = query.toLowerCase();
  return q ? slashCommandItems.filter((item) => item.name.startsWith(q)) : slashCommandItems;
}

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        pluginKey: new PluginKey("slashCommand"),
        char: "/",
        allowSpaces: false,
        items: ({ query }) => filterSlashCommands(query),
        command: ({ editor, range, props: item }) => {
          item.apply(editor, range);
        },
        render: createSuggestionRenderer<SlashCommandItem>({
          component: SuggestionMenu,
          buildProps: (props) => ({
            items: props.items,
            command: props.command,
            itemKey: (item: SlashCommandItem) => item.name,
            itemLabel: (item: SlashCommandItem) => item.name,
            prefix: "/",
          }),
        }),
      }),
    ];
  },
});
