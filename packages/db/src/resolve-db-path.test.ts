import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { resolveDefaultDbPath } from "./index";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
}

describe("resolveDefaultDbPath", () => {
  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), "neo-db-path-"));
  });

  afterEach(() => {
    resetEnv();
    rmSync(scratch, { recursive: true, force: true });
  });

  it("honors NEO_DB_PATH override verbatim", () => {
    process.env.NEO_DB_PATH = join(scratch, "explicit.sqlite");
    expect(resolveDefaultDbPath()).toBe(process.env.NEO_DB_PATH);
  });

  it("honors :memory: via NEO_DB_PATH without touching the filesystem", () => {
    process.env.NEO_DB_PATH = ":memory:";
    expect(resolveDefaultDbPath()).toBe(":memory:");
  });

  it("falls back to an OS-standard application data directory", () => {
    delete process.env.NEO_DB_PATH;
    if (process.platform === "win32") {
      process.env.APPDATA = scratch;
    } else if (process.platform !== "darwin") {
      process.env.XDG_DATA_HOME = scratch;
    }

    const resolved = resolveDefaultDbPath();
    expect(resolved.endsWith(`${sep}neo-companion.sqlite`)).toBe(true);
    expect(resolved).toContain(`${sep}NeoCompanion${sep}`);

    if (process.platform === "win32" || process.platform !== "darwin") {
      expect(resolved.startsWith(scratch)).toBe(true);
    }
  });
});
