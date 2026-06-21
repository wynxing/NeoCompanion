import { describe, expect, it, vi } from "vitest";
import { embedContents } from "./embedding";

function makeFetch(impl: (body: any) => any, status = 200): typeof fetch {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const parsed = JSON.parse(String(init.body));
    const payload = impl(parsed);
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: "OK",
      json: async () => payload
    } as Response;
  }) as unknown as typeof fetch;
}

describe("embedContents", () => {
  it("sends input as an array and returns vectors + dimensions in order", async () => {
    const fetchImpl = makeFetch((body) => ({
      data: [
        { embedding: [0.1, 0.2, 0.3], index: 0 },
        { embedding: [0.4, 0.5, 0.6], index: 1 }
      ]
    }));

    const result = await embedContents(["你好", "世界"], {
      apiKey: "k",
      baseUrl: "https://embed.test",
      model: "m",
      fetchImpl
    });

    expect(result.dimensions).toBe(3);
    expect(result.vectors).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6]
    ]);
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const body = JSON.parse(String(calls[0][1].body));
    expect(body.input).toEqual(["你好", "世界"]);
    expect(calls[0][0]).toBe("https://embed.test/v1/embeddings");
  });

  it("re-sorts by index when the provider returns out of order", async () => {
    const fetchImpl = makeFetch(() => ({
      data: [
        { embedding: [0.9, 0.9, 0.9], index: 1 },
        { embedding: [0.1, 0.1, 0.1], index: 0 }
      ]
    }));
    const result = await embedContents(["a", "b"], { apiKey: "k", fetchImpl });
    expect(result.vectors[0]).toEqual([0.1, 0.1, 0.1]);
    expect(result.vectors[1]).toEqual([0.9, 0.9, 0.9]);
  });

  it("throws when the api key is missing", async () => {
    await expect(embedContents(["x"])).rejects.toThrow(/EMBEDDING_API_KEY/);
  });

  it("returns empty for empty input without calling fetch", async () => {
    const fetchImpl = makeFetch(() => ({ data: [] }));
    const result = await embedContents([], { apiKey: "k", fetchImpl });
    expect(result.vectors).toEqual([]);
    expect(result.dimensions).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("retries on 5xx then succeeds", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 2) {
        return { ok: false, status: 503, statusText: "Service Unavailable", json: async () => ({}) } as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ data: [{ embedding: [0.1], index: 0 }] })
      } as Response;
    }) as unknown as typeof fetch;

    const result = await embedContents(["x"], { apiKey: "k", fetchImpl, maxRetries: 3 });
    expect(result.vectors).toEqual([[0.1]]);
    expect(calls).toBe(2);
  });

  it("fails fast on 4xx (non-429)", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({})
    })) as unknown as typeof fetch;
    await expect(embedContents(["x"], { apiKey: "k", fetchImpl, maxRetries: 3 })).rejects.toThrow(/401/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
