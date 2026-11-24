import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Ctx } from "../data";
import { toolImpl, type ToolName } from "./tools";

/**
 * Claude-powered analyst (opt-in). Runs a short, server-side tool loop over
 * READ-ONLY functions of the user's own data — the model cannot create, edit or
 * delete anything. The API key stays on the server (ANTHROPIC_API_KEY).
 */

export function claudeConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

const PERIOD = {
  type: "string",
  enum: ["this_week", "this_month", "last_month", "last_3_months", "last_6_months", "this_year", "last_year", "this_fy", "all"],
  description: "Named period. Ignored when from/to are given.",
} as const;
const RANGE_PROPS = {
  period: PERIOD,
  from: { type: "string", description: "Start date YYYY-MM-DD (optional)" },
  to: { type: "string", description: "End date YYYY-MM-DD (optional)" },
} as const;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  { name: "get_overview", description: "Net worth, assets/liabilities by group, account balances, liquid cash and key trailing averages (savings rate, emergency-fund months, debt-to-income).", input_schema: { type: "object", properties: {} } },
  { name: "get_period_summary", description: "Income, expenses, savings, top expense categories, top merchants and income sources for a period.", input_schema: { type: "object", properties: RANGE_PROPS } },
  { name: "compare_periods", description: "Compare a period with the previous equal-length period and list the categories that changed most. Use to explain why spending rose or fell.", input_schema: { type: "object", properties: RANGE_PROPS } },
  {
    name: "search_transactions",
    description: "Find individual transactions by text (merchant/description/category), period, type or minimum amount.",
    input_schema: {
      type: "object",
      properties: {
        ...RANGE_PROPS,
        text: { type: "string" },
        type: { type: "string", enum: ["INCOME", "EXPENSE", "TRANSFER", "INVESTMENT_BUY", "INVESTMENT_SELL", "DIVIDEND", "INTEREST", "LOAN_DISBURSEMENT", "LOAN_REPAYMENT", "REFUND", "ADJUSTMENT"] },
        min_amount: { type: "number", description: "Minimum amount in major currency units" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
  },
  { name: "get_budgets", description: "Active budgets with planned, spent and projected amounts per category for the current period.", input_schema: { type: "object", properties: {} } },
  { name: "get_goals", description: "Financial goals with progress, required monthly contribution and projected completion.", input_schema: { type: "object", properties: {} } },
  { name: "get_investments", description: "Portfolio value, cost, realized/unrealized gains, XIRR, allocation and per-holding details including price source and date.", input_schema: { type: "object", properties: {} } },
  { name: "get_debts", description: "Loans (rate, EMI, months left, payoff date, interest remaining), credit card dues and other debts.", input_schema: { type: "object", properties: {} } },
  { name: "get_cash_forecast", description: "Estimated liquid cash for the next N months from the trailing average net cash flow.", input_schema: { type: "object", properties: { months: { type: "integer", minimum: 1, maximum: 24 } } } },
  { name: "get_health_and_insights", description: "Financial health score components, rule-based insights, unusual transactions and possible untracked subscriptions.", input_schema: { type: "object", properties: {} } },
];

const SYSTEM = `You are the financial analyst inside Ledgerline, a personal finance app. You answer questions about the user's own finances.

Ground rules:
- Use the tools to get every figure. Never invent, guess or round numbers that the tools did not return. If the data needed is missing, say so and suggest what to record.
- Amounts from tools are already formatted in the user's currency; quote them as given.
- Clearly label anything forward-looking (forecasts, projections, "if you keep this pace") as an estimate and state its assumptions.
- You are read-only. You cannot create, edit or delete transactions, accounts or any record. If asked to, explain how the user can do it in the app.
- Investment prices are manually entered or demo values unless a provider is configured; mention the price date when it matters, and never present demo prices as real market data.
- The health score is a rules-based indicator, not a credit score. Do not give personalised investment, tax or legal advice; you can explain what the data shows and general, well-established principles.
- Be concise: lead with the answer, then a few supporting bullets. Use **bold** for key figures and "- " bullets. No tables or headings.`;

export async function claudeAnswer(ctx: Ctx, question: string, history: { role: "user" | "assistant"; content: string }[]): Promise<string> {
  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-10).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: `Today is ${ctx.today}. Base currency ${ctx.prefs.baseCurrency}.\n\n${question}` },
  ];
  for (let turn = 0; turn < 8; turn++) {
    const res = await client.beta.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: SYSTEM,
      tools: TOOLS,
      tool_choice: { type: "auto" },
      messages,
    });
    if (res.stop_reason === "refusal") return "I can't help with that request. Try asking about your spending, savings, investments, debts or goals.";
    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason !== "tool_use") {
      const text = res.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return text || "I couldn't produce an answer from your data.";
    }
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      try {
        if (!(block.name in toolImpl)) throw new Error(`Unknown tool ${block.name}`);
        const input = (block.input && typeof block.input === "object" ? block.input : {}) as Record<string, never>;
        const fn = toolImpl[block.name as ToolName] as (c: Ctx, i: Record<string, never>) => unknown;
        const out = await fn(ctx, input);
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: block.id, content: e instanceof Error ? e.message : "Tool failed", is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return "That question needed more steps than allowed. Try asking something more specific.";
}
