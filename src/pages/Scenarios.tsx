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
import { formatCurrency, formatDate } from "@/lib/utils"
import { TrendingDown, Calendar, DollarSign, SlidersHorizontal } from "lucide-react"

const CHART_COLORS = {
  baseline: "#a8a29e",
  scenario: "#e8845a",
}

export function Scenarios() {
  const { debts, incomeSources, bills, loading } = useAppData()

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

  const baseline = useMemo(
    () => calculatePayoff(debts, "avalanche", currentExtra),
    [debts, currentExtra]
  )

  const scenario = useMemo(() => {
    const adjustedExtra = extraMonthly + Math.floor(incomeChange * 0.5)
    const lumpSum = lumpSumAmount > 0
      ? { amount: lumpSumAmount, debtId: lumpSumDebtId, month: lumpSumMonth }
      : null
    return calculatePayoff(debts, "avalanche", Math.max(0, adjustedExtra), lumpSum)
  }, [debts, extraMonthly, lumpSumAmount, lumpSumDebtId, lumpSumMonth, incomeChange])

  const monthsSaved = baseline.months - scenario.months
  const interestSaved = baseline.totalInterest - scenario.totalInterest

  // Chart data
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

  if (loading) {
    return <div className="animate-pulse text-muted-foreground py-12 text-center">Loading...</div>
  }

  if (debts.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl">What-If Scenarios</h1>
          <p className="text-muted-foreground mt-1">See what a little more fuel does.</p>
        </div>
        <EmptyState
          icon={<SlidersHorizontal className="h-8 w-8 text-primary" />}
          title="Add debts first"
          description="Once you've added your debts and income, you can see what happens when you throw more fuel on the fire."
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

      {/* Impact summary */}
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

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
      </div>

      {/* Chart */}
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
    </div>
  )
}
