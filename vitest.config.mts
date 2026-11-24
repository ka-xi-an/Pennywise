import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/setup/server-only.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/setup/global.ts"],
    env: { DATABASE_URL: "file:./prisma/test.db", FILE_ENCRYPTION_KEY: "0".repeat(64) },
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
