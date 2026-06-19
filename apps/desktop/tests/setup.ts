// jsdom + Tiptap/ProseMirror 兼容垫片：ProseMirror 探测的 layout API jsdom 没实现。
// 来源参考 wynxing/memos web/tests/setup.ts。
if (typeof document !== "undefined") {
  if (!document.elementFromPoint) {
    document.elementFromPoint = () => null;
  }
  if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }
}
