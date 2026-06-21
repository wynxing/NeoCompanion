import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createDatabase, getAppConfig, setAppConfig } from "@neo-companion/db";

describe("sidecar authentication", () => {
  let app: Awaited<ReturnType<typeof createApp>> | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it("requires APP_AUTH_TOKEN", async () => {
    const previous = process.env.APP_AUTH_TOKEN;
    delete process.env.APP_AUTH_TOKEN;
    await expect(createApp({ startBackground: false })).rejects.toThrow("APP_AUTH_TOKEN is required");
    if (previous) process.env.APP_AUTH_TOKEN = previous;
  });

  it("rejects missing and invalid bearer tokens", async () => {
    app = await createApp({ authToken: "secret", startBackground: false });
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/health", headers: { authorization: "Bearer wrong" } })).statusCode).toBe(401);
  });

  it("accepts a valid token and rejects untrusted origin or host", async () => {
    app = await createApp({ authToken: "secret", startBackground: false });
    const authorization = "Bearer secret";
    expect((await app.inject({ method: "GET", url: "/health", headers: { authorization } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/health", headers: { authorization, origin: "https://evil.example" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/health", headers: { authorization, host: "evil.example" } })).statusCode).toBe(403);
  });

  it("keeps a legacy secret until the authenticated client confirms migration", async () => {
    const database = createDatabase(":memory:");
    setAppConfig(database, "embedding", JSON.stringify({ provider: "openai", model: "m", apiKey: "legacy-secret" }));
    app = await createApp({ database, authToken: "secret", startBackground: false });
    const headers = { authorization: "Bearer secret" };
    const claimed = await app.inject({ method: "POST", url: "/api/knowledge/embedding-config/legacy-secret/claim", headers });
    expect(claimed.json()).toEqual({ apiKey: "legacy-secret" });
    expect(getAppConfig(database, "embedding")).toContain("legacy-secret");
    await app.inject({ method: "DELETE", url: "/api/knowledge/embedding-config/legacy-secret", headers });
    expect(getAppConfig(database, "embedding")).not.toContain("legacy-secret");
  });
});
