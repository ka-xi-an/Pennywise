import Link from "next/link";
import { Sparkles } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { buildInsights } from "@/lib/server/insights";
import { Card, EmptyState, LinkButton, PageHeader, cx } from "@/components/ui/core";

export const metadata = { title: "Financial insights" };

export default async function InsightsPage() {
  const ctx = await pageCtx();
  const insights = await buildInsights(ctx);
  return (
    <>
      <PageHeader
        title="Financial insights"
        description="Observations computed from your records, ordered by importance. Each one links to the data behind it."
        actions={<LinkButton href="/analyst" variant="ai"><Sparkles className="size-4" /> Ask the analyst</LinkButton>}
      />
      {!insights.length ? (
        <Card>
          <EmptyState icon={<Sparkles className="size-5" />} title="No insights yet" description="Record a few weeks of income and spending — insights appear as patterns emerge." />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {insights.map((i) => (
            <Link key={i.id} href={i.link ?? "#"}>
              <Card className="h-full p-4 hover:shadow-pop">
                <p className="flex items-center gap-2 text-[14px] font-semibold">
                  <span className={cx("size-2 shrink-0 rounded-full", i.tone === "pos" ? "bg-pos" : i.tone === "neg" ? "bg-neg" : i.tone === "warn" ? "bg-[#eda100]" : i.tone === "ai" ? "bg-ai" : "bg-info")} />
                  {i.title}
                </p>
                <p className="mt-1 text-[13px] text-fg-2">{i.body}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
