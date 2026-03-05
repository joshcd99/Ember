import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { EmptyState } from "@/components/EmptyState"
import { DebtModal } from "@/components/modals/DebtModal"
import { Input } from "@/components/ui/input"
import { Check, CreditCard, TrendingDown, Snowflake, MinusCircle, Plus, Pencil, GripVertical, ListOrdered, Flame } from "lucide-react"
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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useAppData } from "@/contexts/DataContext"
import { getMonthlyIncome, getMonthlyBills, getMonthlyMinimums } from "@/lib/mock-data"
import { calculatePayoff, type Strategy } from "@/lib/payoff-engine"
import { formatCurrency, formatCurrencyExact, formatPercent, formatDate, cn } from "@/lib/utils"
import type { Debt, ExtraPaymentType } from "@/types/database"

/** 3-tier APR badge: >15% red, 7-15% neutral, <7% green */
function aprBadgeVariant(rate: number): "destructive" | "default" | "success" {
  if (rate > 0.15) return "destructive"
  if (rate >= 0.07) return "default"
  return "success"
}

const CHART_COLORS = {
  avalanche: "#e8845a",
  snowball: "#4ade80",
  minimums: "#a8a29e",
  custom: "#c084fc",
  grid: "var(--border)",
}

type DisplayStrategy = Strategy

const strategyMeta: Record<DisplayStrategy, { label: string; description: string; icon: React.ReactNode; color: string }> = {
  avalanche: {
    label: "Avalanche",
    description: "Highest interest rate first. Maximum burn.",
    icon: <TrendingDown className="h-5 w-5" />,
    color: CHART_COLORS.avalanche,
  },
  snowball: {
    label: "Snowball",
    description: "Lowest balance first. Quick wins to keep the flame alive.",
    icon: <Snowflake className="h-5 w-5" />,
    color: CHART_COLORS.snowball,
  },
  minimums: {
    label: "Minimums Only",
    description: "Pay only what's required. A slow smolder.",
    icon: <MinusCircle className="h-5 w-5" />,
    color: CHART_COLORS.minimums,
  },
  custom: {
    label: "Custom Order",
    description: "Drag to set your own priority. Your rules.",
    icon: <ListOrdered className="h-5 w-5" />,
    color: CHART_COLORS.custom,
  },
}

function SortableDebtRow({ debt, index }: { debt: Debt; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: debt.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className={cn("flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2", isDragging && "shadow-lg")}>
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}.</span>
      <div className="flex-1">
        <span className="text-sm font-medium">{debt.name}</span>
      </div>
      <Badge variant={aprBadgeVariant(debt.interest_rate)} className="text-xs">
        {formatPercent(debt.interest_rate)}
      </Badge>
      <span className="text-sm font-medium">{formatCurrency(debt.current_balance)}</span>
    </div>
  )
}

