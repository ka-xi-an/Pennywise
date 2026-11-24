import { pageCtx } from "@/lib/server/page";
import { db } from "@/lib/server/db";
import { Badge, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/core";
import { ConfirmAction } from "@/components/ui/modal";
import { accountName } from "@/lib/server/data";
import { ImportWizard } from "./wizard";
import { undoImport } from "./actions";

export const metadata = { title: "Import transactions" };

export default async function ImportPage() {
  const ctx = await pageCtx();
  const batches = await db.importBatch.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 20 });
  return (
    <>
      <PageHeader
        title="Import transactions"
        description="Upload a bank or card statement as CSV (in Excel, use File → Save As → CSV). Preview, fix mapping and review duplicates before anything is saved."
      />
      <ImportWizard accounts={ctx.accounts.filter((a) => a.status === "ACTIVE" && a.type !== "LOAN").map((a) => ({ id: a.id, name: a.name, currency: a.currency }))} />
      <Card className="mt-6">
        <CardHeader title="Import history" subtitle="Every import can be undone — it removes exactly the transactions it created." />
        <Table>
          <thead>
            <tr>
              <Th>File</Th>
              <Th>Account</Th>
              <Th>When</Th>
              <Th align="right">Imported</Th>
              <Th align="right">Skipped / dupes</Th>
              <Th align="right">Errors</Th>
              <Th align="right"> </Th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <Td className="font-medium">{b.filename}</Td>
                <Td className="text-fg-2">{accountName(ctx, b.accountId)}</Td>
                <Td className="text-fg-2">{b.createdAt.toLocaleString("en-IN")}</Td>
                <Td align="right">{b.importedRows}</Td>
                <Td align="right">{b.skippedRows}</Td>
                <Td align="right">{b.errorRows}</Td>
                <Td align="right">
                  {b.status === "UNDONE" ? (
                    <Badge>Undone</Badge>
                  ) : (
                    <ConfirmAction action={undoImport.bind(null, b.id)} title="Undo this import?" description={`Deletes the ${b.importedRows} transactions created by “${b.filename}”. Balances and reports update immediately.`} confirmLabel="Undo import">
                      Undo
                    </ConfirmAction>
                  )}
                </Td>
              </tr>
            ))}
            {!batches.length && (
              <tr>
                <Td colSpan={7} className="py-6 text-center text-muted">
                  No imports yet.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
