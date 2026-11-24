import "server-only";
import { db } from "./db";
import { clientInfo } from "./auth";

/** Append-only audit trail of security events and financial record changes. */
export async function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  details?: Record<string, unknown>,
) {
  try {
    const { ip } = await clientInfo().catch(() => ({ ip: null }));
    await db.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId: entityId ?? null,
        details: details ? JSON.stringify(details, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) : null,
        ip,
      },
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}
