export interface NavItem {
  label: string;
  href: string;
  match?: string; // pathname prefix that marks the item active (defaults to href path)
}
export interface NavSection {
  id: string;
  label: string;
  icon: string;
  href: string;
  prefixes: string[];
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    id: "overview",
    label: "Overview",
    icon: "LayoutDashboard",
    href: "/dashboard",
    prefixes: ["/dashboard", "/health", "/cash-flow", "/activity", "/insights", "/notifications"],
    items: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Financial health", href: "/health" },
      { label: "Net worth summary", href: "/wealth", match: "/wealth$" },
      { label: "Cash flow", href: "/cash-flow" },
      { label: "Recent activity", href: "/activity" },
      { label: "Insights", href: "/insights" },
    ],
  },
  {
    id: "transactions",
    label: "Transactions",
    icon: "ArrowLeftRight",
    href: "/transactions",
    prefixes: ["/transactions", "/income", "/expenses", "/recurring", "/categories", "/import"],
    items: [
      { label: "All transactions", href: "/transactions" },
      { label: "Income", href: "/income" },
      { label: "Expenses", href: "/expenses" },
      { label: "Transfers", href: "/transactions?type=TRANSFER" },
      { label: "Recurring", href: "/recurring" },
      { label: "Categories", href: "/categories" },
      { label: "Imports", href: "/import" },
    ],
  },
  {
    id: "accounts",
    label: "Accounts",
    icon: "Landmark",
    href: "/accounts",
    prefixes: ["/accounts"],
    items: [
      { label: "All accounts", href: "/accounts" },
      { label: "Bank accounts", href: "/accounts?group=bank" },
      { label: "Cash & wallets", href: "/accounts?group=cash" },
      { label: "Credit cards", href: "/accounts?group=credit" },
      { label: "Investment accounts", href: "/accounts?group=investment" },
      { label: "Transfers", href: "/accounts/transfers" },
      { label: "Reconciliation", href: "/accounts/reconcile" },
    ],
  },
  {
    id: "budgets",
    label: "Budgeting",
    icon: "PiggyBank",
    href: "/budgets",
    prefixes: ["/budgets"],
    items: [
      { label: "Budgets", href: "/budgets" },
      { label: "Budget planning", href: "/budgets/new" },
      { label: "Performance", href: "/budgets/performance" },
      { label: "Spending limits", href: "/budgets/limits" },
    ],
  },
  {
    id: "investments",
    label: "Investments",
    icon: "TrendingUp",
    href: "/investments",
    prefixes: ["/investments"],
    items: [
      { label: "Portfolio", href: "/investments" },
      { label: "Holdings", href: "/investments/holdings" },
      { label: "Transactions", href: "/investments/transactions" },
      { label: "Analytics", href: "/investments/analytics" },
    ],
  },
  {
    id: "wealth",
    label: "Wealth",
    icon: "Gem",
    href: "/wealth",
    prefixes: ["/wealth"],
    items: [
      { label: "Net worth", href: "/wealth" },
      { label: "Assets", href: "/wealth/assets" },
      { label: "Liabilities", href: "/wealth/liabilities" },
      { label: "Loans", href: "/wealth/loans" },
      { label: "Debt management", href: "/wealth/debt" },
      { label: "Wealth history", href: "/wealth/history" },
    ],
  },
  {
    id: "planning",
    label: "Planning",
    icon: "Target",
    href: "/goals",
    prefixes: ["/goals", "/planning"],
    items: [
      { label: "Financial goals", href: "/goals" },
      { label: "Emergency fund", href: "/planning/emergency" },
      { label: "Retirement", href: "/planning/retirement" },
      { label: "Projections", href: "/planning/projections" },
      { label: "Scenario simulator", href: "/planning/simulator" },
    ],
  },
  {
    id: "payments",
    label: "Payments",
    icon: "CalendarClock",
    href: "/payments",
    prefixes: ["/payments"],
    items: [
      { label: "Bills & subscriptions", href: "/payments" },
      { label: "Payment calendar", href: "/payments/calendar" },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: "BarChart3",
    href: "/analytics",
    prefixes: ["/analytics", "/reports"],
    items: [
      { label: "Analytics", href: "/analytics" },
      { label: "Financial statements", href: "/reports" },
      { label: "Custom reports", href: "/reports/custom" },
    ],
  },
  {
    id: "tax",
    label: "Tax Center",
    icon: "Receipt",
    href: "/tax",
    prefixes: ["/tax"],
    items: [
      { label: "FY summary", href: "/tax" },
      { label: "Deductions", href: "/tax?tab=deductions" },
      { label: "Capital gains", href: "/tax?tab=gains" },
      { label: "TDS", href: "/tax?tab=tds" },
      { label: "Documents", href: "/tax?tab=documents" },
      { label: "Tax rules", href: "/tax?tab=rules" },
    ],
  },
  {
    id: "ai",
    label: "AI Analyst",
    icon: "Sparkles",
    href: "/analyst",
    prefixes: ["/analyst"],
    items: [
      { label: "Financial assistant", href: "/analyst" },
      { label: "Spending intelligence", href: "/analyst/intelligence" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: "Settings",
    href: "/settings",
    prefixes: ["/settings"],
    items: [
      { label: "Profile & preferences", href: "/settings" },
      { label: "Security", href: "/settings/security" },
      { label: "Data & backup", href: "/settings/data" },
    ],
  },
];

export const QUICK_PAGES = NAV.flatMap((s) => s.items.map((i) => ({ label: i.label, section: s.label, href: i.href })));
