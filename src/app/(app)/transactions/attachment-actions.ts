"use server";

import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { fail, ok } from "@/lib/actions/result";
import { revalidateAll, run } from "@/lib/actions/helpers";
import { ALLOWED_TYPES, MAX_UPLOAD, removeStoredFile, sniffType, storeFile } from "@/lib/server/storage";

/** Upload a receipt or tax document. Files are type-checked by content and encrypted at rest. */
export async function uploadAttachment(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("Choose a file", { file: "Required" });
    if (file.size > MAX_UPLOAD) return fail("Files must be 10 MB or smaller", { file: "Too large" });
    const buf = Buffer.from(await file.arrayBuffer());
    const type = sniffType(buf, file.type);
    if (!type || !ALLOWED_TYPES[type]) return fail("Only PDF, PNG, JPEG, WEBP, HEIC or CSV files are accepted", { file: "Unsupported type" });
    const transactionId = (fd.get("transactionId") as string) || null;
    if (transactionId && !(await db.transaction.findFirst({ where: { id: transactionId, userId: user.id } }))) return fail("Transaction not found");
    const kind = fd.get("kind") === "TAX_DOCUMENT" ? "TAX_DOCUMENT" : transactionId ? "RECEIPT" : "OTHER";
    const fy = (fd.get("financialYear") as string) || null;
    if (fy && !/^\d{4}(-\d{2})?$/.test(fy)) return fail("Invalid financial year");
    const stored = await storeFile(user.id, buf);
    const name = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || `upload.${ALLOWED_TYPES[type]}`;
    const a = await db.attachment.create({
      data: {
        userId: user.id,
        transactionId,
        kind,
        financialYear: fy,
        filename: name,
        mimeType: type,
        size: buf.length,
        description: ((fd.get("description") as string) || "").slice(0, 200) || null,
        ...stored,
      },
    });
    await audit(user.id, "attachment.upload", "Attachment", a.id, { kind, size: buf.length });
    revalidateAll();
    return ok("File uploaded and encrypted");
  });
}

export async function deleteAttachment(id: string) {
  const user = await requireUser();
  return run(async () => {
    const a = await db.attachment.findFirst({ where: { id, userId: user.id } });
    if (!a) return fail("File not found");
    await db.attachment.delete({ where: { id } });
    await removeStoredFile(user.id, a.storageKey);
    await audit(user.id, "attachment.delete", "Attachment", id);
    revalidateAll();
    return ok("File deleted");
  });
}
