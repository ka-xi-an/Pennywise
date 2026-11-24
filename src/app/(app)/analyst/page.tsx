import { pageCtx } from "@/lib/server/page";
import { db } from "@/lib/server/db";
import { claudeConfigured } from "@/lib/server/ai/claude";
import { LinkButton, PageHeader } from "@/components/ui/core";
import { AnalystChat } from "./chat";

export const metadata = { title: "AI Financial Analyst" };

export default async function AnalystPage() {
  const ctx = await pageCtx();
  const [history, pref] = await Promise.all([
    db.aiMessage.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "asc" }, take: 60 }),
    db.userPreference.findUnique({ where: { userId: ctx.userId }, select: { aiProvider: true } }),
  ]);
  return (
    <>
      <PageHeader
        eyebrow={<span className="text-ai">AI Financial Analyst</span>}
        title="Financial assistant"
        description="Natural-language questions answered from your actual records. Read-only: it can explain and project, never move money."
        actions={<LinkButton href="/analyst/intelligence">Spending intelligence</LinkButton>}
      />
      <AnalystChat
        initial={history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content, engine: m.engine }))}
        provider={claudeConfigured() ? pref?.aiProvider ?? "builtin" : "builtin"}
        claudeAvailable={claudeConfigured()}
      />
    </>
  );
}
