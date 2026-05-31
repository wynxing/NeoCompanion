import { describe, expect, it } from "vitest";
import { buildDeepSeekChatRequest, resolveDeepSeekModel } from "./index";

describe("DeepSeek adapter", () => {
  it("uses v4 flash by default", () => {
    const request = buildDeepSeekChatRequest([{ role: "user", content: "你好" }]);
    expect(request.model).toBe("deepseek-v4-flash");
  });

  it("does not emit legacy model names", () => {
    expect(resolveDeepSeekModel("deepseek-chat")).toBe("deepseek-v4-flash");
    expect(resolveDeepSeekModel("deepseek-reasoner")).toBe("deepseek-v4-flash");
  });
});
