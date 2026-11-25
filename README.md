# Ledgerline — personal finance & wealth management

One ledger for accounts, income, spending, budgets, investments, loans, net worth, goals, tax records and planning — with an analyst that answers questions from your own data. India-first (₹, lakh/crore formatting, April–March FY, SIPs, PPF/EPF/NPS, TDS, capital gains), configurable for other currencies and locales.

## Quick start (local)

Requirements: Node.js ≥ 20.9 (tested on 24 LTS). No database server needed for development (SQLite).

```bash
npm install
npm run setup        # creates .env with a fresh FILE_ENCRYPTION_KEY and the SQLite database
npm run dev          # http://localhost:3000
```

Sign up, follow onboarding (or click **Explore with demo data**), and you're in.

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | 78 unit + integration tests (uses an isolated `prisma/test.db`) |
| `npm run typecheck` | TypeScript, strict mode |
| `npm run db:push` | Apply `prisma/schema.prisma` to the database |
| `npm run db:studio` | Browse the database |

> The npm scripts call tools through `node node_modules/...` because `.cmd` shims break when the project path contains `&` (as in `Wealth & Ventures`).

## Configuration (`.env`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `file:./prisma/dev.db` (SQLite, path relative to the project root — Prisma 7 + libSQL adapter) or a PostgreSQL URL — see below |
| `FILE_ENCRYPTION_KEY` | yes | 64 hex chars; encrypts uploaded receipts/tax documents (AES-256-GCM). **Back it up** — files can't be decrypted without it |
| `STORAGE_DIR` | no | Encrypted upload directory (default `./storage`, outside the web root) |
| `ANTHROPIC_API_KEY` | no | Enables the optional Claude analyst. Server-side only; never sent to the browser |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-opus-5-5` |
| `MARKET_DATA_PROVIDER` | no | Placeholder for a price provider. None ships enabled — prices are entered manually and labelled with their date |

## Production deployment

1. **Database → PostgreSQL.** In `prisma/schema.prisma` change `provider = "sqlite"` to `provider = "postgresql"`, set `DATABASE_URL="postgresql://…?sslmode=require"`, then `npm run db:push` (or adopt `prisma migrate` for versioned migrations). The schema only uses portable types (BigInt money, string dates/enums), so no model changes are needed. Use a managed Postgres with encryption at rest and automated backups.
2. Set `FILE_ENCRYPTION_KEY` from a secrets manager; mount `STORAGE_DIR` on persistent, private storage (or replace `src/lib/server/storage.ts` with an object-store adapter).
3. `npm run build && npm start` behind HTTPS (any Node host: a VM, Docker, Render, Fly, Railway…). In production, cookies are `Secure` and HSTS is sent.
4. The login rate limiter is in-process; for multiple instances, back `rateLimit()` in `src/lib/server/auth.ts` with Redis.

## What's inside

- **Overview** — dashboard with 10 KPIs (period comparisons, tooltips, sparklines), eight charts, insights, bills, budgets, goals and balances; customizable widget order/visibility; financial health score with methodology and history; cash flow; activity/audit trail; notifications.
- **Transactions** — 11 types (income, expense, transfer, investment buy/sell, dividend, interest, loan disbursement/repayment, refund, adjustment); search, filters, sorting, pagination, bulk categorise/tag/payment method/delete, duplicate, refunds linked to the original, receipts, templates, keyboard quick-add (`N`), global search (`Ctrl K`), CSV import with mapping/preview/duplicate review/undo, CSV export.
- **Accounts** — savings, current, cash, wallet, credit card (limit & utilisation), brokerage, loan, foreign currency; balance history; transfers; manual adjustments; statement reconciliation. Only the last 4 digits of any number are stored.
- **Budgeting** — weekly/monthly/annual/custom periods; category, zero-based, 50/30/20 and envelope methods; rollover; daily allowance; projected spend; 50/75/90/100% alerts; hard limits; performance history; suggestions from history.
- **Investments** — stocks, MFs, ETFs, index funds, bonds, FDs, gold/silver, PPF/EPF/NPS, real-estate funds; buy/SIP/sell/dividend/interest/bonus/split/merger/fees/TDS; average cost, realised/unrealised P&L, XIRR, CAGR, allocation, rebalancing to targets, benchmark comparison (user-entered levels), maturity tracker.
- **Wealth** — net worth balance sheet, assets, liabilities, loans with amortization schedules and a prepayment simulator, debt management (DTI, utilisation, avalanche/snowball), month-end history with optional backfill.
- **Planning** — goals (manual, linked accounts or net worth), emergency fund, retirement planner, projections, scenario simulator.
- **Payments** — bills, subscriptions, EMIs; mark paid/skip/undo; overdue alerts; annual subscription cost; calendar.
- **Analytics & reports** — income/expense/savings/cash-flow analytics; 11 statements (income statement, balance sheet, cash-flow, monthly/annual expenses, budget, net worth, investments, debt, savings, tax) with CSV/Excel and print-to-PDF; custom reports.
- **Tax Center** — FY summary under both regimes, taxable income, deductions, capital gains (STCG/LTCG), TDS, encrypted documents, editable per-year rules (FY 2025-26 template included, never carried forward automatically). Estimates only.
- **AI Financial Analyst** — built-in engine (private, deterministic) or opt-in Claude with read-only tools; spending intelligence (anomalies, recurring-charge detection, recommendations).
- **Settings** — profile, currency/locale/FY/date format/timezone, exchange rates, notifications, password, sessions, account deletion, backup (optionally passphrase-encrypted), restore, demo mode, erase data.

## Security & privacy

scrypt password hashing · hashed session tokens in httpOnly/SameSite cookies · account lockout and IP rate limiting · every query scoped by `userId` (integration-tested) · audit log · AES-256-GCM file encryption with content-type sniffing · CSV formula-injection protection · security headers (CSP on file downloads, X-Frame-Options, nosniff, HSTS in production) · no bank passwords, UPI or card PINs are ever requested or stored · AI is read-only, and Claude mode is opt-in per user.

## Honest limitations

- No bank aggregation or live market data: transactions arrive by manual entry, recurring auto-post or CSV import; prices are manual (or demo, clearly labelled).
- Excel import = CSV saved from Excel (`.xlsx` parsing isn't built in). PDFs come from the browser's print dialog.
- Tax figures are planning estimates; surcharge, marginal relief, loss set-off and some special cases aren't modelled (listed in-app).
- Statements and analytics are in the base currency; foreign-currency items need user-entered exchange rates and are excluded (with a warning) when one is missing.
- SQLite is for development/single-user use; use PostgreSQL in production.

## License

[MIT](LICENSE) © 2026 ka-xi-an. Tax and financial figures are planning estimates, not professional advice.

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/CALCULATIONS.md](docs/CALCULATIONS.md)
