import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

// Test-time configuration. Kept separate from vite.config.ts so the
// dev/build pipelines stay lean and only tests load jsdom.
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
