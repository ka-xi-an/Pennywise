# Financial calculations

All formulas live in `src/lib/finance/` and are covered by `engine.test.ts`.

## Rounding policy

- Money is integer minor units (paise). Parsing from user input rounds **half away from zero** to the minor unit.
- A computed amount (EMI interest, quantity × price, FX conversion) is rounded once, when it is posted. Aggregates are exact integer sums of posted values.
- EMIs are rounded **up** to the minor unit. A residual of ≤ 2% of the EMI (minimum ₹1) is folded into the final instalment, as lenders do.
- Percentages are display-only floats.

## Ledger semantics

| Type | Balance effect | Income | Expense |
|---|---|---|---|
| INCOME / DIVIDEND / INTEREST | +amount → account | amount | — |
| EXPENSE | −amount | — | amount |
| REFUND | +amount | — | −amount (same category; capped at the original) |
| TRANSFER | −amount from, +(toAmount ?? amount) to | — | — |
| INVESTMENT_BUY / SELL | −/+ amount (cash leg) | — | — |
| LOAN_DISBURSEMENT | −amount loan account, + bank | — | — |
| LOAN_REPAYMENT | −amount bank, +principal loan account | — | interest |
| ADJUSTMENT | ±amount (signed) | — | — |

- **Account balance** = opening balance (from its opening date) + Σ effects of transactions on or before the date.
- **Savings** = income − expenses. **Savings rate** = savings ÷ income × 100 (undefined when income is 0).
- **Expense ratio** = expenses ÷ income × 100.
- **Cash flow** covers every non-loan account (credit cards count as negative cash):
  - operating = income − expenses
  - investing = sales − purchases
  - financing = loans received − principal repaid (including transfers to a loan account)
  - net change = operating + investing + financing + adjustments + opening balances of new accounts
  - The statement asserts opening + net change = closing.

## Net worth

**Net worth = total assets − total liabilities.**

- **Account balances:** positive → asset; negative → liability (card dues, loan principal, overdraft).
- **Investment holdings:** valued at market value from the stored price. If no price is stored, the holding is valued at cost and flagged.
- **Manual assets and liabilities** are included as recorded.
- **No double counting:** holdings are separate from their brokerage account's cash, and investment types cannot be entered as manual assets.
- **Debt-to-asset** = liabilities ÷ assets × 100.
- **Foreign currency:** converted with the latest user-entered rate on or before the date. If no rate exists, the item is excluded and a warning is shown.

## Investments (average cost)

| Event | Effect |
|---|---|
| Buy / SIP | qty += q; cost += amount + fees |
| Sell | cost sold = cost × q ÷ qty; realized += (amount − fees) − cost sold. Overselling is rejected |
| Bonus | qty += units (or qty × ratio), cost unchanged |
| Split / merger | qty × ratio, cost unchanged |
| Dividend / interest | tracked as payouts (cash returned) |
| Fees / TDS | reduce total return |

**Value-mode holdings** (FD/PPF/EPF/NPS): contributions add to cost. A withdrawal returns capital first; a full withdrawal books the remaining gain.

- **Unrealized** = market value − cost basis of units held.
- **Total return** = realized + unrealized + payouts − fees − TDS.
- **Absolute return** = total return ÷ total ever invested.
- **XIRR:** solves Σ CFᵢ/(1+r)^(tᵢ/365) = 0 by Newton–Raphson with a bisection fallback. Purchases are negative, proceeds and payouts positive, and current value is the terminal flow. It returns nothing when the flows have no sign change.
- **CAGR** = (value ÷ cost)^(1/years) − 1, from the first purchase. It is shown only when priced and ≥ 1 month old. It assumes a lump sum; prefer XIRR.
- **Rebalancing:** target = total × target% and delta = target − current. Deltas sum to 0 when targets total 100%.
- **Benchmark comparison:** benchmark CAGR from two user-entered index levels against portfolio XIRR. This is shown only when the whole portfolio history lies inside the window.

## Loans

