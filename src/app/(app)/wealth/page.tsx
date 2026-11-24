import Link from "next/link";
import { pageCtx } from "@/lib/server/page";
import { loadSnapshots } from "@/lib/server/services/snapshots";
import { NW_GROUP_LABELS, type NWGroup, type NWItem } from "@/lib/finance/networth";
import { ASSET_CLASS_LABELS } from "@/lib/finance/investments";
import { ACCOUNT_TYPE_LABELS } from "@/lib/finance/types";
import { MANUAL_ASSET_LABELS, MANUAL_LIABILITY_LABELS } from "@/lib/finance/networth";
import { addMonths, monthLabel } from "@/lib/finance/dates";
import { formatMoney, formatPct } from "@/lib/format";
import { Badge, Card, CardHeader, LinkButton, Notice, PageHeader, Stat } from "@/components/ui/core";
import { ChartFrame, Donut, TrendChart } from "@/components/charts";

export const metadata = { title: "Net worth" };

function href(i: NWItem) {
  return i.source === "account" ? `/accounts/${i.id}` : i.source === "holding" ? `/investments/${i.id}` : i.source === "asset" ? "/wealth/assets" : "/wealth/liabilities";
}
function subtypeLabel(i: NWItem) {
  return (
    (ACCOUNT_TYPE_LABELS as Record<string, string>)[i.subtype] ??
    (ASSET_CLASS_LABELS as Record<string, string>)[i.subtype] ??
    MANUAL_ASSET_LABELS[i.subtype] ??
    MANUAL_LIABILITY_LABELS[i.subtype] ??
    (i.subtype === "OVERDRAFT" ? "Overdraft" : i.subtype)
  );
}

export default async function NetWorthPage() {
  const ctx = await pageCtx();
  const nw = ctx.netWorth;
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const snaps = await loadSnapshots(ctx.userId);
  const yearAgo = [...snaps].reverse().find((s) => s.date <= addMonths(ctx.today, -12));
  const growth = yearAgo && Number(yearAgo.netWorth) ? ((nw.netWorth - Number(yearAgo.netWorth)) / Math.abs(Number(yearAgo.netWorth))) * 100 : null;
  const recent = snaps.slice(-7);
  const monthlyCreation = recent.length >= 2 ? Math.round((Number(recent.at(-1)!.netWorth) - Number(recent[0].netWorth)) / (recent.length - 1)) : null;
  const liabStart = recent.length >= 2 ? Number(recent[0].totalLiabilities) : null;

  const groups = (items: NWItem[]) => {
    const m = new Map<NWGroup, NWItem[]>();
    for (const i of items) m.set(i.group, [...(m.get(i.group) ?? []), i]);
    return [...m.entries()];
  };
  const Section = ({ title, items, total, negative }: { title: string; items: NWItem[]; total: number; negative?: boolean }) => (
    <Card>
      <CardHeader title={title} action={<span className={`num text-[14px] font-semibold ${negative ? "text-neg" : ""}`}>{f(total)}</span>} />
      {groups(items).map(([g, list]) => (
        <div key={g} className="border-t border-line">
          <div className="flex justify-between bg-surface-2/50 px-5 py-1.5 text-[11.5px] font-medium uppercase tracking-wide text-muted">
            <span>{NW_GROUP_LABELS[g]}</span>
            <span className="num">{f(list.reduce((s, i) => s + i.value, 0))}</span>
          </div>
          <ul>
            {list.map((i) => (
              <li key={i.source + i.id}>
                <Link href={href(i)} className="flex items-center justify-between gap-3 px-5 py-2 text-[13px] hover:bg-surface-2/60">
                  <span className="min-w-0">
                    <span className="block truncate">{i.name}</span>
                    <span className="text-[11.5px] text-muted">
                      {subtypeLabel(i)} {i.flag && <Badge tone="warn">{i.flag}</Badge>}
                    </span>
                  </span>
                  <span className="num shrink-0">{f(i.value)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {!items.length && <p className="px-5 pb-5 text-[13px] text-muted">None recorded.</p>}
    </Card>
  );

  return (
    <>
      <PageHeader
        title="Net worth"
        description="Net worth = total assets − total liabilities. Account cash, investment holdings and other assets are each counted exactly once."
        actions={
          <>
            <LinkButton href="/wealth/history">History</LinkButton>
            <LinkButton href="/reports?report=balance-sheet">Balance sheet</LinkButton>
          </>
        }
      />
      {nw.warnings.map((w) => (
        <Notice key={w} tone="warn" className="mb-3">
          {w}
        </Notice>
      ))}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Net worth" value={f(nw.netWorth)} className="lg:col-span-2" />
        <Stat label="Total assets" value={f(nw.totalAssets)} />
        <Stat label="Total liabilities" value={f(nw.totalLiabilities)} hint={liabStart != null ? `${formatMoney(nw.totalLiabilities - liabStart, ctx.fmt, { sign: true })} over ${recent.length - 1} mo` : undefined} />
        <Stat label="Debt-to-asset" value={formatPct(nw.debtToAsset)} tooltip="Total liabilities ÷ total assets." />
        <Stat label="Monthly wealth creation" value={monthlyCreation != null ? formatMoney(monthlyCreation, ctx.fmt, { sign: true }) : "—"} hint={growth != null ? `${formatPct(growth, 1, true)} in 12 months` : "needs snapshot history"} tooltip="Average monthly change in net worth over the recent month-end snapshots." />
      </div>
      <div className="mb-4 grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <ChartFrame
            title="Wealth over time"
            subtitle="Month-end snapshots"
            legend={[{ label: "Assets", slot: 0 }, { label: "Liabilities", slot: 1 }, { label: "Net worth", slot: 2 }]}
            table={{ columns: ["Month", "Assets", "Liabilities", "Net worth"], rows: snaps.map((s) => [monthLabel(s.date.slice(0, 7)), f(Number(s.totalAssets)), f(Number(s.totalLiabilities)), f(Number(s.netWorth))]) }}
          >
            <TrendChart
              prefs={ctx.fmt}
              xKey="x"
              data={snaps.map((s) => ({ x: s.date, assets: Number(s.totalAssets), liabilities: Number(s.totalLiabilities), netWorth: Number(s.netWorth) }))}
              series={[
                { key: "assets", name: "Assets", slot: 0, type: "line" },
                { key: "liabilities", name: "Liabilities", slot: 1, type: "line" },
                { key: "netWorth", name: "Net worth", slot: 2 },
              ]}
              xFormat="month"
              height={260}
            />
          </ChartFrame>
        </div>
        <div className="lg:col-span-4">
          <ChartFrame title="Asset mix" table={{ columns: ["Group", "Value"], rows: (Object.keys(NW_GROUP_LABELS) as NWGroup[]).slice(0, 4).map((g) => [NW_GROUP_LABELS[g], f(nw.byGroup[g])]) }}>
            <Donut
              prefs={ctx.fmt}
              height={150}
              rows={[
                ...ctx.portfolio.allocation.map((a) => ({ key: a.assetClass, label: ASSET_CLASS_LABELS[a.assetClass], value: a.value })),
                { key: "cash", label: "Cash & bank", value: nw.byGroup.CASH_BANK },
                { key: "bcash", label: "Brokerage cash", value: nw.byGroup.INVESTMENT_CASH },
                { key: "other", label: "Property & other", value: nw.byGroup.OTHER_ASSETS },
              ]}
            />
          </ChartFrame>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Assets" items={nw.assets} total={nw.totalAssets} />
        <Section title="Liabilities" items={nw.liabilities} total={nw.totalLiabilities} negative />
      </div>
    </>
  );
}
