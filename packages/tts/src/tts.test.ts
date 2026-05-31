import { describe, expect, it } from "vitest";
import { buildMimoTtsRequest } from "./index";

describe("MiMo TTS adapter", () => {
  it("puts style in user message and synthesized text in assistant message", () => {
    const request = buildMimoTtsRequest("时间到啦，休息一下。", "温柔、轻快");

    expect(request.model).toBe("mimo-v2.5-tts");
    expect(request.voice).toBe("茉莉");
    expect(request.messages).toEqual([
      { role: "user", content: "温柔、轻快" },
      { role: "assistant", content: "时间到啦，休息一下。" }
    ]);
  });
});
