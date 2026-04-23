import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 60_000,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    testTimeout: 60_000,
  },
});
