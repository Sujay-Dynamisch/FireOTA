// Standalone test config: keeps the app's Lovable/TanStack Vite plugins out of test runs.
import { fileURLToPath } from "node:url";

import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Integration tests share one Supabase project; run files one at a time.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: loadEnv(mode, process.cwd(), ""),
  },
}));