export function Debts() {
  const { debts, incomeSources, bills, householdSettings, updateCustomDebtOrder, updatePayoffStrategy, loading } = useAppData()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  // Initialize from saved settings
  const savedStrategy = (householdSettings?.preferred_strategy ?? "avalanche") as DisplayStrategy
  const savedExtraType = (householdSettings?.extra_payment_type ?? "fixed") as ExtraPaymentType
  const savedExtraAmount = householdSettings?.extra_payment_amount ?? 0

  const [selectedStrategy, setSelectedStrategy] = useState<DisplayStrategy>(savedStrategy)
  const [extraType, setExtraType] = useState<"none" | ExtraPaymentType>(
    savedExtraAmount === 0 && savedExtraType === "fixed" ? "none" : savedExtraType
  )
  const [extraAmount, setExtraAmount] = useState(String(savedExtraAmount || ""))

  const customOrder = householdSettings?.custom_debt_order ?? []

  // Derive ordered list for drag-and-drop
  const customOrderedDebts = useMemo(() => {
    if (customOrder.length === 0) return debts
    const ordered: Debt[] = []
    for (const id of customOrder) {
      const d = debts.find(d => d.id === id)
      if (d) ordered.push(d)
    }
    // Append any debts not in the custom order
    for (const d of debts) {
      if (!customOrder.includes(d.id)) ordered.push(d)
    }
    return ordered
  }, [debts, customOrder])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = customOrderedDebts.findIndex(d => d.id === active.id)
    const newIndex = customOrderedDebts.findIndex(d => d.id === over.id)
    const reordered = arrayMove(customOrderedDebts, oldIndex, newIndex)
    updateCustomDebtOrder(reordered.map(d => d.id))
  }

  const resetToAvalanche = () => {
    updateCustomDebtOrder([])
    setSelectedStrategy("avalanche")
  }

  if (loading) {
    return <div className="animate-pulse text-muted-foreground py-12 text-center">Loading...</div>
  }

  const openAdd = () => { setEditingDebt(null); setModalOpen(true) }
  const openEdit = (debt: Debt) => { setEditingDebt(debt); setModalOpen(true) }

  if (debts.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl">Debts & Payoff Strategy</h1>
            <p className="text-muted-foreground mt-1">Compare strategies and pick the one that burns fastest.</p>
          </div>
        </div>
        <EmptyState
          icon={<CreditCard className="h-8 w-8 text-primary" />}
          title="No debts added yet"
          description="Credit cards, student loans, car payments — add them here and let's start burning them down."
          actionLabel="Add Debt"
          onAction={openAdd}
        />
        <DebtModal open={modalOpen} onClose={() => setModalOpen(false)} debt={editingDebt} />
      </div>
    )
  }

  const monthlyIncome = getMonthlyIncome(incomeSources)
  const monthlyBillsTotal = getMonthlyBills(bills)
  const monthlyMinimums = getMonthlyMinimums(debts)
  const freeCash = Math.max(0, monthlyIncome - monthlyBillsTotal - monthlyMinimums)

  const extraMonthly = extraType === "none"
    ? 0
    : extraType === "percent_of_free_cash"
      ? Math.max(0, Math.floor(freeCash * (Number(extraAmount) || 0) / 100))
      : Math.max(0, Number(extraAmount) || 0)

  // Detect unsaved changes
  const hasUnsavedChanges = selectedStrategy !== savedStrategy
    || (extraType === "none" ? 0 : Number(extraAmount) || 0) !== savedExtraAmount
    || (extraType === "none" ? "fixed" : extraType) !== savedExtraType

  const handleApplyStrategy = async () => {
    setSaving(true)
    try {
      const persistType: ExtraPaymentType = extraType === "none" ? "fixed" : extraType
      const persistAmount = extraType === "none" ? 0 : (Number(extraAmount) || 0)
      await updatePayoffStrategy(selectedStrategy, persistAmount, persistType)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const results = {
    avalanche: calculatePayoff(debts, "avalanche", extraMonthly),
    snowball: calculatePayoff(debts, "snowball", extraMonthly),
    minimums: calculatePayoff(debts, "minimums"),
    custom: calculatePayoff(debts, "custom", extraMonthly, null, customOrder.length > 0 ? customOrder : debts.map(d => d.id)),
  }

  // Build chart data
  const maxMonths = Math.max(
    results.avalanche.months,
    results.snowball.months,
    results.minimums.months,
    results.custom.months
  )
  const step = Math.max(1, Math.floor(maxMonths / 40))
  const chartData: Array<Record<string, number>> = []

  for (let m = 0; m <= maxMonths; m += step) {
    chartData.push({
      month: m,
      Avalanche: results.avalanche.timeline[m]?.totalBalance ?? 0,
      Snowball: results.snowball.timeline[m]?.totalBalance ?? 0,
      "Minimums Only": results.minimums.timeline[m]?.totalBalance ?? 0,
      Custom: results.custom.timeline[m]?.totalBalance ?? 0,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl">Debts & Payoff Strategy</h1>
          <p className="text-muted-foreground mt-1">
            Compare strategies and pick the one that burns fastest.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4" /> Add Debt
        </Button>
      </div>

      {/* Debt cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {debts.map(debt => {
          const paid = debt.starting_balance - debt.current_balance
          const pct = debt.starting_balance > 0 ? (paid / debt.starting_balance) * 100 : 0
          return (
            <Card
              key={debt.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => openEdit(debt)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-base">{debt.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={aprBadgeVariant(debt.interest_rate)}>
                      {formatPercent(debt.interest_rate)} APR
                    </Badge>
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Balance</span>
                  <span className="font-semibold">{formatCurrency(debt.current_balance)}</span>
                </div>
                <Progress value={pct} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatCurrency(paid)} paid</span>
                  <span>Min: {formatCurrencyExact(debt.minimum_payment)}/mo</span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Strategy comparison */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Strategy Comparison</h2>
          {hasUnsavedChanges && (
            <Button onClick={handleApplyStrategy} disabled={saving} size="sm">
              {saving ? "Saving..." : justSaved ? <><Check className="h-4 w-4" /> Applied</> : <><Flame className="h-4 w-4" /> Apply Strategy</>}
            </Button>
          )}
          {!hasUnsavedChanges && savedStrategy && savedExtraAmount > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Check className="h-3.5 w-3.5 text-success" /> Strategy applied
            </span>
          )}
        </div>

        {/* Extra payment controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-sm text-muted-foreground">Extra payment:</span>
          <div className="flex gap-2">
            {(["none", "fixed", "percent_of_free_cash"] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setExtraType(t)
                  if (t === "none") setExtraAmount("")
                  if (t === "percent_of_free_cash" && !extraAmount) setExtraAmount("50")
                }}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm border transition-colors",
                  extraType === t
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/50"
                )}
              >
                {t === "none" ? "Minimums Only" : t === "fixed" ? "Fixed $" : "% of Free Cash"}
              </button>
            ))}
          </div>
          {extraType === "fixed" && (
            <div className="relative w-28">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                type="number"
                placeholder="200"
                value={extraAmount}
                onChange={e => setExtraAmount(e.target.value)}
                className="h-9 pl-7 text-sm"
              />
            </div>
          )}
          {extraType === "percent_of_free_cash" && (
            <div className="flex items-center gap-2">
              <div className="relative w-20">
                <Input
                  type="number"
                  placeholder="50"
                  value={extraAmount}
                  onChange={e => setExtraAmount(e.target.value)}
                  className="h-9 pr-7 text-sm"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
              </div>
              {freeCash > 0 && (
                <span className="text-xs text-muted-foreground">= {formatCurrency(extraMonthly)}/mo</span>
              )}
            </div>
          )}
        </div>

        {extraMonthly > 0 && extraType === "fixed" && (
          <p className="text-sm text-muted-foreground mb-4">
            Throwing {formatCurrency(extraMonthly)}/mo of extra fuel at your debt.
          </p>
        )}
        {extraType === "none" && (
          <p className="text-sm text-muted-foreground mb-4">
            Showing projections with minimum payments only.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(["avalanche", "snowball", "minimums", "custom"] as DisplayStrategy[]).map(strategy => {
            const result = results[strategy]
            const meta = strategyMeta[strategy]
            const isSelected = selectedStrategy === strategy
            return (
              <Card
                key={strategy}
                className={`cursor-pointer transition-all ${
                  isSelected ? "ring-2 ring-primary border-primary" : "hover:border-primary/50"
                }`}
                onClick={() => setSelectedStrategy(strategy)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2" style={{ color: meta.color }}>
                      {meta.icon}
                      <CardTitle className="text-base">{meta.label}</CardTitle>
                    </div>
                    {isSelected && (
                      <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                  <CardDescription>{meta.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Debt-free by</span>
                    <span className="font-semibold">{formatDate(result.payoffDate)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total interest</span>
                    <span className="font-semibold">{formatCurrency(result.totalInterest)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Months</span>
                    <span className="font-semibold">{result.months}</span>
                  </div>
                  {result.debtPayoffOrder.length > 0 && (
                    <div className="pt-2 border-t border-border mt-2">
                      <p className="text-xs text-muted-foreground mb-1">Payoff order:</p>
                      <div className="space-y-1">
                        {result.debtPayoffOrder.map((d, i) => (
                          <p key={d.id} className="text-xs">
                            {i + 1}. {d.name} — month {d.month}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
                {!isSelected && (
                  <div className="px-6 pb-6">
                    <Button variant="outline" size="sm" className="w-full">
                      Select this strategy
                    </Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      </div>

      {/* Custom order drag-and-drop */}
      {selectedStrategy === "custom" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Custom Payoff Order</CardTitle>
              <Button variant="outline" size="sm" onClick={resetToAvalanche}>
                Reset to Avalanche
              </Button>
            </div>
            <CardDescription>Drag to reorder. Extra payments go to the top debt first.</CardDescription>
          </CardHeader>
          <CardContent>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={customOrderedDebts.map(d => d.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {customOrderedDebts.map((debt, i) => (
                    <SortableDebtRow key={debt.id} debt={debt} index={i} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </CardContent>
        </Card>
      )}

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Projected Debt Over Time</CardTitle>
          <CardDescription>All strategies overlaid for comparison</CardDescription>
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
                <Line type="monotone" dataKey="Avalanche" stroke={CHART_COLORS.avalanche} strokeWidth={selectedStrategy === "avalanche" ? 3 : 1.5} dot={false} opacity={selectedStrategy === "avalanche" ? 1 : 0.5} />
                <Line type="monotone" dataKey="Snowball" stroke={CHART_COLORS.snowball} strokeWidth={selectedStrategy === "snowball" ? 3 : 1.5} dot={false} opacity={selectedStrategy === "snowball" ? 1 : 0.5} />
                <Line type="monotone" dataKey="Minimums Only" stroke={CHART_COLORS.minimums} strokeWidth={selectedStrategy === "minimums" ? 3 : 1.5} dot={false} opacity={selectedStrategy === "minimums" ? 1 : 0.5} />
                <Line type="monotone" dataKey="Custom" stroke={CHART_COLORS.custom} strokeWidth={selectedStrategy === "custom" ? 3 : 1.5} dot={false} opacity={selectedStrategy === "custom" ? 1 : 0.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <DebtModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        debt={editingDebt}
      />
    </div>
  )
}
