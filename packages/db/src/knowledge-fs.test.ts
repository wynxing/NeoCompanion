import { describe, expect, it } from "vitest";
import {
  fromJsonl,
  markdownToNote,
  noteToMarkdown,
  projectToMeta,
  sanitizeFilename,
  toJsonl
} from "./knowledge-fs";
import type { KnowledgeNote, KnowledgeProject } from "@neo-companion/shared";

const note: KnowledgeNote = {
  id: "n-1",
  projectId: "p-1",
  title: "RRF 笔记",
  body: "见 [[t-100]]\n\n## 要点\n- 公式",
  tags: ["技术", "检索"],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000
};

describe("knowledge-fs serialization", () => {
  it("sanitizes filenames and rejects path separators", () => {
    expect(sanitizeFilename("a/b\\c:d*e?")).toBe("a b c d e");
    expect(sanitizeFilename("   ")).toBe("untitled");
    expect(sanitizeFilename("CON")).toBe("_CON");
  });

  it("round-trips a note through markdown front-matter", () => {
    const md = noteToMarkdown(note);
    expect(md).toContain("---");
    expect(md).toContain("id: n-1");
    expect(md).toContain("见 [[t-100]]");

    const parsed = markdownToNote(md);
    expect(parsed).not.toBeNull();
    expect(parsed!.frontMatter.id).toBe("n-1");
    expect(parsed!.frontMatter.title).toBe("RRF 笔记");
    expect(parsed!.frontMatter.tags).toEqual(["技术", "检索"]);
    expect(parsed!.frontMatter.updatedAt).toBe(note.updatedAt);
    expect(parsed!.body).toBe(note.body);
  });

  it("handles notes with no tags and special-char titles", () => {
    const n: KnowledgeNote = { ...note, title: '含"引号" 与: 冒号', tags: [] };
    const md = noteToMarkdown(n);
    const parsed = markdownToNote(md);
    expect(parsed!.frontMatter.title).toBe('含"引号" 与: 冒号');
    expect(parsed!.frontMatter.tags).toEqual([]);
  });

  it("returns null when markdown has no front-matter", () => {
    expect(markdownToNote("just body, no front matter")).toBeNull();
  });

  it("round-trips JSONL for columns and tasks", () => {
    const items = [{ id: "1", title: "待办", status: "todo", order: 0 }, { id: "2", title: "进行中", status: "doing", order: 1 }];
    const text = toJsonl(items);
    expect(text.split("\n").filter(Boolean)).toHaveLength(2);
    expect(fromJsonl(text)).toEqual(items);
  });

  it("round-trips empty JSONL", () => {
    expect(toJsonl([])).toBe("");
    expect(fromJsonl("")).toEqual([]);
  });

  it("maps a project to its on-disk metadata", () => {
    const project: KnowledgeProject = {
      id: "p-1",
      title: "产品研究",
      description: "方向",
      color: "#3b82f6",
      order: 1,
      parentId: null,
      createdAt: 1,
      updatedAt: 2
    };
    const meta = projectToMeta(project);
    expect(meta.id).toBe("p-1");
    expect(meta.parentId).toBeNull();
    expect(meta.color).toBe("#3b82f6");
  });
});
