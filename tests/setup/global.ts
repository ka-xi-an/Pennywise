import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

/** Creates a fresh SQLite database for integration tests (never touches dev.db). */
export default function setup() {
  const root = path.resolve(import.meta.dirname, "../..");
  rmSync(path.join(root, "prisma", "test.db"), { force: true });
  // Prisma 7: `db push` no longer runs generate, and paths resolve from the project root (prisma.config.ts).
  execFileSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "db", "push"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: "file:./prisma/test.db" },
    stdio: "ignore",
  });
}
