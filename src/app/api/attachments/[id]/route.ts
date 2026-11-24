import { NextResponse } from "next/server";
import { apiUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { readStoredFile } from "@/lib/server/storage";

/** Authenticated, owner-only download of a decrypted attachment. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const a = await db.attachment.findFirst({ where: { id, userId: user.id } });
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const data = await readStoredFile(user.id, a.storageKey, a.iv, a.authTag);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": a.mimeType,
        "Content-Length": String(data.length),
        "Content-Disposition": `${a.mimeType.startsWith("image/") || a.mimeType === "application/pdf" ? "inline" : "attachment"}; filename="${encodeURIComponent(a.filename)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return NextResponse.json({ error: "File could not be decrypted (missing or changed encryption key)" }, { status: 500 });
  }
}
