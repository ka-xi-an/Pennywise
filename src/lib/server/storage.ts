import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { decryptFile, encryptFile, sha256Hex } from "./crypto";

/** Encrypted file storage outside the web root, namespaced per user. */
const ROOT = path.resolve(process.env.STORAGE_DIR ?? "./storage");

export const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
  "text/csv": "csv",
};
export const MAX_UPLOAD = 10 * 1024 * 1024;

function keyPath(userId: string, key: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(userId) || !/^[a-f0-9]{32}$/.test(key)) throw new Error("Invalid storage key");
  return path.join(ROOT, userId, `${key}.bin`);
}

export async function storeFile(userId: string, data: Buffer) {
  const key = randomBytes(16).toString("hex");
  const enc = encryptFile(data);
  const p = keyPath(userId, key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, enc.data);
  return { storageKey: key, iv: enc.iv, authTag: enc.authTag, sha256: sha256Hex(data) };
}

export async function readStoredFile(userId: string, key: string, iv: string, tag: string) {
  return decryptFile(await readFile(keyPath(userId, key)), iv, tag);
}

export async function removeStoredFile(userId: string, key: string) {
  await rm(keyPath(userId, key), { force: true });
}

/** Validate by declared type AND magic bytes (never trust the extension). */
export function sniffType(buf: Buffer, declared: string): string | null {
  const head = buf.subarray(0, 12);
  if (head.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (head[0] === 0x89 && head.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (head.subarray(4, 12).toString("latin1").startsWith("ftypheic") || head.subarray(4, 12).toString("latin1").startsWith("ftypmif1")) return "image/heic";
  if (declared === "text/csv" && !buf.subarray(0, 2048).includes(0)) return "text/csv";
  return null;
}
