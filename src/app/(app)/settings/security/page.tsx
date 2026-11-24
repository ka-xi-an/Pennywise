import { LogOut, ShieldCheck } from "lucide-react";
import { requireUser, currentSessionId } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { Badge, Card, CardHeader, Notice, PageHeader, Table, Td, Th } from "@/components/ui/core";
import { ActionButton } from "@/components/ui/modal";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { changePassword, deleteUserAccount, revokeOtherSessions, revokeSession } from "../actions";
import { SettingsTabs } from "../settings-tabs";

export const metadata = { title: "Security" };

export default async function SecurityPage() {
  const user = await requireUser();
  const [sessions, sid, events] = await Promise.all([
    db.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } }),
    currentSessionId(),
    db.auditLog.findMany({ where: { userId: user.id, action: { startsWith: "auth." } }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsTabs active="security" />
      <Notice className="mb-4" title="How your data is protected">
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>Passwords are hashed with scrypt; we never store or ask for bank passwords, UPI PINs or card PINs.</li>
          <li>Sessions use random tokens in httpOnly cookies; only a hash is stored on the server.</li>
          <li>Receipts and tax documents are encrypted at rest (AES-256-GCM) and only downloadable by you.</li>
          <li>Every query is scoped to your account; changes are recorded in an audit trail.</li>
          <li>Use HTTPS in production (security headers and Secure cookies are enabled automatically).</li>
        </ul>
      </Notice>
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="h-fit lg:col-span-5">
          <CardHeader title="Change password" />
          <ActionForm action={changePassword} resetOnSuccess className="grid gap-4 px-5 pb-5">
            <Field label="Current password" name="current">
              <Input name="current" type="password" autoComplete="current-password" />
            </Field>
            <Field label="New password" name="next" hint="10+ characters, three of: lowercase, uppercase, number, symbol">
              <Input name="next" type="password" autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password" name="confirm">
              <Input name="confirm" type="password" autoComplete="new-password" />
            </Field>
            <SubmitButton>Change password</SubmitButton>
          </ActionForm>
        </Card>
        <div className="space-y-4 lg:col-span-7">
          <Card>
            <CardHeader
              title="Active sessions"
              action={
                sessions.length > 1 && (
                  <ActionButton action={revokeOtherSessions}>
                    <LogOut className="size-3.5" /> Sign out others
                  </ActionButton>
                )
              }
            />
            <Table>
              <thead>
                <tr>
                  <Th>Device</Th>
                  <Th>IP</Th>
                  <Th>Last active</Th>
                  <Th align="right"> </Th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <Td className="max-w-[260px] truncate text-[12.5px]" >
                      {s.userAgent ?? "Unknown device"} {s.id === sid && <Badge tone="pos">This device</Badge>}
                    </Td>
                    <Td className="text-fg-2">{s.ip ?? "—"}</Td>
                    <Td className="text-fg-2">{s.lastSeenAt.toLocaleString("en-IN")}</Td>
                    <Td align="right">
                      {s.id !== sid && (
                        <ActionButton action={revokeSession.bind(null, s.id)} variant="ghost">
                          Sign out
                        </ActionButton>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Recent security events" />
            <ul className="divide-y divide-line">
              {events.map((e) => (
                <li key={e.id} className="flex justify-between px-5 py-2 text-[12.5px]">
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="size-3.5 text-muted" /> {e.action.replace("auth.", "").replace(/_/g, " ")}
                  </span>
                  <span className="text-muted">
                    {e.createdAt.toLocaleString("en-IN")} {e.ip && `· ${e.ip}`}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="border-neg/40">
            <CardHeader title={<span className="text-neg">Delete account</span>} subtitle="Permanently deletes your account, all financial records and uploaded files. Download a backup first." />
            <ActionForm action={deleteUserAccount} className="grid gap-3 px-5 pb-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="Password" name="password">
                <Input name="password" type="password" autoComplete="current-password" />
              </Field>
              <Field label='Type "DELETE"' name="confirm">
                <Input name="confirm" />
              </Field>
              <SubmitButton variant="danger">Delete forever</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
