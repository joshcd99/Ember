import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/EmptyState"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { useAppData } from "@/contexts/DataContext"
import { getMonthlyIncome, getMonthlyBills, getMonthlyMinimums } from "@/lib/mock-data"
import { calculatePayoff } from "@/lib/payoff-engine"
import { projectSavings } from "@/lib/savings-engine"
import { formatCurrency, formatDate } from "@/lib/utils"
import { TrendingDown, Calendar, DollarSign, SlidersHorizontal, PiggyBank, ShoppingBag } from "lucide-react"

const CHART_COLORS = {
  baseline: "#a8a29e",
  scenario: "#e8845a",
  savings: "#4ade80",
  savingsNoInterest: "#a8a29e",
  purchaseBaseline: "#4ade80",
  purchaseScenario: "#fbbf24",
}

export function Scenarios() {
  const { debts, incomeSources, bills, savingsAccount, loading } = useAppData()

  const monthlyIncome = getMonthlyIncome(incomeSources)
  const monthlyBillsTotal = getMonthlyBills(bills)
  const monthlyMinimums = getMonthlyMinimums(debts)
  const currentExtra = Math.max(0, Math.floor((monthlyIncome - monthlyBillsTotal - monthlyMinimums) * 0.5))
  const maxExtra = Math.max(0, Math.floor(monthlyIncome - monthlyBillsTotal - monthlyMinimums))

  const [extraMonthly, setExtraMonthly] = useState(currentExtra)
  const [lumpSumAmount, setLumpSumAmount] = useState(0)
  const [lumpSumDebtId, setLumpSumDebtId] = useState(debts[0]?.id ?? "")
  const [lumpSumMonth, setLumpSumMonth] = useState(1)
  const [incomeChange, setIncomeChange] = useState(0)
  const [purchaseAmount, setPurchaseAmount] = useState(0)
  const [purchaseMonth, setPurchaseMonth] = useState(6)

  const baseline = useMemo(
    () => calculatePayoff(debts, "avalanche", currentExtra),
    [debts, currentExtra]
  )

  const scenarioExtra = useMemo(
    () => Math.max(0, extraMonthly + Math.floor(incomeChange * 0.5)),
    [extraMonthly, incomeChange]
  )

  const scenario = useMemo(() => {
    const lumpSum = lumpSumAmount > 0
      ? { amount: lumpSumAmount, debtId: lumpSumDebtId, month: lumpSumMonth }
      : null
    return calculatePayoff(debts, "avalanche", scenarioExtra, lumpSum)
  }, [debts, scenarioExtra, lumpSumAmount, lumpSumDebtId, lumpSumMonth])

  const monthsSaved = baseline.months - scenario.months
  const interestSaved = baseline.totalInterest - scenario.totalInterest

  // Debt chart data
  const maxMonths = Math.max(baseline.months, scenario.months)
  const step = Math.max(1, Math.floor(maxMonths / 40))
  const chartData = []
  for (let m = 0; m <= maxMonths; m += step) {
    chartData.push({
      month: m,
      Baseline: baseline.timeline[m]?.totalBalance ?? 0,
      Scenario: scenario.timeline[m]?.totalBalance ?? 0,
    })
  }

  // Savings projections
  const hasSavings = savingsAccount && savingsAccount.current_balance > 0
  const savingsScenarioMonthlyNet = monthlyIncome + incomeChange - monthlyBillsTotal - monthlyMinimums - scenarioExtra

  const savingsScenario = useMemo(() => {
    if (!savingsAccount) return null
    return projectSavings({
      startingBalance: savingsAccount.current_balance,
      monthlyNet: savingsScenarioMonthlyNet,
      apy: savingsAccount.apy,
    })
  }, [savingsAccount, savingsScenarioMonthlyNet])

  const savingsPurchaseScenario = useMemo(() => {
    if (!savingsAccount || purchaseAmount <= 0) return null
    return projectSavings({
      startingBalance: savingsAccount.current_balance,
      monthlyNet: savingsScenarioMonthlyNet,
      apy: savingsAccount.apy,
      purchase: { amount: purchaseAmount, month: purchaseMonth },
    })
  }, [savingsAccount, savingsScenarioMonthlyNet, purchaseAmount, purchaseMonth])

  // Savings chart data
  const savingsChartData = useMemo(() => {
    if (!savingsScenario) return []
    const data = []
    for (let m = 0; m <= 36; m++) {
      data.push({
        month: m,
        Projected: savingsScenario.timeline[m]?.balance ?? 0,
        "Without Interest": savingsScenario.timeline[m]?.balanceNoInterest ?? 0,
      })
    }
    return data
  }, [savingsScenario])

  // Purchase chart data
  const purchaseChartData = useMemo(() => {
    if (!savingsScenario || !savingsPurchaseScenario) return []
    const data = []
    for (let m = 0; m <= 36; m++) {
      data.push({
        month: m,
        Baseline: savingsScenario.timeline[m]?.balance ?? 0,
        "After Purchase": savingsPurchaseScenario.timeline[m]?.balance ?? 0,
      })
    }
    return data
  }, [savingsScenario, savingsPurchaseScenario])

  // Purchase impact calculation
  const purchaseCost = useMemo(() => {
    if (!savingsScenario || !savingsPurchaseScenario) return { total: 0, at12: 0, at36: 0 }
    const baseAt36 = savingsScenario.timeline[36]?.balance ?? 0
    const purchaseAt36 = savingsPurchaseScenario.timeline[36]?.balance ?? 0
    const baseAt12 = savingsScenario.timeline[12]?.balance ?? 0
    const purchaseAt12 = savingsPurchaseScenario.timeline[12]?.balance ?? 0
    return {
      total: Math.round((baseAt36 - purchaseAt36) * 100) / 100,
      at12: Math.round((baseAt12 - purchaseAt12) * 100) / 100,
      at36: Math.round((baseAt36 - purchaseAt36) * 100) / 100,
    }
  }, [savingsScenario, savingsPurchaseScenario])

  if (loading) {
    return <div className="animate-pulse text-muted-foreground py-12 text-center">Loading...</div>
  }

  if (debts.length === 0 && !hasSavings) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl">What-If Scenarios</h1>
          <p className="text-muted-foreground mt-1">See what a little more fuel does.</p>
        </div>
        <EmptyState
          icon={<SlidersHorizontal className="h-8 w-8 text-primary" />}
          title="Add debts or savings first"
          description="Once you've added your debts, income, or savings balance, you can see what happens when you throw more fuel on the fire."
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">What-If Scenarios</h1>
        <p className="text-muted-foreground mt-1">
          See what a little more fuel does.
        </p>
      </div>

      {/* Impact summary — only show if debts exist */}
      {debts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className={monthsSaved > 0 ? "border-success/30 bg-success/5" : ""}>
            <CardContent className="flex items-center gap-3 py-5">
              <Calendar className="h-8 w-8 text-success" />
              <div>
                <p className="text-sm text-muted-foreground">Months saved</p>
                <p className="text-2xl font-bold">
                  {monthsSaved > 0 ? monthsSaved : monthsSaved === 0 ? "—" : `+${Math.abs(monthsSaved)}`}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className={interestSaved > 0 ? "border-success/30 bg-success/5" : ""}>
            <CardContent className="flex items-center gap-3 py-5">
              <DollarSign className="h-8 w-8 text-success" />
              <div>
                <p className="text-sm text-muted-foreground">Interest saved</p>
                <p className="text-2xl font-bold">
                  {interestSaved > 0 ? formatCurrency(interestSaved) : interestSaved === 0 ? "—" : `-${formatCurrency(Math.abs(interestSaved))}`}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-5">
              <TrendingDown className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">New debt-free date</p>
                <p className="text-2xl font-bold">{formatDate(scenario.payoffDate)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {debts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Extra Monthly Payment</CardTitle>
              <CardDescription>
                Baseline: {formatCurrency(currentExtra)}/mo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                type="range"
                min={0}
                max={maxExtra || 1000}
                step={25}
                value={extraMonthly}
                onChange={e => setExtraMonthly(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">$0</span>
                <span className="font-semibold">{formatCurrency(extraMonthly)}/mo</span>
                <span className="text-muted-foreground">{formatCurrency(maxExtra || 1000)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Income Change</CardTitle>
            <CardDescription>More fuel — or less</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="range"
              min={-1000}
              max={2000}
              step={50}
              value={incomeChange}
              onChange={e => setIncomeChange(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">-$1,000</span>
              <span className="font-semibold">
                {incomeChange >= 0 ? "+" : ""}{formatCurrency(incomeChange)}/mo
              </span>
              <span className="text-muted-foreground">+$2,000</span>
            </div>
          </CardContent>
        </Card>

        {debts.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">One-Time Lump Sum</CardTitle>
              <CardDescription>Tax refund, bonus, or windfall. A burst of flame on one debt.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      type="number"
                      value={lumpSumAmount || ""}
                      onChange={e => setLumpSumAmount(Number(e.target.value))}
                      className="pl-7"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Apply to</label>
                  <select
                    value={lumpSumDebtId}
                    onChange={e => setLumpSumDebtId(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
                  >
                    {debts.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({formatCurrency(d.current_balance)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">In month</label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={lumpSumMonth}
                    onChange={e => setLumpSumMonth(Number(e.target.value))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Debt Chart */}
      {debts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Baseline vs. Scenario</CardTitle>
            <CardDescription>See how extra fuel shifts the timeline</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="month"
                    label={{ value: "Months", position: "insideBottom", offset: -5 }}
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    labelFormatter={(label) => `Month ${label}`}
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: "0.5rem",
                      color: "var(--fg)",
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="Baseline"
                    stroke={CHART_COLORS.baseline}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="Scenario"
                    stroke={CHART_COLORS.scenario}
                    strokeWidth={3}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Savings Projection */}
      {savingsAccount && (hasSavings || debts.length > 0) && savingsScenario && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PiggyBank className="h-5 w-5 text-success" />
              Savings Projection
            </CardTitle>
            <CardDescription>
              How your savings grow over the next 3 years
              {debts.length > 0 && " — affected by how much extra goes to debt"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={savingsChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="month"
                    label={{ value: "Months", position: "insideBottom", offset: -5 }}
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    labelFormatter={(label) => `Month ${label}`}
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: "0.5rem",
                      color: "var(--fg)",
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="Projected"
                    stroke={CHART_COLORS.savings}
                    strokeWidth={3}
                    dot={false}
                  />
                  {savingsAccount.apy > 0 && (
                    <Line
                      type="monotone"
                      dataKey="Without Interest"
                      stroke={CHART_COLORS.savingsNoInterest}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Milestones */}
            {savingsScenario.milestones && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[6, 12, 24, 36].map(m => {
                  const milestone = savingsScenario.milestones[m]
                  if (!milestone) return null
                  return (
                    <div key={m} className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground">Month {m}</p>
                      <p className="text-lg font-bold">{formatCurrency(milestone.balance)}</p>
                      {savingsAccount.apy > 0 && (
                        <p className="text-xs text-success">
                          +{formatCurrency(milestone.balance - milestone.balanceNoInterest)} interest
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* One-Time Purchase Impact */}
      {savingsAccount && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-warning" />
              One-Time Purchase
            </CardTitle>
            <CardDescription>See how a big purchase impacts your savings growth</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    type="number"
                    value={purchaseAmount || ""}
                    onChange={e => setPurchaseAmount(Number(e.target.value))}
                    className="pl-7"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">In month</label>
                <Input
                  type="number"
                  min={1}
                  max={36}
                  value={purchaseMonth}
                  onChange={e => setPurchaseMonth(Math.max(1, Math.min(36, Number(e.target.value))))}
                />
              </div>
            </div>

            {purchaseAmount > 0 && savingsPurchaseScenario && (
              <>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={purchaseChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="month"
                        label={{ value: "Months", position: "insideBottom", offset: -5 }}
                        tick={{ fontSize: 12 }}
                        className="fill-muted-foreground"
                      />
                      <YAxis
                        tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                        tick={{ fontSize: 12 }}
                        className="fill-muted-foreground"
                      />
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                        labelFormatter={(label) => `Month ${label}`}
                        contentStyle={{
                          backgroundColor: "var(--card)",
                          borderColor: "var(--border)",
                          borderRadius: "0.5rem",
                          color: "var(--fg)",
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="Baseline"
                        stroke={CHART_COLORS.purchaseBaseline}
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="After Purchase"
                        stroke={CHART_COLORS.purchaseScenario}
                        strokeWidth={3}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {purchaseCost.total > 0 && (
                  <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
                    <p className="text-sm font-medium">
                      This purchase costs you {formatCurrency(purchaseCost.total)} in lost savings growth by month 36
                    </p>
                    <div className="mt-2 flex gap-6 text-sm text-muted-foreground">
                      <span>Month 12: -{formatCurrency(purchaseCost.at12)}</span>
                      <span>Month 36: -{formatCurrency(purchaseCost.at36)}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
