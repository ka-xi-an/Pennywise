# Architecture

## Stack

Next.js 16 (App Router, React Server Components, Server Actions) · React 19 · TypeScript (strict) · Tailwind CSS v4 · Recharts 3 · Prisma 6 (SQLite dev / PostgreSQL prod) · zod 4 · decimal.js · Vitest · optional `@anthropic-ai/sdk`.

## Layers

```
src/
  lib/finance/      Pure financial engine — no I/O, fully unit-tested
    money.ts        minor-unit parsing/rounding, decimal quantity × price
    dates.ts        timezone-safe ISO dates, ranges, financial years
    ledger.ts       balance effects, income/expense classification, cash-flow statement
    investments.ts  average-cost positions, XIRR, CAGR, allocation, rebalancing
    loans.ts        EMI, amortization, prepayment scenarios
    budget.ts       period windows, rollover, thresholds, projections
    networth.ts     assets − liabilities without double counting
    goals.ts / forecast.ts / health.ts / tax.ts / insights.ts / recurring.ts / fx.ts / csv.ts
  lib/server/       Server-only: database, auth, data loading, services
    db.ts           Prisma client + BigInt ⇄ number helpers
    auth.ts         scrypt hashing, sessions, requireUser(), rate limiting
    data.ts         getCtx(userId): loads everything once per request → engine records
    services/       write paths: transactions, investments, recurring, importer, demo, backup, snapshots, notifications
    reports.ts      statement builder shared by screens and CSV export
    ai/             read-only analysis tools, built-in analyst, Claude tool loop
  lib/actions/      ActionResult type, zod parsing, error mapping, revalidation
  components/       UI kit (ui/), charts, forms, shell
  app/(auth)        login / signup
  app/onboarding    setup wizard
  app/(app)/…       one folder per module; actions.ts holds that module's Server Actions
  app/api/…         search, exports, attachment downloads
```

### Data flow

1. Every protected page calls `pageCtx()` → `requireUser()` → `getCtx(userId)`.
2. `getCtx` is wrapped in React `cache`, so one request loads the user's data once. First it idempotently auto-posts due recurring items, then it maps rows to engine records and derives balances, the portfolio, net worth and goals.
3. Pages call pure engine functions on that context. Every module therefore sees the same numbers.
4. Mutations are Server Actions. They validate with zod, run integrity checks in `lib/server/services`, write inside a DB transaction, record an audit entry and call `revalidatePath("/", "layout")`.

### Unified data model

- **Money** is BigInt integer minor units in the database and safe-integer numbers in the engine. Sums are exact.
- **Quantities and prices** are decimal strings computed with decimal.js.
- **Dates** are ISO `YYYY-MM-DD` strings, which avoids timezone drift. "Today" comes from the user's timezone.
- **Account balances are never stored.** Each is the opening balance plus the effects of every transaction, so balances cannot disagree with the ledger and need no separate synchronisation.
- **Investment trades are linked to ledger rows.** A buy writes an `InvestmentTransaction` (units, cost basis) and, when cash moves, a linked `INVESTMENT_BUY` ledger row, in one DB transaction. Deleting either removes both.
- **Loans are loan accounts.** The outstanding principal is the negative balance of a `LOAN` account, so repayments, net worth and debt reports share one figure.
- **Recurring items** are rules plus `RecurringOccurrence` rows, unique on (rule, due date). That makes posting and paying idempotent.
- **Net-worth history** is a month-end `NetWorthSnapshot` (`RECORDED` live, or `BACKFILLED` estimates from the ledger).
- **Demo data** is flagged `isDemo` on every row and is removable in one action.

### Market data

Valuations come only from `currentPrice`/`currentValue` with `priceDate` and `priceSource` (`MANUAL`, `DEMO` or a provider name). To add a provider, implement a job that writes `PriceUpdate` rows and updates holdings with `priceSource = "<provider>"`. The UI already labels the source and date everywhere.

### AI analyst

`lib/server/ai/tools.ts` exposes read-only functions (overview, period summary, period comparison, transaction search, budgets, goals, investments, debts, cash forecast, health/insights).

- **Built-in engine:** maps intents to those functions. Nothing leaves the server.
- **Claude engine:** opt-in per user, and only when `ANTHROPIC_API_KEY` is set. It runs a bounded Messages API tool loop (max 8 turns) with the same functions, server-side fallbacks enabled, and a system prompt that forbids inventing figures and requires labelled estimates. No tool can write data.

### Security model

| Concern | Implementation |
|---|---|
| Authentication | scrypt (N=2¹⁵, r=8, p=1), constant-time compare, 5-failure lockout for 15 min, per-IP limiter |
| Sessions | 256-bit random token; SHA-256 stored; httpOnly + SameSite=Lax (+Secure in prod); revocable per device |
| Authorization | `requireUser()` in every page, action and route; every query filters by `userId`; ownership checked before referencing related rows |
| CSRF | Next.js Server Actions verify Origin; mutation routes are actions only |
| Files | type sniffed by magic bytes; AES-256-GCM with per-file IV; served only to the owner with a sandboxed CSP |
| Data minimisation | last 4 account digits only; no credentials for banks/UPI/cards |
| Audit | `AuditLog` for auth events and financial record changes |
| Backups | optional scrypt + AES-256-GCM passphrase envelope; restore remaps IDs inside one transaction |

## Testing

- `src/lib/finance/engine.test.ts` has 55 unit tests: money/rounding, dates and timezones, ledger integrity (transfers, investments, refunds, loan split), the cash-flow reconciliation identity, XIRR against Excel reference values, EMI and amortization, budgets and rollover, recurring dates, goals, net worth, health, simulation conservation, tax slabs/rebate/capital gains, CSV parsing and injection guarding, and anomaly/recurring detection.
- `tests/integration.test.ts` exercises real services against an isolated database: integrity rules, cross-currency transfers, refund caps, loan auto-split, linked investment deletion, cross-user isolation, recurring idempotency, CSV import, and demo data consistency.
- `tests/workflows.test.ts` checks that statements reconcile with each other and with live net worth, the tax-rule safety behaviour, that the analyst answers from data, and the backup → restore round-trip.
