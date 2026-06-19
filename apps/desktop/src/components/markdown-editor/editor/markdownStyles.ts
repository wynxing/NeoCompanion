/**
 * 共享样式 token，被编辑器（extensions.ts 通过 HTMLAttributes.class）与渲染（同一份
 * extensions.ts 复用）双方使用，保证编辑/浏览视觉一致。
 *
 * 对应 wynxing/memos 的 web/src/lib/markdownStyles.ts。memos 用 Tailwind className
 * 字符串，NeoCompanion 不使用 Tailwind，所以这里全部映射到普通 CSS 类（前缀
 * `nc-md-*`），具体规则定义在 apps/desktop/src/styles/markdown.css。
 */

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

const headingClasses: Record<HeadingLevel, string> = {
  1: "nc-md-h1",
  2: "nc-md-h2",
  3: "nc-md-h3",
  4: "nc-md-h4",
  5: "nc-md-h5",
  6: "nc-md-h6",
};

/**
 * 编辑器与渲染共享的 markdown 元素样式 class。每个值都是完整可独立使用的 class，
 * 既可以通过 Tiptap 的 HTMLAttributes 注入，也可以渲染 DOM 时直接挂上。
 */
export const markdownStyles = {
  paragraph: "nc-md-paragraph",
  blockquote: "nc-md-blockquote",
  bulletList: "nc-md-bullet-list",
  orderedList: "nc-md-ordered-list",
  listItem: "nc-md-list-item",
  taskList: "nc-md-task-list",
  taskItem: "nc-md-task-item",
  inlineCode: "nc-md-inline-code",
  codeBlock: "nc-md-code-block",
  link: "nc-md-link",
  horizontalRule: "nc-md-hr",
  strong: "nc-md-strong",
  emphasis: "nc-md-emphasis",
} as const;

/** 标签 pill 共享样式（编辑模式 + 渲染模式都用同一组 class）。 */
export const tagStyles = {
  base: "nc-md-tag-pill",
  defaultColor: "",
} as const;

/** 给定 heading level 返回完整 class。 */
export function headingClass(level: HeadingLevel): string {
  return headingClasses[level];
}
