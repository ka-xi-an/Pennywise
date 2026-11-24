// Creates .env from .env.example with freshly generated secrets (idempotent).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";

if (existsSync(".env")) {
  console.log(".env already exists — leaving it untouched.");
} else {
  let env = readFileSync(".env.example", "utf8");
  env = env.replace('FILE_ENCRYPTION_KEY=""', `FILE_ENCRYPTION_KEY="${randomBytes(32).toString("hex")}"`);
  writeFileSync(".env", env);
  console.log("Created .env with a new FILE_ENCRYPTION_KEY.");
}
mkdirSync("storage", { recursive: true });
