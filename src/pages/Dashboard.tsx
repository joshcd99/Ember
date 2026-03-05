import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { DebtFreeCountdown } from "@/components/DebtFreeCountdown"
import { CashFlowRegister } from "@/components/CashFlowRegister"
import {
  TrendingDown,
  Flame,
  CalendarClock,
  ArrowRight,
  DollarSign,
  Receipt,
  SlidersHorizontal,
  CreditCard,
  AlertTriangle,
} from "lucide-react"
import { Link } from "react-router-dom"
import { useAppData } from "@/contexts/DataContext"
import {
  getTotalDebt,
  getTotalStartingDebt,
  getMonthlyIncome,
  getMonthlyBills,
  getMonthlyMinimums,
  getCheckinStreak,
} from "@/lib/mock-data"
import { calculatePayoff, getHighestImpactAction, type Strategy } from "@/lib/payoff-engine"
import { formatCurrency, formatDate, formatCountdown } from "@/lib/utils"
import { DEBT_TYPE_META, DEBT_TYPE_CHART_COLORS } from "@/lib/debt-types"
import {
  hasActivePromo,
  willMakeDeadline,
  interestAtRisk,
  extraNeededToMakeDeadline,
} from "@/lib/promo-engine"
import type { DebtType } from "@/types/database"
import { differenceInDays } from "date-fns"
import { addDays } from "date-fns"
import { getOccurrencesInRange } from "@/lib/recurrence"

