import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const desktopTarget = process.argv[2] === "tauri" ? "dev:tauri" : "dev:web";
const token = randomBytes(32).toString("base64url");
const env = { ...process.env, APP_AUTH_TOKEN: token, VITE_NEO_AUTH_TOKEN: token };
const children = [
  spawn("pnpm --filter @neo-companion/server-local dev", { stdio: "inherit", shell: true, env }),
  spawn(`pnpm --filter @neo-companion/desktop ${desktopTarget}`, { stdio: "inherit", shell: true, env })
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exit(code);
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (!stopping) stop(signal ? 1 : (code ?? 1));
  });
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