- **Monthly rate:** r = annual% ÷ 12 ÷ 100.
- **EMI** = P·r·(1+r)ⁿ ÷ ((1+r)ⁿ − 1). When r = 0, EMI = P ÷ n.
- **Each month:** interest = round(balance × r), principal = EMI − interest.
- **Negative amortization:** flagged when the EMI ≤ the monthly interest.
- **Auto-split of a recorded payment:** interest is computed on the outstanding principal just before the payment date. Any excess is treated as prepayment of principal.
- **Remaining tenure** = ⌈−ln(1 − B·r/EMI) ÷ ln(1+r)⌉.
- **Prepayment scenarios:**
  - *Reduce tenure:* the same EMI on the reduced balance.
  - *Reduce EMI:* the EMI is recomputed over the original remaining months.
  - Optional extra monthly payments are supported.
- **Debt-to-income** = Σ active EMIs ÷ average monthly income.
- **Credit utilisation** = card dues ÷ card limits.

## Budgets

- **Actual** = net expense (expenses − refunds + loan interest) of the category and all its subcategories within the period window.
- **Rollover (envelope):** available = planned + Σ (planned − actual) of the previous periods since the budget start.
- **Utilization** = actual ÷ available.
- **Thresholds:** 50%, 75%, 90% and 100%. Hard limits escalate the 100% alert to critical.
- **Daily allowance** = remaining ÷ days left.
- **Projected** = actual ÷ days elapsed × days in the period.
- **Zero-based:** unassigned = expected income − planned.
- **50/30/20:** needs, wants and savings groups measured against income.

## Goals

- **Required monthly contribution:**
  - with return i = annual%/12: C = (T − PV(1+i)ⁿ)·i ÷ ((1+i)ⁿ − 1)
  - with no return assumption: (T − PV) ÷ n
- **Projected completion:** month-by-month compounding of current + contribution.
- **On track:** projected date ≤ target date.

## Health score (0–100, not a credit score)

Each component is linear between a 0-anchor and a 100-anchor; the overall score is the weighted average. Components without data are excluded and the remaining weights are re-normalised; at least 40% of the weight must have data for a score.

| Component | Weight | 0 → 100 |
|---|---|---|
| Savings rate | 20% | 0% → 30% |
| Emergency months | 20% | 0 → 6 |
| Debt-to-income | 15% | 50% → 10% |
| Debt-to-asset | 10% | 80% → 10% |
| Expense volatility (coefficient of variation) | 10% | 60% → 10% |
| Positive months | 10% | 30% → 100% |
| Diversification | 10% | classes 1 → 4 and largest share 90% → 40%, averaged |
| Goals on track | 5% | 0% → 100% |

## Forecasts (always labelled as estimates)

- **Cash forecast** = liquid cash + trailing average monthly net cash flow × months.
- **Simulation, each month:**
  - income grows annually and expenses with inflation
  - loans amortize at their EMI
  - investments compound at (1+R)^(1/12) − 1
  - SIPs move cash to investments (capped at available cash)
  - one-off events (purchase, windfall, prepayment) apply in their month
- **Retirement:**
  - expenses at retirement = today × (1+inflation)^years
  - corpus needed = present value of a growing annuity over the retirement years at the post-retirement return
  - required SIP is found by bisection with the chosen annual step-up

## Tax (estimates; rules editable per FY and regime)

- **Slab tax:** progressive across the configured slabs.
- **Rebate (87A):** min(slab tax, max rebate) when total taxable income ≤ the configured limit.
- **Capital gains:**
  - STCG equity at its rate.
  - LTCG equity at its rate above the exemption.
  - Other LTCG at its rate.
  - Other STCG is taxed at slab rates.
  - Long term means held longer than the configured months (equity 12, other 24 in the template). Under average cost, the holding period is measured from the earliest units still held.
- **Cess** = configured % of tax.
- **Balance** = total tax − TDS.
- **Not modelled:** see the list in the Tax Center.

## Insights

- **Unusual transaction:** greater than 3× the category median **and** above mean + 3σ over the prior 180 days (with at least 4 data points), or a first payment to a merchant above the large-expense threshold.
- **Recurring candidate:** the same merchant with at least 3 charges in distinct months, amounts within ±15% of the median, and a median gap of 25–35 or 350–380 days.
