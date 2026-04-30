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
    // These integration tests mutate the local Supabase database and are not safe
    // to run as part of the default unit test command.
    exclude: [
      "tests/api/ingest-lineups.test.ts",
      "tests/api/ingest-squads.test.ts",
      "tests/db/**/*.test.ts",
      "tests/health.test.ts",
      "tests/ingestion/events.test.ts",
      "tests/ingestion/standings.test.ts",
      "tests/ingestion/upsert.test.ts",
      "tests/llm/pipeline.test.ts",
      "tests/llm/stages/assemble.test.ts",
      "tests/retention/cleanup-raw-data.test.ts",
      "tests/scrapers/raw-data.test.ts",
    ],
    fileParallelism: false,
    hookTimeout: 60_000,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    testTimeout: 60_000,
  },
});
