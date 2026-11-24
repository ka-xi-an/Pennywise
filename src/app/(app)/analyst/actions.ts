"use server";

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/server/db";
import { rateLimit, requireUser } from "@/lib/server/auth";
import { getCtx } from "@/lib/server/data";
import { audit } from "@/lib/server/audit";
import { builtinAnswer } from "@/lib/server/ai/builtin";
import { claudeAnswer, claudeConfigured } from "@/lib/server/ai/claude";
import { fail, ok } from "@/lib/actions/result";
import { revalidateAll } from "@/lib/actions/helpers";

export async function askAnalyst(question: string) {
  const user = await requireUser();
  const q = (question ?? "").trim().slice(0, 1000);
  if (!q) return fail("Ask a question");
  if (!rateLimit(`ai:${user.id}`, 30, 60 * 60_000)) return fail("You've asked a lot of questions this hour — try again shortly.");
  const ctx = await getCtx(user.id);
  const pref = await db.userPreference.findUnique({ where: { userId: user.id }, select: { aiProvider: true } });
  const useClaude = pref?.aiProvider === "claude" && claudeConfigured();
  let answer: string;
  let engine = "builtin";
  if (useClaude) {
    try {
      const history = (await db.aiMessage.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10 })).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      answer = await claudeAnswer(ctx, q, history);
      engine = "claude";
    } catch (e) {
      const why =
        e instanceof Anthropic.AuthenticationError
          ? "the API key was rejected"
          : e instanceof Anthropic.RateLimitError
            ? "the API rate limit was reached"
            : e instanceof Anthropic.APIConnectionError
              ? "the API could not be reached"
              : e instanceof Anthropic.APIError
                ? `the API returned ${e.status}`
                : "an unexpected error occurred";
      console.error("Claude analyst failed", e);
      answer = `${await builtinAnswer(ctx, q)}\n\n_(Answered by the built-in analyst because ${why}.)_`;
    }
  } else answer = await builtinAnswer(ctx, q);
  await db.aiMessage.createMany({
    data: [
      { userId: user.id, role: "user", content: q, engine },
      { userId: user.id, role: "assistant", content: answer, engine },
    ],
  });
  if (engine === "claude") await audit(user.id, "ai.query", "AiMessage", null, { engine });
  return ok(undefined, { answer, engine });
}

export async function setAiProvider(provider: "builtin" | "claude") {
  const user = await requireUser();
  if (provider === "claude" && !claudeConfigured()) return fail("Claude isn't configured on this server (ANTHROPIC_API_KEY is not set).");
  await db.userPreference.update({ where: { userId: user.id }, data: { aiProvider: provider } });
  await audit(user.id, "ai.provider", "UserPreference", null, { provider });
  revalidateAll();
  return ok(provider === "claude" ? "Claude enabled — summarised figures from your data will be sent to the Anthropic API when you ask questions" : "Using the built-in analyst — nothing leaves this server");
}

export async function clearAnalystHistory() {
  const user = await requireUser();
  await db.aiMessage.deleteMany({ where: { userId: user.id } });
  revalidateAll();
  return ok("Conversation cleared");
}
