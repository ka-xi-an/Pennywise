import Link from "next/link";
import { Download, FileSpreadsheet, Sparkles, Upload } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { db } from "@/lib/server/db";
import { Badge, Card, CardHeader, LinkButton, Notice, PageHeader } from "@/components/ui/core";
import { ActionButton, ConfirmAction } from "@/components/ui/modal";
import { SettingsTabs } from "../settings-tabs";
import { startDemo, stopDemo } from "../demo-actions";
import { BackupPanel, EraseCard, RestorePanel } from "./data-panels";

export const metadata = { title: "Data & backup" };

export default async function DataPage() {
  const ctx = await pageCtx();
  const demoCount = await db.transaction.count({ where: { userId: ctx.userId, isDemo: true } });
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsTabs active="data" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Import & export" />
          <div className="grid gap-2 px-5 pb-5 sm:grid-cols-2">
            <LinkButton href="/import">
              <Upload className="size-4" /> Import bank CSV
            </LinkButton>
            <LinkButton href="/api/export/transactions" prefetch={false}>
              <Download className="size-4" /> All transactions (CSV)
            </LinkButton>
            <LinkButton href="/reports">
              <FileSpreadsheet className="size-4" /> Statements (CSV / PDF)
            </LinkButton>
            <LinkButton href="/reports/custom">Custom report</LinkButton>
          </div>
          <p className="px-5 pb-4 text-[11.5px] text-muted">CSV files include a UTF-8 byte-order mark and open directly in Excel. For PDFs, use “PDF / Print” on any report and choose “Save as PDF”.</p>
        </Card>
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                Demo mode {ctx.prefs.demoMode && <Badge tone="warn">On</Badge>}
              </span>
            }
            subtitle="A year of realistic, entirely fictional data to explore every module. Every demo record is labelled “Demo”; demo instruments and prices are invented."
          />
          <div className="flex flex-wrap gap-2 px-5 pb-5">
            {demoCount === 0 ? (
              <ActionButton action={startDemo} variant="ai" size="md">
                <Sparkles className="size-4" /> Load demo data
              </ActionButton>
            ) : (
              <ConfirmAction action={stopDemo} title="Remove all demo data?" description={`Deletes ${demoCount} demo transactions and every other record marked Demo. Your own records stay.`} confirmLabel="Remove demo data" variant="secondary" size="md">
                Remove demo data ({demoCount} transactions)
              </ConfirmAction>
            )}
          </div>
          {demoCount > 0 && <Notice tone="warn" className="mx-5 mb-5">If you added your own transactions to demo accounts, they are removed with those accounts.</Notice>}
        </Card>
        <BackupPanel />
        <RestorePanel />
        <div className="lg:col-span-2">
          <EraseCard />
        </div>
      </div>
      <p className="mt-4 text-[12px] text-muted">
        To delete your login as well, go to <Link href="/settings/security" className="underline">Security</Link>.
      </p>
    </>
  );
}
