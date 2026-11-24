import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/auth";
import { Logo } from "@/components/logo";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getSessionUser()) redirect("/dashboard");
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-navy p-10 text-white lg:flex">
        <Logo inverted />
        <div className="max-w-md">
          <p className="text-[28px] font-semibold leading-tight tracking-tight">
            Every rupee, account and investment — reconciled into one clear picture.
          </p>
          <ul className="mt-6 space-y-2.5 text-[13.5px] text-white/70">
            <li>• Double-entry-safe ledger: transfers and investments never inflate spending</li>
            <li>• Net worth, budgets, goals and portfolio XIRR from the same records</li>
            <li>• India-first: ₹ lakh/crore formatting, April–March FY, SIPs, PPF, EPF, TDS</li>
            <li>• Private by design — encrypted documents, no bank passwords ever stored</li>
          </ul>
        </div>
        <p className="text-[12px] text-white/40">Estimates and projections are clearly labelled. Not financial or tax advice.</p>
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-[#2563eb]/20 blur-3xl" />
      </div>
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
