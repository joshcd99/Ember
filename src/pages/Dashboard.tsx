import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import {
  TrendingDown,
  Flame,
  CalendarClock,
  ArrowRight,
  DollarSign,
  Receipt,
  SlidersHorizontal,
  CreditCard,
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
import { calculatePayoff, getHighestImpactAction } from "@/lib/payoff-engine"
import { formatCurrency, formatDate } from "@/lib/utils"
import { addDays, isAfter, isBefore } from "date-fns"

export function Dashboard() {
  const { debts, bills, incomeSources, checkins, loading } = useAppData()

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

  const avalanche = hasDebts
    ? calculatePayoff(debts, "avalanche", cashFlow > 0 ? Math.floor(cashFlow * 0.5) : 0)
    : null
  const debtFreeDate = avalanche?.payoffDate

  const streak = getCheckinStreak(checkins)
  const impactAction = getHighestImpactAction(debts)

  // Upcoming bills (next 7 days)
  const today = new Date()
  const weekFromNow = addDays(today, 7)
  const upcomingBills = bills.filter(b => {
    const due = new Date(b.next_due_date)
    return (isAfter(due, today) || due.toDateString() === today.toDateString()) && isBefore(due, weekFromNow)
  })

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
              <h3 className="font-semibold">Add your bills</h3>
              <p className="text-sm text-muted-foreground">
                Rent, utilities, subscriptions. We'll make sure these don't smother the flame.
              </p>
              <Link to="/bills">
                <Button size="sm" variant="outline">Add bills</Button>
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

        {/* Debt-free date */}
        <Card>
          <CardHeader>
            <CardDescription>Debt-Free Date</CardDescription>
            <CardTitle className="text-2xl">
              {debtFreeDate ? formatDate(debtFreeDate) : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {avalanche ? `${avalanche.months} months at current pace` : "Add debts and income to see your timeline"}
            </p>
          </CardContent>
        </Card>

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
                  <span>Bills</span>
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

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming bills */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-muted-foreground" />
              Upcoming Bills (7 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bills.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                <Link to="/bills" className="text-primary hover:underline">Add your bills</Link> to see what's coming up.
              </p>
            ) : upcomingBills.length === 0 ? (
              <p className="text-sm text-muted-foreground">All clear for the next 7 days.</p>
            ) : (
              <div className="space-y-3">
                {upcomingBills.map(bill => (
                  <div key={bill.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{bill.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Due {formatDate(bill.next_due_date)}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-medium">{formatCurrency(bill.amount)}</span>
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
