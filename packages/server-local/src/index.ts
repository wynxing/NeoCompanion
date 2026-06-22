import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { config } from "dotenv";
import { createApp } from "./app";

for (const envFile of unique([
  resolve(homedir(), "NeoCompanion", ".env"),
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), ".env")
])) {
  if (existsSync(envFile)) {
    config({ path: envFile, override: false });
  }
}

const port = Number(process.env.NEO_SERVER_PORT ?? 10103);
const host = process.env.NEO_SERVER_HOST ?? "127.0.0.1";

const app = await createApp();
await app.listen({ port, host });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    app.log.info({ sig }, "shutting down");
    app.close().then(() => process.exit(0)).catch((err) => {
      app.log.error({ err }, "graceful shutdown failed");
      process.exit(1);
    });
  });
}

function unique(values: string[]) {
  return [...new Set(values)];
}
