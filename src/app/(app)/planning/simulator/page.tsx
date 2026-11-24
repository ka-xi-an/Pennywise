import { pageCtx } from "@/lib/server/page";
import { simBase } from "@/lib/server/sim-base";
import { PageHeader } from "@/components/ui/core";
import { Simulator } from "./simulator";

export const metadata = { title: "Scenario simulator" };

export default async function SimulatorPage() {
  const ctx = await pageCtx();
  const { params, facts, basis } = simBase(ctx);
  const goals = ctx.goals
    .filter((g) => g.status === "ACTIVE" && g.progress.remaining > 0)
    .sort((a, b) => a.priority - b.priority)
    .map((g) => ({ name: g.name, remaining: g.progress.remaining, monthly: g.monthlyContribution }));
  return (
    <>
      <PageHeader title="Scenario simulator" description="What happens if income rises, spending falls, you invest more, prepay a loan or make a big purchase? Compare against your current trajectory." />
      <Simulator base={params} prefs={ctx.fmt} today={ctx.today} goals={goals} facts={facts} basis={basis} />
    </>
  );
}
