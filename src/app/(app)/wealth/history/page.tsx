import { History, Camera } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { loadSnapshots } from "@/lib/server/services/snapshots";
import { monthLabel } from "@/lib/finance/dates";
import { NW_GROUP_LABELS, type NWGroup } from "@/lib/finance/networth";
import { formatMoney, formatPct } from "@/lib/format";
import { Badge, Card, CardHeader, Notice, PageHeader, Table, Td, Th } from "@/components/ui/core";
import { ActionButton } from "@/components/ui/modal";
import { ChartFrame, ColumnChart } from "@/components/charts";
import { backfillHistory, recordSnapshotNow } from "../actions";

export const metadata = { title: "Wealth history" };

export default async function HistoryPage() {
  const ctx = await pageCtx();
  const snaps = await loadSnapshots(ctx.userId);
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const rows = snaps.map((s, i) => {
    const prev = snaps[i - 1];
    const nw = Number(s.netWorth);
    return { s, nw, change: prev ? nw - Number(prev.netWorth) : null, breakdown: JSON.parse(s.breakdown || "{}") as Record<NWGroup, number> };
  });
  return (
    <>
      <PageHeader
        title="Wealth history"
        description="A month-end snapshot is recorded automatically each month. Earlier months can be estimated from your ledger."
        actions={
          <>
            <ActionButton action={recordSnapshotNow} size="md">
              <Camera className="size-4" /> Snapshot now
            </ActionButton>
            <ActionButton action={backfillHistory} size="md" variant="primary">
              <History className="size-4" /> Estimate past months
            </ActionButton>
          </>
        }
      />
      <Notice className="mb-4">
        <b>Recorded</b> snapshots use the valuations you had at the time. <b>Estimated</b> months are rebuilt from transactions: account balances are exact, but investments are valued at cost (historical prices are unknown) and property at its recorded value.
      </Notice>
      <ChartFrame
        className="mb-4"
        title="Monthly change in net worth"
        table={{ columns: ["Month", "Change"], rows: rows.filter((r) => r.change != null).map((r) => [monthLabel(r.s.date.slice(0, 7)), f(r.change!)]) }}
      >
        <ColumnChart prefs={ctx.fmt} xKey="x" data={rows.filter((r) => r.change != null).map((r) => ({ x: r.s.date, change: r.change! }))} series={[{ key: "change", name: "Change", slot: 2 }]} xFormat="month" height={220} />
      </ChartFrame>
      <Card>
        <CardHeader title="Snapshots" />
        <Table>
          <thead>
            <tr>
              <Th>Month end</Th>
              <Th align="right">{NW_GROUP_LABELS.CASH_BANK}</Th>
              <Th align="right">{NW_GROUP_LABELS.INVESTMENTS}</Th>
              <Th align="right">Assets</Th>
              <Th align="right">Liabilities</Th>
              <Th align="right">Net worth</Th>
              <Th align="right">Change</Th>
              <Th>Source</Th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.s.id}>
                <Td>{monthLabel(r.s.date.slice(0, 7))}</Td>
                <Td align="right">{f(r.breakdown.CASH_BANK ?? 0)}</Td>
                <Td align="right">{f(r.breakdown.INVESTMENTS ?? 0)}</Td>
                <Td align="right">{f(Number(r.s.totalAssets))}</Td>
                <Td align="right">{f(Number(r.s.totalLiabilities))}</Td>
                <Td align="right" className="font-medium">{f(r.nw)}</Td>
                <Td align="right" className={r.change == null ? "" : r.change >= 0 ? "text-pos" : "text-neg"}>
                  {r.change == null ? "—" : `${formatMoney(r.change, ctx.fmt, { sign: true })} (${formatPct(r.nw - r.change ? (r.change / Math.abs(r.nw - r.change)) * 100 : null, 1, true)})`}
                </Td>
                <Td>{r.s.source === "BACKFILLED" ? <Badge tone="warn">Estimated</Badge> : <Badge tone="pos">Recorded</Badge>}</Td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <Td colSpan={8} className="py-8 text-center text-muted">
                  No snapshots yet.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
