"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp, Loader2, Sparkles, Trash2, User } from "lucide-react";
import clsx from "clsx";
import { Badge, btnClass } from "@/components/ui/core";
import { useToast } from "@/components/ui/toast";
import { MiniMarkdown } from "@/components/mini-markdown";
import { askAnalyst, clearAnalystHistory, setAiProvider } from "./actions";

interface Msg {
  role: "user" | "assistant";
  content: string;
  engine: string;
}

const SUGGESTIONS = [
  "What is my current net worth?",
  "How much did I spend this month?",
  "What are my biggest expenses this year?",
  "Why did my spending increase last month?",
  "What is my savings rate?",
  "How are my investments performing?",
  "When will I reach my savings goals?",
  "What will my cash balance look like in six months?",
  "How much debt remains?",
  "How healthy are my finances?",
];

export function AnalystChat({ initial, provider, claudeAvailable }: { initial: Msg[]; provider: string; claudeAvailable: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [prov, setProv] = useState(provider);
  const toast = useToast();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Block body on purpose: newer browsers return a Promise from scrollIntoView, which
    // React would otherwise treat as an effect cleanup function.
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, pending]);

  const ask = (text: string) => {
    const question = text.trim();
    if (!question || pending) return;
    setMsgs((m) => [...m, { role: "user", content: question, engine: prov }]);
    setQ("");
    start(async () => {
      const r = await askAnalyst(question);
      if (r.ok && r.data) {
        const d = r.data as { answer: string; engine: string };
        setMsgs((m) => [...m, { role: "assistant", content: d.answer, engine: d.engine }]);
      } else if (!r.ok) {
        toast.error(r.message);
        setMsgs((m) => m.slice(0, -1));
        setQ(question);
      }
    });
  };

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[480px] flex-col rounded-xl border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="text-[12.5px] text-fg-2">Engine:</span>
        <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
          {(["builtin", "claude"] as const).map((p) => (
            <button
              key={p}
              type="button"
              disabled={p === "claude" && !claudeAvailable}
              title={p === "claude" && !claudeAvailable ? "Set ANTHROPIC_API_KEY on the server to enable" : undefined}
              onClick={() =>
                start(async () => {
                  const r = await setAiProvider(p);
                  if (r.ok) {
                    setProv(p);
                    toast.info(r.message ?? "Updated");
                  } else toast.error(r.message);
                })
              }
              className={clsx("rounded-md px-2.5 py-1 text-[12px] font-medium disabled:opacity-40", prov === p ? "bg-surface text-fg shadow-card" : "text-muted")}
            >
              {p === "builtin" ? "Built-in (private)" : "Claude"}
            </button>
          ))}
        </div>
        <span className="text-[11.5px] text-muted">
          {prov === "claude" ? "Figures computed from your data are sent to the Anthropic API to answer." : "Answers are computed on this server; nothing is sent elsewhere."}
        </span>
        {msgs.length > 0 && (
          <button
            className={btnClass("ghost", "sm", "ml-auto")}
            onClick={() =>
              start(async () => {
                await clearAnalystHistory();
                setMsgs([]);
              })
            }
          >
            <Trash2 className="size-3.5" /> Clear
          </button>
        )}
      </div>
      <div className="thin-scroll flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {msgs.length === 0 && (
          <div className="mx-auto max-w-xl py-8 text-center">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-ai-soft text-ai">
              <Sparkles className="size-5" />
            </div>
            <p className="text-[15px] font-semibold">Ask about your money</p>
            <p className="mt-1 text-[13px] text-fg-2">Answers use only your stored records. Estimates are labelled, and the analyst can&apos;t change your data.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-full border border-line px-3 py-1.5 text-[12.5px] text-fg-2 hover:border-ai/50 hover:bg-ai-soft hover:text-fg">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={clsx("flex gap-3", m.role === "user" && "flex-row-reverse")}>
            <span className={clsx("flex size-7 shrink-0 items-center justify-center rounded-full", m.role === "user" ? "bg-fg text-bg" : "bg-ai-soft text-ai")}>
              {m.role === "user" ? <User className="size-3.5" /> : <Sparkles className="size-3.5" />}
            </span>
            <div className={clsx("max-w-[85%] rounded-xl px-4 py-3", m.role === "user" ? "bg-surface-3 text-[13.5px]" : "border border-line bg-surface")}>
              {m.role === "assistant" ? (
                <>
                  <MiniMarkdown text={m.content} />
                  <div className="mt-2">
                    <Badge tone={m.engine === "claude" ? "ai" : "neutral"}>{m.engine === "claude" ? "Claude · from your data" : "Built-in · from your data"}</Badge>
                  </div>
                </>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex items-center gap-2 text-[13px] text-muted">
            <Loader2 className="size-4 animate-spin" /> Analysing your records…
          </div>
        )}
        <div ref={end} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(q);
            }
          }}
          rows={1}
          maxLength={1000}
          placeholder="Ask about spending, savings, investments, debts, goals…"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[13.5px] outline-none focus:border-ai"
          aria-label="Question"
        />
        <button className={btnClass("ai", "icon", "size-10")} disabled={pending || !q.trim()} aria-label="Ask">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </button>
      </form>
    </div>
  );
}
