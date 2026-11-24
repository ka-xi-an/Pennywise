import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

/**
 * Encryption at rest for uploaded files (AES-256-GCM, random 96-bit IV per file,
 * authenticated). Key comes from FILE_ENCRYPTION_KEY (64 hex chars) — never shipped
 * to the browser.
 */
function fileKey(): Buffer {
  const hex = process.env.FILE_ENCRYPTION_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("FILE_ENCRYPTION_KEY must be 64 hex characters. Run `npm run setup`.");
  }
  return Buffer.from(hex, "hex");
}

export function encryptFile(plain: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", fileKey(), iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { data, iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

export function decryptFile(data: Buffer, ivB64: string, tagB64: string): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", fileKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function sha256Hex(buf: Buffer | string) {
  return createHash("sha256").update(buf).digest("hex");
}

/** Passphrase-protected backup envelope (scrypt KDF + AES-256-GCM). */
export function encryptBackup(json: string, passphrase: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(passphrase.normalize("NFKC"), salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(json, "utf8"), c.final()]);
  return JSON.stringify({
    format: "ledgerline-backup-encrypted",
    v: 1,
    kdf: "scrypt",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
}

export function decryptBackup(envelope: string, passphrase: string): string {
  const e = JSON.parse(envelope);
  if (e.format !== "ledgerline-backup-encrypted") throw new Error("Not an encrypted Ledgerline backup");
  const key = scryptSync(passphrase.normalize("NFKC"), Buffer.from(e.salt, "base64"), 32, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(e.iv, "base64"));
  d.setAuthTag(Buffer.from(e.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(e.data, "base64")), d.final()]).toString("utf8");
}
