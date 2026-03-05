import { useState, useMemo, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/EmptyState"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts"
import { useAppData } from "@/contexts/DataContext"
import { getMonthlyIncome, getMonthlyBills, getMonthlyMinimums } from "@/lib/mock-data"
import { calculatePayoff } from "@/lib/payoff-engine"
import { projectSavings } from "@/lib/savings-engine"
import { formatCurrency, cn } from "@/lib/utils"
import {
  hasActivePromo,
  willMakeDeadline,
  extraNeededToMakeDeadline,
  interestAtRisk,
} from "@/lib/promo-engine"
import { SlidersHorizontal, RotateCcw, Lightbulb } from "lucide-react"
import { Button } from "@/components/ui/button"

// --- Constants ---

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const FULL_MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const YEAR_OPTIONS = [2025, 2026, 2027, 2028, 2029]

const TIMEFRAMES = [
  { key: "full" as const, label: "Full" },
  { key: "6mo" as const, label: "6 Mo" },
  { key: "1yr" as const, label: "1 Yr" },
  { key: "3yr" as const, label: "3 Yr" },
  { key: "custom" as const, label: "Custom" },
]

type Timeframe = "full" | "6mo" | "1yr" | "3yr" | "custom"

// --- Inline useDebounce ---

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => { const t = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(t) }, [value, delay])
  return debounced
}

// --- Chart data types ---

interface ChartDataPoint {
  calendarMonth: string
  label: string
  debtPast: number | null
  debtBaselineFuture: number | null
  debtScenarioFuture: number | null
  savingsBaselineFuture: number | null
  savingsScenarioFuture: number | null
  savingsNoInterestFuture: number | null
}

// --- Helpers ---

function absMonthToCalendar(absMonth: number): { calendarMonth: string; label: string } {
  const year = Math.floor(absMonth / 12)
  const month = absMonth % 12
  return {
    calendarMonth: `${year}-${String(month + 1).padStart(2, "0")}`,
    label: `${MONTH_NAMES[month]} ${year}`,
  }
}

function calendarToAbsMonth(calendarMonth: string): number {
  const [y, m] = calendarMonth.split("-").map(Number)
  return y * 12 + (m - 1)
}

// --- Component ---