export function Dashboard() {
  const { debts, bills, incomeSources, checkins, householdSettings, loading } = useAppData()

  if (loading) {
    return <div className="animate-pulse text-muted-foreground py-12 text-center">Loading your data...</div>
  }

  const hasDebts = debts.length > 0
  const hasIncome = incomeSources.length > 0

  const totalDebt = getTotalDebt(debts)
  const startingDebt = getTotalStartingDebt(debts)
  const paidOff = startingDebt - totalDebt
  const progressPercent = startingDebt > 0 ? (paidOff / startingDebt) * 100 : 0

  const monthlyIncome = getMonthlyIncome(incomeSources)
  const monthlyBillsTotal = getMonthlyBills(bills)
  const monthlyMinimums = getMonthlyMinimums(debts)
  const cashFlow = monthlyIncome - monthlyBillsTotal - monthlyMinimums

  const savedStrategy = (householdSettings?.preferred_strategy ?? "minimums") as Strategy
  const savedExtraType = householdSettings?.extra_payment_type ?? "fixed"
  const savedExtraAmount = householdSettings?.extra_payment_amount ?? 0
  const extraMonthly = savedExtraType === "percent_of_free_cash"
    ? Math.max(0, Math.floor(cashFlow * (savedExtraAmount / 100)))
    : savedExtraAmount

  const payoffResult = hasDebts
    ? calculatePayoff(debts, savedStrategy, extraMonthly, null, householdSettings?.custom_debt_order)
    : null
  const debtFreeDate = payoffResult?.payoffDate

  const streak = getCheckinStreak(checkins)
  const impactAction = getHighestImpactAction(debts)

  // Upcoming bills (next 7 days) — with recurrence support
  const today = new Date()
  const weekFromNow = addDays(today, 7)
  const upcomingBillOccurrences = bills.flatMap(b =>
    getOccurrencesInRange(b, today, weekFromNow).map(date => ({ bill: b, dueDate: date }))
  ).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())

  // Full empty state — brand new user
  if (!hasDebts && !hasIncome && bills.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl text-foreground">Welcome to Ember</h1>
          <p className="text-muted-foreground mt-1">Let's see what you're working with.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-dashed border-2">
            <CardContent className="py-8 text-center space-y-3">
              <CreditCard className="h-8 w-8 text-primary mx-auto" />
              <h3 className="font-semibold">Add your debts</h3>
              <p className="text-sm text-muted-foreground">
                Credit cards, loans, anything with a balance. This is where the fire starts.
              </p>
              <Link to="/debts">
                <Button size="sm">Get started</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-dashed border-2">
            <CardContent className="py-8 text-center space-y-3">
              <DollarSign className="h-8 w-8 text-success mx-auto" />
              <h3 className="font-semibold">Add your income</h3>
              <p className="text-sm text-muted-foreground">
                Paychecks, freelance, side gigs. The fuel for your fire.
              </p>
              <Link to="/income">
                <Button size="sm" variant="outline">Add income</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-dashed border-2">
            <CardContent className="py-8 text-center space-y-3">
              <Receipt className="h-8 w-8 text-muted-foreground mx-auto" />
              <h3 className="font-semibold">Add your expenses</h3>
              <p className="text-sm text-muted-foreground">
                Rent, utilities, subscriptions. We'll make sure these don't smother the flame.
              </p>
              <Link to="/bills">
                <Button size="sm" variant="outline">Add expenses</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">The ember's still lit.</p>
      </div>

      {/* Hero action card */}
      {impactAction && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-4">
            <div className="flex-shrink-0 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <TrendingDown className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">Your highest-impact move today</p>
              <p className="text-lg font-semibold text-foreground">
                Pay {formatCurrency(impactAction.extraAmount)} extra to {impactAction.debtName}
              </p>
              <p className="text-sm text-muted-foreground">
                Saves ~{formatCurrency(impactAction.interestSaved)} in interest over time
              </p>
            </div>
            <Link to="/debts">
              <Button variant="default" size="sm">
                View debts <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Promo deadline warning */}
      {(() => {
        const atRiskPromos = debts
          .filter(d => hasActivePromo(d) && !willMakeDeadline(d) && d.promo_type === "deferred_interest")
          .sort((a, b) => (a.promo_end_date ?? "").localeCompare(b.promo_end_date ?? ""))

        if (atRiskPromos.length === 0) return null

        if (atRiskPromos.length === 1) {
          const d = atRiskPromos[0]
          const risk = interestAtRisk(d)
          const extraNeeded = extraNeededToMakeDeadline(d)
          const endLabel = d.promo_end_date
            ? new Date(d.promo_end_date).toLocaleDateString("en-US", { month: "long", year: "numeric" })
            : ""
          return (
            <Card className="border-warning/30 bg-warning/5">
              <CardContent className="flex items-center gap-4">
                <div className="flex-shrink-0 h-12 w-12 rounded-full bg-warning/10 flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6 text-warning" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-warning">Promo deadline at risk</p>
                  <p className="text-sm text-foreground">
                    {d.name} — {formatCurrency(risk)} in deferred interest dumps on {endLabel}
                  </p>
                  {extraNeeded > 0 && (
                    <p className="text-sm text-muted-foreground">
                      +{formatCurrency(extraNeeded)}/mo would clear it in time.
                    </p>
                  )}
                </div>
                <Link to="/debts">
                  <Button variant="outline" size="sm">
                    View debt <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )
        }

        // Multiple at-risk promos
        return (
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="flex items-center gap-4">
              <div className="flex-shrink-0 h-12 w-12 rounded-full bg-warning/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-warning" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-warning">Promo deadlines at risk</p>
                <p className="text-sm text-foreground">
                  {atRiskPromos.length} promotional balances at risk
                </p>
              </div>
              <Link to="/debts">
                <Button variant="outline" size="sm">
                  View debts <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )
      })()}

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total debt */}
        <Card>
          <CardHeader>
            <CardDescription>Total Debt Remaining</CardDescription>
            <CardTitle className="text-2xl">
              {hasDebts ? formatCurrency(totalDebt) : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasDebts ? (
              <>
                <Progress value={progressPercent} className="mb-2" />
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(paidOff)} paid off ({progressPercent.toFixed(0)}% of {formatCurrency(startingDebt)})
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                <Link to="/debts" className="text-primary hover:underline">Add your first debt</Link> to track progress
              </p>
            )}
          </CardContent>
        </Card>

        {/* Debt-free countdown */}
        <DebtFreeCountdown
          debtFreeDate={debtFreeDate ?? null}
          months={payoffResult?.months ?? null}
          totalDebt={totalDebt}
          startingDebt={startingDebt}
          progressPercent={progressPercent}
          paidOff={paidOff}
          strategyLabel={
            savedStrategy === "minimums" && savedExtraAmount === 0
              ? "Minimums only"
              : `${savedStrategy.charAt(0).toUpperCase() + savedStrategy.slice(1)}${extraMonthly > 0 ? ` + ${formatCurrency(extraMonthly)}/mo extra` : ""}`
          }
        />

        {/* Monthly cash flow */}
        <Card>
          <CardHeader>
            <CardDescription>Monthly Cash Flow</CardDescription>
            <CardTitle className={`text-2xl ${hasIncome ? (cashFlow >= 0 ? "text-success" : "text-destructive") : ""}`}>
              {hasIncome ? `${cashFlow >= 0 ? "+" : ""}${formatCurrency(cashFlow)}` : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasIncome ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Income</span>
                  <span>{formatCurrency(monthlyIncome)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Expenses</span>
                  <span>-{formatCurrency(monthlyBillsTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Minimums</span>
                  <span>-{formatCurrency(monthlyMinimums)}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                <Link to="/income" className="text-primary hover:underline">Add income sources</Link> to calculate
              </p>
            )}
          </CardContent>
        </Card>

        {/* Check-in streak */}
        <Card>
          <CardHeader>
            <CardDescription>Check-in Streak</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Flame className="h-6 w-6 text-warning" />
              {streak} days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link to="/checkin">
              <Button variant="outline" size="sm" className="w-full">
                Log today <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Debt category tiles */}
      {hasDebts && (() => {
        const typeGroups = new Map<DebtType, { balance: number; starting: number; count: number }>()
        for (const d of debts) {
          const t = d.debt_type ?? "other"
          const g = typeGroups.get(t) ?? { balance: 0, starting: 0, count: 0 }
          g.balance += d.current_balance
          g.starting += d.starting_balance
          g.count++
          typeGroups.set(t, g)
        }
        const catPayoff = payoffResult?.categoryPayoffMonths ?? {}
        const tiles = Array.from(typeGroups.entries()).filter(([, g]) => g.count > 0)
        if (tiles.length <= 1) return null
        return (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-sm font-medium text-muted-foreground whitespace-nowrap">By debt type</h2>
              <div className="flex-1 border-t border-border" />
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
              {tiles.map(([type, group]) => {
                const meta = DEBT_TYPE_META[type]
                const chartColor = DEBT_TYPE_CHART_COLORS[type]
                const paidOff = group.starting - group.balance
                const pct = group.starting > 0 ? (paidOff / group.starting) * 100 : 0
                const isDone = group.balance <= 0.01 && group.starting > 0
                const payoffMonth = catPayoff[type]
                const payoffDate = payoffMonth != null ? new Date() : null
                if (payoffDate) payoffDate.setMonth(payoffDate.getMonth() + payoffMonth!)
                const daysLeft = payoffDate ? Math.max(0, differenceInDays(payoffDate, new Date())) : null

                return (
                  <Card key={type} className="overflow-hidden">
                    <div className="h-1" style={{ backgroundColor: chartColor }} />
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: chartColor }} />
                        <span className="text-xs font-medium text-muted-foreground">{meta.pluralLabel}</span>
                      </div>
                      {isDone ? (
                        <>
                          <p className="font-display text-xl text-success">🎉 Done</p>
                          <Progress value={100} className="h-1.5" />
                        </>
                      ) : (
                        <>
                          <p className="font-display text-xl">{formatCurrency(group.balance)}</p>
                          <Progress value={pct} className="h-1.5" />
                          <p className="text-[10px] text-muted-foreground">
                            {formatCurrency(paidOff)} paid · {pct.toFixed(0)}%
                          </p>
                          {payoffDate && (
                            <div className="space-y-0.5">
                              <p className="text-[10px] text-muted-foreground">{formatDate(payoffDate)}</p>
                              {daysLeft != null && formatCountdown(daysLeft) && (
                                <p className="text-xs font-semibold" style={{ color: chartColor }}>
                                  {formatCountdown(daysLeft)}
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Cash flow register */}
      <CashFlowRegister />

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming bills */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-muted-foreground" />
              Upcoming Expenses (7 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bills.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                <Link to="/bills" className="text-primary hover:underline">Add your expenses</Link> to see what's coming up.
              </p>
            ) : upcomingBillOccurrences.length === 0 ? (
              <p className="text-sm text-muted-foreground">All clear for the next 7 days.</p>
            ) : (
              <div className="space-y-3">
                {upcomingBillOccurrences.map((occ, i) => (
                  <div key={`${occ.bill.id}-${i}`} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{occ.bill.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Due {formatDate(occ.dueDate.toISOString().split("T")[0])}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-medium">{formatCurrency(occ.bill.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link to="/checkin">
              <Button variant="outline" className="w-full justify-start gap-3">
                <span className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">+</span>
                Feed the flame
              </Button>
            </Link>
            <Link to="/scenarios">
              <Button variant="outline" className="w-full justify-start gap-3">
                <span className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                </span>
                See what a little more fuel does
              </Button>
            </Link>
            <Link to="/debts">
              <Button variant="outline" className="w-full justify-start gap-3">
                <span className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <TrendingDown className="h-4 w-4 text-primary" />
                </span>
                Compare burn strategies
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