export function Scenarios() {
  const { debts, incomeSources, bills, savingsAccount, loading } = useAppData()

  const now = new Date()
  const nowYear = now.getFullYear()
  const nowMonth = now.getMonth() // 0-indexed
  const nowAbsMonth = nowYear * 12 + nowMonth
  const todayCalendarMonth = `${nowYear}-${String(nowMonth + 1).padStart(2, "0")}`

  // --- Derived financial values ---
  const monthlyIncome = getMonthlyIncome(incomeSources)
  const monthlyBillsTotal = getMonthlyBills(bills)
  const monthlyMinimums = getMonthlyMinimums(debts)
  const hasDebts = debts.length > 0
  const currentExtra = 0 // baseline assumes only minimums are paid
  const maxExtra = hasDebts
    ? Math.max(0, Math.floor(monthlyIncome - monthlyBillsTotal - monthlyMinimums))
    : 0

  // --- State: Extra monthly payment (slider <-> text sync) ---
  const [extraSlider, setExtraSlider] = useState(0)
  const [extraText, setExtraText] = useState("0")
  const debouncedExtraText = useDebounce(extraText, 300)

  // Sync debounced text -> slider
  useEffect(() => {
    const val = Math.max(0, Math.min(maxExtra || 1000, Number(debouncedExtraText) || 0))
    setExtraSlider(val)
  }, [debouncedExtraText, maxExtra])

  // --- State: Income change (slider <-> text sync) ---
  const [incomeSlider, setIncomeSlider] = useState(0)
  const [incomeText, setIncomeText] = useState("0")
  const debouncedIncomeText = useDebounce(incomeText, 300)

  useEffect(() => {
    const val = Math.max(-1000, Math.min(2000, Number(debouncedIncomeText) || 0))
    setIncomeSlider(val)
  }, [debouncedIncomeText])

  // --- State: Income split (% of income change allocated to debt) ---
  const [debtSplitPct, setDebtSplitPct] = useState(50)

  // --- State: Lump sum ---
  const [lumpSumAmountText, setLumpSumAmountText] = useState("")
  const debouncedLumpSum = useDebounce(lumpSumAmountText, 300)
  const lumpSumAmount = Math.max(0, Number(debouncedLumpSum) || 0)
  const [lumpSumDebtId, setLumpSumDebtId] = useState(debts[0]?.id ?? "")
  const [lumpSumMonth, setLumpSumMonth] = useState(nowMonth)
  const [lumpSumYear, setLumpSumYear] = useState(nowYear)

  // --- State: Purchase ---
  const [purchaseAmountText, setPurchaseAmountText] = useState("")
  const debouncedPurchase = useDebounce(purchaseAmountText, 300)
  const purchaseAmount = Math.max(0, Number(debouncedPurchase) || 0)
  const [purchaseMonth, setPurchaseMonth] = useState(nowMonth)
  const [purchaseYear, setPurchaseYear] = useState(nowYear)

  // --- State: Timeframe ---
  const [timeframe, setTimeframe] = useState<Timeframe>("3yr")
  const [customStartMonth, setCustomStartMonth] = useState(nowMonth)
  const [customStartYear, setCustomStartYear] = useState(nowYear)
  const [customEndMonth, setCustomEndMonth] = useState((nowMonth + 6) % 12)
  const [customEndYear, setCustomEndYear] = useState(nowYear + (nowMonth + 6 >= 12 ? 1 : 0))

  const resetAll = () => {
    setExtraSlider(0); setExtraText("0")
    setIncomeSlider(0); setIncomeText("0")
    setDebtSplitPct(50)
    setLumpSumAmountText(""); setLumpSumMonth(nowMonth); setLumpSumYear(nowYear)
    setPurchaseAmountText(""); setPurchaseMonth(nowMonth); setPurchaseYear(nowYear)
  }

  // Sync lumpSumDebtId when debts change
  useEffect(() => {
    if (debts.length > 0 && !debts.find(d => d.id === lumpSumDebtId)) {
      setLumpSumDebtId(debts[0].id)
    }
  }, [debts, lumpSumDebtId])

  // --- Computed scenario values ---
  const scenarioExtra = useMemo(
    () => Math.max(0, extraSlider + Math.floor(incomeSlider * debtSplitPct / 100)),
    [extraSlider, incomeSlider, debtSplitPct]
  )

  const lumpSumEngineMonth = useMemo(
    () => Math.max(1, (lumpSumYear * 12 + lumpSumMonth) - (nowYear * 12 + nowMonth)),
    [lumpSumMonth, lumpSumYear, nowYear, nowMonth]
  )

  const purchaseEngineMonth = useMemo(
    () => Math.max(1, (purchaseYear * 12 + purchaseMonth) - (nowYear * 12 + nowMonth)),
    [purchaseMonth, purchaseYear, nowYear, nowMonth]
  )

  // --- Engine calculations ---

  // Step 1: Historical debt projection
  const historicalResult = useMemo(() => {
    if (!hasDebts) return null
    const earliestMs = debts.reduce((min, d) => {
      const t = new Date(d.created_at).getTime()
      return t < min ? t : min
    }, Infinity)
    const earliestDate = new Date(earliestMs)
    const earliestAbsMonth = earliestDate.getFullYear() * 12 + earliestDate.getMonth()

    const historicalDebts = debts.map(d => ({ ...d, current_balance: d.starting_balance }))
    const result = calculatePayoff(historicalDebts, "avalanche", currentExtra)
    return { result, earliestAbsMonth }
  }, [debts, currentExtra, hasDebts])

  // Step 2: Forward projections
  const baseline = useMemo(
    () => calculatePayoff(debts, "avalanche", currentExtra),
    [debts, currentExtra]
  )

  const scenario = useMemo(() => {
    const lumpSum = lumpSumAmount > 0 && lumpSumDebtId
      ? { amount: lumpSumAmount, debtId: lumpSumDebtId, month: lumpSumEngineMonth }
      : null
    return calculatePayoff(debts, "avalanche", scenarioExtra, lumpSum)
  }, [debts, scenarioExtra, lumpSumAmount, lumpSumDebtId, lumpSumEngineMonth])

  const hasSavings = !!(savingsAccount && savingsAccount.current_balance > 0)

  const baselineMonthlyNet = monthlyIncome - monthlyBillsTotal - monthlyMinimums - currentExtra
  const scenarioMonthlyNet = monthlyIncome + incomeSlider - monthlyBillsTotal - monthlyMinimums - scenarioExtra

  // Savings projection should cover at least the full debt payoff timeline
  const savingsMonths = Math.max(36, baseline.months, scenario.months)

  const savingsBaseline = useMemo(() => {
    if (!savingsAccount) return null
    return projectSavings({
      startingBalance: savingsAccount.current_balance,
      monthlyNet: baselineMonthlyNet,
      apy: savingsAccount.apy,
      months: savingsMonths,
    })
  }, [savingsAccount, baselineMonthlyNet, savingsMonths])

  const savingsScenario = useMemo(() => {
    if (!savingsAccount) return null
    const purchase = purchaseAmount > 0 ? { amount: purchaseAmount, month: purchaseEngineMonth } : null
    return projectSavings({
      startingBalance: savingsAccount.current_balance,
      monthlyNet: scenarioMonthlyNet,
      apy: savingsAccount.apy,
      months: savingsMonths,
      purchase,
    })
  }, [savingsAccount, scenarioMonthlyNet, savingsMonths, purchaseAmount, purchaseEngineMonth])

  // Step 3: Build unified chart data
  const chartData = useMemo(() => {
    let startAbs = nowAbsMonth
    let endAbs = nowAbsMonth + 36

    if (hasDebts && historicalResult) {
      startAbs = historicalResult.earliestAbsMonth
      endAbs = Math.max(endAbs, nowAbsMonth + baseline.months, nowAbsMonth + scenario.months)
    }

    const points: ChartDataPoint[] = []

    for (let abs = startAbs; abs <= endAbs; abs++) {
      const { calendarMonth, label } = absMonthToCalendar(abs)
      const isPast = abs < nowAbsMonth
      const isToday = abs === nowAbsMonth
      const isFuture = abs > nowAbsMonth
      const futureOffset = abs - nowAbsMonth

      // Historical debt
      let debtPast: number | null = null
      if (hasDebts && historicalResult && (isPast || isToday)) {
        const histOffset = abs - historicalResult.earliestAbsMonth
        if (histOffset >= 0 && histOffset < historicalResult.result.timeline.length) {
          debtPast = historicalResult.result.timeline[histOffset].totalBalance
        }
      }

      // Future debt
      let debtBaselineFuture: number | null = null
      let debtScenarioFuture: number | null = null
      if (hasDebts && (isFuture || isToday) && futureOffset >= 0) {
        if (futureOffset < baseline.timeline.length) {
          debtBaselineFuture = baseline.timeline[futureOffset].totalBalance
        }
        if (futureOffset < scenario.timeline.length) {
          debtScenarioFuture = scenario.timeline[futureOffset].totalBalance
        }
      }

      // Future savings
      let savingsBaselineFuture: number | null = null
      let savingsScenarioFuture: number | null = null
      let savingsNoInterestFuture: number | null = null
      if ((isFuture || isToday) && futureOffset >= 0) {
        if (savingsBaseline && futureOffset < savingsBaseline.timeline.length) {
          savingsBaselineFuture = savingsBaseline.timeline[futureOffset].balance
        }
        if (savingsScenario && futureOffset < savingsScenario.timeline.length) {
          savingsScenarioFuture = savingsScenario.timeline[futureOffset].balance
        }
        if (savingsScenario && savingsAccount && savingsAccount.apy > 0 && futureOffset < savingsScenario.timeline.length) {
          savingsNoInterestFuture = savingsScenario.timeline[futureOffset].balanceNoInterest
        }
      }

      points.push({
        calendarMonth, label,
        debtPast,
        debtBaselineFuture, debtScenarioFuture,
        savingsBaselineFuture, savingsScenarioFuture, savingsNoInterestFuture,
      })
    }

    // Downsample to ~60 points, always keeping critical boundaries
    if (points.length > 60) {
      const todayIdx = points.findIndex(p => p.calendarMonth === todayCalendarMonth)
      // Preserve the purchase month so the dip is visible
      const purchaseAbsMonth = purchaseAmount > 0 ? nowAbsMonth + purchaseEngineMonth : -1
      const purchaseIdx = points.findIndex(p => calendarToAbsMonth(p.calendarMonth) === purchaseAbsMonth)
      const step = Math.ceil(points.length / 60)
      const sampled: ChartDataPoint[] = []
      for (let i = 0; i < points.length; i++) {
        if (i % step === 0 || i === todayIdx || i === purchaseIdx || i === points.length - 1) {
          sampled.push(points[i])
        }
      }
      return sampled
    }

    return points
  }, [hasDebts, historicalResult, baseline, scenario, savingsBaseline, savingsScenario, savingsAccount, nowAbsMonth, todayCalendarMonth, purchaseAmount, purchaseEngineMonth])

  // Step 4: Timeframe filtering
  const filteredChartData = useMemo(() => {
    let startAbs: number, endAbs: number
    switch (timeframe) {
      case "full":
        return chartData
      case "6mo":
        startAbs = nowAbsMonth; endAbs = nowAbsMonth + 6; break
      case "1yr":
        startAbs = nowAbsMonth; endAbs = nowAbsMonth + 12; break
      case "3yr":
        startAbs = nowAbsMonth; endAbs = nowAbsMonth + 36; break
      case "custom":
        startAbs = customStartYear * 12 + customStartMonth
        endAbs = customEndYear * 12 + customEndMonth
        break
    }
    return chartData.filter(p => {
      const abs = calendarToAbsMonth(p.calendarMonth)
      return abs >= startAbs && abs <= endAbs
    })
  }, [chartData, timeframe, nowAbsMonth, customStartMonth, customStartYear, customEndMonth, customEndYear])

  // --- Summary stats ---
  const debtFreeDate = hasDebts ? scenario.payoffDate : null
  const interestSaved = hasDebts ? baseline.totalInterest - scenario.totalInterest : null
  const savingsAtDebtFree = useMemo(() => {
    if (!savingsScenario || !hasDebts) return null
    const idx = Math.min(scenario.months, savingsScenario.timeline.length - 1)
    return savingsScenario.timeline[idx]?.balance ?? null
  }, [savingsScenario, scenario, hasDebts])

  // Which line groups are visible in the filtered data
  const hasDebtData = filteredChartData.some(p => p.debtPast !== null || p.debtScenarioFuture !== null)
  const hasSavingsData = filteredChartData.some(p => p.savingsScenarioFuture !== null)
  const hasNoInterestData = filteredChartData.some(p => p.savingsNoInterestFuture !== null)

  // --- Render ---

  if (loading) {
    return <div className="animate-pulse text-muted-foreground py-12 text-center">Loading...</div>
  }

  if (!hasDebts && !hasSavings) {
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

  const xTickFormatter = (value: string) => {
    const [y, m] = value.split("-").map(Number)
    return `${MONTH_NAMES[m - 1]} '${String(y).slice(2)}`
  }

  const yFormatter = (v: number) => `$${(v / 1000).toFixed(0)}k`

  const tooltipLabelNames: Record<string, string> = {
    debtPast: "Debt (history)",
    debtBaselineFuture: "Debt (baseline)",
    debtScenarioFuture: "Debt (scenario)",
    savingsBaselineFuture: "Savings (baseline)",
    savingsScenarioFuture: "Savings (scenario)",
    savingsNoInterestFuture: "Savings (no interest)",
  }

  const selectClass = "flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
  const smallSelectClass = "h-9 rounded-lg border border-input bg-card px-2 py-1 text-sm text-foreground"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">What-If Scenarios</h1>
        <p className="text-muted-foreground mt-1">See what a little more fuel does.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        {/* ── Left Column: Variables ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Variables</CardTitle>
              <Button variant="outline" size="sm" onClick={resetAll}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-0">
            {/* 1. Extra monthly payment */}
            {hasDebts && (
              <div className="pb-4">
                <label className="text-sm font-medium">Extra monthly payment</label>
                <p className="text-xs text-muted-foreground mb-2">
                  Baseline: {formatCurrency(currentExtra)}/mo
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={maxExtra || 1000}
                    step={25}
                    value={extraSlider}
                    onChange={e => {
                      const v = Number(e.target.value)
                      setExtraSlider(v)
                      setExtraText(String(v))
                    }}
                    className="flex-1"
                  />
                  <div className="relative w-24">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      value={extraText}
                      onChange={e => setExtraText(e.target.value)}
                      className="pl-6 text-sm h-9"
                    />
                  </div>
                </div>

                {/* Promo deadline callout */}
                {debts
                  .filter(d => hasActivePromo(d) && d.promo_type === "deferred_interest" && !willMakeDeadline(d))
                  .map(d => {
                    const needed = extraNeededToMakeDeadline(d)
                    const risk = interestAtRisk(d)
                    const endLabel = d.promo_end_date
                      ? new Date(d.promo_end_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                      : ""
                    if (scenarioExtra < needed) return null
                    return (
                      <div key={d.id} className="flex items-start gap-2 mt-2 text-xs text-success bg-success/5 border border-success/20 rounded-lg p-2.5">
                        <Lightbulb className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                        <span>
                          +{formatCurrency(needed)}/mo clears the {d.name} promo before {endLabel}.
                          Saves {formatCurrency(risk)} in deferred interest.
                        </span>
                      </div>
                    )
                  })
                }
              </div>
            )}

            {/* 2. Income change */}
            <div className={cn(hasDebts && "border-t border-border pt-4", "pb-4")}>
              <label className="text-sm font-medium">Income change</label>
              <p className="text-xs text-muted-foreground mb-2">More fuel — or less</p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={-1000}
                  max={2000}
                  step={50}
                  value={incomeSlider}
                  onChange={e => {
                    const v = Number(e.target.value)
                    setIncomeSlider(v)
                    setIncomeText(String(v))
                  }}
                  className="flex-1"
                />
                <div className="relative w-24">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    value={incomeText}
                    onChange={e => setIncomeText(e.target.value)}
                    className="pl-6 text-sm h-9"
                  />
                </div>
              </div>

              {/* Split ratio */}
              {hasDebts && (
                <div className="mt-3">
                  <label className="text-sm font-medium">Allocate income change</label>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground w-14 shrink-0">Savings</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={debtSplitPct}
                      onChange={e => setDebtSplitPct(Number(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-8 shrink-0 text-right">Debt</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 text-center">
                    {debtSplitPct}% to debt · {100 - debtSplitPct}% to savings
                  </p>
                </div>
              )}
            </div>

            {/* 3. One-time lump sum */}
            {hasDebts && (
              <div className="border-t border-border pt-4 pb-4">
                <label className="text-sm font-medium">One-time lump sum</label>
                <p className="text-xs text-muted-foreground mb-2">Tax refund, bonus, or windfall</p>
                <div className="space-y-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      value={lumpSumAmountText}
                      onChange={e => setLumpSumAmountText(e.target.value)}
                      className="pl-7"
                      placeholder="0"
                    />
                  </div>
                  <select
                    value={lumpSumDebtId}
                    onChange={e => setLumpSumDebtId(e.target.value)}
                    className={selectClass}
                  >
                    {debts.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({formatCurrency(d.current_balance)})
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={lumpSumMonth}
                      onChange={e => setLumpSumMonth(Number(e.target.value))}
                      className={selectClass}
                    >
                      {MONTH_NAMES.map((name, i) => (
                        <option key={i} value={i}>{name}</option>
                      ))}
                    </select>
                    <select
                      value={lumpSumYear}
                      onChange={e => setLumpSumYear(Number(e.target.value))}
                      className={selectClass}
                    >
                      {YEAR_OPTIONS.map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 4. One-time purchase */}
            <div className="border-t border-border pt-4">
              <label className="text-sm font-medium">One-time purchase</label>
              <p className="text-xs text-muted-foreground mb-2">See how a big buy impacts savings</p>
              <div className="space-y-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    value={purchaseAmountText}
                    onChange={e => setPurchaseAmountText(e.target.value)}
                    className="pl-7"
                    placeholder="0"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={purchaseMonth}
                    onChange={e => setPurchaseMonth(Number(e.target.value))}
                    className={selectClass}
                  >
                    {MONTH_NAMES.map((name, i) => (
                      <option key={i} value={i}>{name}</option>
                    ))}
                  </select>
                  <select
                    value={purchaseYear}
                    onChange={e => setPurchaseYear(Number(e.target.value))}
                    className={selectClass}
                  >
                    {YEAR_OPTIONS.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Right Column: Timeframe + Chart + Summary ── */}
        <div className="space-y-4">
          {/* Timeframe selector */}
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf.key}
                onClick={() => setTimeframe(tf.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  timeframe === tf.key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Custom range pickers */}
          {timeframe === "custom" && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select value={customStartMonth} onChange={e => setCustomStartMonth(Number(e.target.value))} className={smallSelectClass}>
                {MONTH_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
              </select>
              <select value={customStartYear} onChange={e => setCustomStartYear(Number(e.target.value))} className={smallSelectClass}>
                {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="text-muted-foreground">to</span>
              <select value={customEndMonth} onChange={e => setCustomEndMonth(Number(e.target.value))} className={smallSelectClass}>
                {MONTH_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
              </select>
              <select value={customEndYear} onChange={e => setCustomEndYear(Number(e.target.value))} className={smallSelectClass}>
                {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}

          {/* Chart */}
          <Card>
            <CardContent className="pt-6">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={filteredChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="calendarMonth"
                      tickFormatter={xTickFormatter}
                      interval="preserveStartEnd"
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                    />

                    {hasDebtData && (
                      <YAxis
                        yAxisId="debt"
                        orientation="left"
                        tickFormatter={yFormatter}
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                      />
                    )}
                    {hasSavingsData && (
                      <YAxis
                        yAxisId="savings"
                        orientation={hasDebtData ? "right" : "left"}
                        tickFormatter={yFormatter}
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                      />
                    )}

                    <ReferenceLine
                      x={todayCalendarMonth}
                      stroke="#a8a29e"
                      strokeDasharray="4 4"
                      label={{ value: "Today", position: "top", fill: "#a8a29e", fontSize: 11 }}
                      yAxisId={hasDebtData ? "debt" : "savings"}
                    />

                    <Tooltip
                      labelFormatter={(label) => {
                        const [y, m] = String(label).split("-").map(Number)
                        return `${FULL_MONTH_NAMES[m - 1]} ${y}`
                      }}
                      formatter={(value, name) => [
                        formatCurrency(Number(value)),
                        tooltipLabelNames[String(name)] ?? name,
                      ]}
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        borderColor: "var(--border)",
                        borderRadius: "0.5rem",
                        color: "var(--fg)",
                      }}
                    />

                    {/* Debt lines */}
                    {hasDebtData && (
                      <>
                        <Line type="monotone" dataKey="debtPast" yAxisId="debt" stroke="#e8845a" strokeWidth={2} dot={false} connectNulls={false} />
                        <Line type="monotone" dataKey="debtBaselineFuture" yAxisId="debt" stroke="#a8a29e" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls={false} />
                        <Line type="monotone" dataKey="debtScenarioFuture" yAxisId="debt" stroke="#e8845a" strokeWidth={3} strokeDasharray="5 5" dot={false} connectNulls={false} />
                      </>
                    )}

                    {/* Savings lines */}
                    {hasSavingsData && (
                      <>
                        <Line type="monotone" dataKey="savingsBaselineFuture" yAxisId="savings" stroke="#a8a29e" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls={false} />
                        <Line type="monotone" dataKey="savingsScenarioFuture" yAxisId="savings" stroke="#4ade80" strokeWidth={3} strokeDasharray="5 5" dot={false} connectNulls={false} />
                        {hasNoInterestData && (
                          <Line type="monotone" dataKey="savingsNoInterestFuture" yAxisId="savings" stroke="#78716c" strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls={false} />
                        )}
                      </>
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Custom legend */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
                {hasDebtData && (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: "#e8845a" }} />
                      Debt (history)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-0.5 rounded border-t-2 border-dashed" style={{ borderColor: "#a8a29e" }} />
                      Debt (baseline)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-0.5 rounded border-t-2 border-dashed" style={{ borderColor: "#e8845a" }} />
                      Debt (scenario)
                    </span>
                  </>
                )}
                {hasSavingsData && (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-0.5 rounded border-t-2 border-dashed" style={{ borderColor: "#a8a29e" }} />
                      Savings (baseline)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-0.5 rounded border-t-2 border-dashed" style={{ borderColor: "#4ade80" }} />
                      Savings (scenario)
                    </span>
                    {hasNoInterestData && (
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-0.5 rounded border-t border-dashed" style={{ borderColor: "#78716c" }} />
                        Without interest
                      </span>
                    )}
                  </>
                )}
              </div>

              {/* Hint if debts but no savings data */}
              {hasDebts && !hasSavingsData && (
                <p className="text-xs text-muted-foreground mt-2">
                  Add a savings balance in Check-in to see savings projections
                </p>
              )}
            </CardContent>
          </Card>

          {/* Summary Stats */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Debt-free date</p>
                  <p className="text-lg font-bold">
                    {debtFreeDate
                      ? debtFreeDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
                      : "---"}
                  </p>
                  {hasDebts && baseline.months !== scenario.months && (
                    <p className={cn(
                      "text-xs",
                      scenario.months < baseline.months ? "text-success" : "text-destructive"
                    )}>
                      {scenario.months < baseline.months
                        ? `${baseline.months - scenario.months} months sooner`
                        : `${scenario.months - baseline.months} months later`}
                    </p>
                  )}
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Interest saved</p>
                  <p className={cn(
                    "text-lg font-bold",
                    interestSaved !== null && interestSaved > 0 && "text-success",
                    interestSaved !== null && interestSaved < 0 && "text-destructive",
                  )}>
                    {interestSaved !== null
                      ? interestSaved >= 0
                        ? formatCurrency(interestSaved)
                        : `-${formatCurrency(Math.abs(interestSaved))}`
                      : "---"}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Savings at debt-free</p>
                  <p className="text-lg font-bold">
                    {savingsAtDebtFree !== null ? formatCurrency(savingsAtDebtFree) : "---"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
