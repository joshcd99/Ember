import { useState, useMemo, useRef, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { EmptyState } from "@/components/EmptyState"
import { DebtModal } from "@/components/modals/DebtModal"
import { PayoffCelebrationModal } from "@/components/modals/PayoffCelebrationModal"
import { Input } from "@/components/ui/input"
import { Check, CheckCircle2, ChevronDown, CreditCard, TrendingDown, Snowflake, MinusCircle, Plus, Pencil, GripVertical, ListOrdered, Flame, Download, ArrowUpDown, AlertTriangle, Clock } from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
import { calculatePayoff, sortDebts, getPromoPrioritizedDebts, isInDeferment, type Strategy } from "@/lib/payoff-engine"
import { DEBT_TYPE_META, DEBT_TYPE_CHART_COLORS } from "@/lib/debt-types"
import { formatCurrency, formatCurrencyExact, formatPercent, formatDate, cn } from "@/lib/utils"
import { downloadCSV } from "@/lib/csv"
import {
  hasActivePromo,
  extraNeededToMakeDeadline,
  interestAtRiskFor,
  simulatePromos,
  promoDaysLeft,
  promoMonthsLeft,
} from "@/lib/promo-engine"
import { computeInterestSavings } from "@/lib/interest-savings"
import { splitByGroup, type DebtGroup } from "@/lib/debt-groups"
import { DebtGroupCard } from "@/components/DebtGroupCard"
import type { Debt, DebtType, ExtraPaymentType } from "@/types/database"

/** 3-tier APR badge: >15% red, 7-15% neutral, <7% green */
function aprBadgeVariant(rate: number): "destructive" | "default" | "success" {
  if (rate > 0.15) return "destructive"
  if (rate >= 0.07) return "default"
  return "success"
}

type DisplayStrategy = Strategy

const STRATEGY_COLORS = {
  avalanche: "#e8845a",
  snowball: "#4ade80",
  minimums: "#a8a29e",
  custom: "#c084fc",
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const FULL_MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

const strategyMeta: Record<DisplayStrategy, { label: string; description: string; icon: React.ReactNode; color: string }> = {
  avalanche: {
    label: "Avalanche",
    description: "Highest interest rate first. Maximum burn.",
    icon: <TrendingDown className="h-5 w-5" />,
    color: STRATEGY_COLORS.avalanche,
  },
  snowball: {
    label: "Snowball",
    description: "Lowest balance first. Quick wins to keep the flame alive.",
    icon: <Snowflake className="h-5 w-5" />,
    color: STRATEGY_COLORS.snowball,
  },
  minimums: {
    label: "Minimums Only",
    description: "Keep paying what you pay now — no extra. A slow smolder.",
    icon: <MinusCircle className="h-5 w-5" />,
    color: STRATEGY_COLORS.minimums,
  },
  custom: {
    label: "Custom Order",
    description: "Drag to set your own priority. Your rules.",
    icon: <ListOrdered className="h-5 w-5" />,
    color: STRATEGY_COLORS.custom,
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
  const [tableOpen, setTableOpen] = useState(false)
  const [debtSort, setDebtSort] = useState<"category" | "name" | "balance" | "progress" | "rate" | "owner">("category")
  const [celebratingDebt, setCelebratingDebt] = useState<Debt | null>(null)
  const prevDebtsRef = useRef<Debt[]>([])

  // Detect when a debt goes from positive balance to zero (payoff celebration)
  useEffect(() => {
    if (prevDebtsRef.current.length > 0) {
      for (const prev of prevDebtsRef.current) {
        if (prev.current_balance > 0.01) {
          const current = debts.find(d => d.id === prev.id)
          if (current && current.current_balance <= 0.01) {
            setCelebratingDebt(current)
            break
          }
          // Check if any promo balance was cleared before its deadline
          if (current) {
            const prevPromoTotal = (prev.promos ?? []).reduce((s, p) => s + p.promo_balance, 0)
            const promoCleared = (prev.promos ?? []).some(pp => {
              const cur = (current.promos ?? []).find(cp => cp.id === pp.id)
              const stillFuture = new Date(pp.promo_end_date + "T00:00") > new Date()
              return pp.promo_balance > 0.01 && stillFuture && (!cur || cur.promo_balance <= 0.01)
            })
            if (prevPromoTotal > 0.01 && promoCleared) {
              setCelebratingDebt(current)
              break
            }
          }
        }
      }
    }
    prevDebtsRef.current = debts
  }, [debts])

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

  // Deep link from dashboard notifications: /debts?edit=<debtId>
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const editId = searchParams.get("edit")
    if (!editId || debts.length === 0) return
    const target = debts.find(d => d.id === editId)
    if (target) {
      setEditingDebt(target)
      setModalOpen(true)
    }
    setSearchParams({}, { replace: true })
  }, [searchParams, debts, setSearchParams])

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

  // Build stacked area chart data from the selected strategy's timeline
  const selectedResult = results[selectedStrategy]
  // Sort debts by strategy priority order for the breakdown table
  const sortedDebts = useMemo(() => {
    return sortDebts(debts, selectedStrategy, customOrder.length > 0 ? customOrder : undefined)
  }, [debts, selectedStrategy, customOrder])
  const activeTypes = (Object.keys(DEBT_TYPE_META) as DebtType[]).filter(t =>
    debts.some(d => (d.debt_type ?? "other") === t)
  )

  // Convert month offset to calendar month string (e.g. "2026-03")
  const now = new Date()
  const nowYear = now.getFullYear()
  const nowMonth = now.getMonth()
  const offsetToCalMonth = (offset: number): string => {
    const abs = nowYear * 12 + nowMonth + offset
    const y = Math.floor(abs / 12)
    const m = abs % 12
    return `${y}-${String(m + 1).padStart(2, "0")}`
  }

  // Build chart data: one line per debt type + total
  // Use null after a category is paid off so the line stops
  const categoryPayoff = selectedResult.categoryPayoffMonths
  const step = Math.max(1, Math.floor(selectedResult.months / 60))
  const chartData: Array<Record<string, number | string | null>> = []

  for (let m = 0; m <= selectedResult.months; m += step) {
    const snap = selectedResult.timeline[m]
    if (!snap) continue
    const row: Record<string, number | string | null> = { calendarMonth: offsetToCalMonth(m) }
    for (const t of activeTypes) {
      const payoffMonth = categoryPayoff[t] ?? Infinity
      // Show value up to and including payoff month, null after
      row[t] = m <= payoffMonth ? Math.round((snap.typeBalances[t] ?? 0) * 100) / 100 : null
    }
    row.total = Math.round(snap.totalBalance * 100) / 100
    chartData.push(row)
  }
  // Ensure final month is included
  const lastSnap = selectedResult.timeline[selectedResult.months]
  if (lastSnap && (chartData.length === 0 || chartData[chartData.length - 1].calendarMonth !== offsetToCalMonth(selectedResult.months))) {
    const row: Record<string, number | string | null> = { calendarMonth: offsetToCalMonth(selectedResult.months) }
    for (const t of activeTypes) {
      const payoffMonth = categoryPayoff[t] ?? Infinity
      row[t] = selectedResult.months <= payoffMonth ? Math.round((lastSnap.typeBalances[t] ?? 0) * 100) / 100 : null
    }
    row.total = Math.round(lastSnap.totalBalance * 100) / 100
    chartData.push(row)
  }

  const renderDebtCard = (debt: Debt, onEdit: (d: Debt) => void) => {
    const paid = debt.starting_balance - debt.current_balance
    const pct = debt.starting_balance > 0 ? (paid / debt.starting_balance) * 100 : 0
    // Balance has grown past the original (accrued interest, e.g. deferred loans)
    const grown = paid < -0.005
    const accrued = -paid
    const defEndLabel = debt.deferment_end_date
      ? new Date(debt.deferment_end_date + "T00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : ""
    const payLabel = isInDeferment(debt)
      ? `Payments start ${defEndLabel}`
      : `Min: ${formatCurrencyExact(debt.minimum_payment)}/mo`
    const type = debt.debt_type ?? "other"
    const isPaidOff = debt.current_balance <= 0.01
    const isPromo = hasActivePromo(debt)
    const payingExtra = debt.actual_payment != null && debt.actual_payment > debt.minimum_payment
    const extraAmt = payingExtra ? debt.actual_payment! - debt.minimum_payment : 0

    // Interest savings estimate for extra payments
    const savingsResult = payingExtra && debt.interest_rate > 0 ? computeInterestSavings(debt) : null
    const minNeverPaysOff = savingsResult?.minimumNeverPaysOff ?? false
    const interestSavedEstimate = minNeverPaysOff ? 0 : savingsResult?.interestSaved ?? 0

    // Per-promo projections under the current payment pace
    const promoProjections = isPromo ? simulatePromos(debt) : []
    const promoAllOnTrack = promoProjections.every(pr => pr.willMake)
    const promoExtraNeeded = isPromo && !promoAllOnTrack ? extraNeededToMakeDeadline(debt) : 0

    return (
      <Card
        key={debt.id}
        className={cn(
          "cursor-pointer hover:border-primary/50 transition-colors",
          isPromo && !isPaidOff && "md:row-span-2",
          isPaidOff && "border-success/30 bg-success/5"
        )}
        onClick={() => onEdit(debt)}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isPaidOff ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <CreditCard className="h-5 w-5 text-muted-foreground" />
              )}
              <CardTitle className={cn("text-base", isPaidOff && "line-through text-muted-foreground")}>{debt.name}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {isPaidOff && (
                <Badge variant="success">Paid off!</Badge>
              )}
              {debtSort !== "category" && !isPaidOff && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{ backgroundColor: DEBT_TYPE_CHART_COLORS[type] + "1a", color: DEBT_TYPE_CHART_COLORS[type] }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: DEBT_TYPE_CHART_COLORS[type] }} />
                  {DEBT_TYPE_META[type].label}
                </span>
              )}
              {!isPaidOff && debt.owner && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                  {debt.owner}
                </span>
              )}
              {!isPaidOff && isInDeferment(debt) && (
                <Badge variant="secondary">
                  Deferred until {new Date(debt.deferment_end_date + "T00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                </Badge>
              )}
              {!isPaidOff && (
                <Badge variant={aprBadgeVariant(debt.interest_rate)}>
                  {formatPercent(debt.interest_rate)} APR
                </Badge>
              )}
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isPaidOff ? (
            <>
              <div className="flex items-center justify-center gap-2 py-2 text-success">
                <Flame className="h-5 w-5" />
                <span className="text-sm font-semibold">Debt demolished! {formatCurrency(debt.starting_balance)} burned down.</span>
              </div>
              <Progress value={100} />
            </>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Balance</span>
                <span className="font-semibold">{formatCurrency(debt.current_balance)}</span>
              </div>
              {grown ? (
                <>
                  {/* Balance grew past the original: the bar is the current
                      balance, split into original principal vs accrued growth */}
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-muted-foreground/25"
                      style={{ width: `${(debt.starting_balance / debt.current_balance) * 100}%` }}
                    />
                    <div
                      className="h-full bg-destructive/70"
                      style={{ width: `${(accrued / debt.current_balance) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="text-destructive font-medium">
                      +{formatCurrency(accrued)} accrued over {formatCurrency(debt.starting_balance)} original
                    </span>
                    <span className="text-muted-foreground whitespace-nowrap">{payLabel}</span>
                  </div>
                </>
              ) : (
                <>
                  <Progress value={pct} />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatCurrency(paid)} paid</span>
                    <span>{payLabel}</span>
                  </div>
                </>
              )}

              {/* Payment detail row */}
              {payingExtra && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground pt-1 border-t border-border">
                  <span>Min: {formatCurrencyExact(debt.minimum_payment)}/mo</span>
                  <span>&middot;</span>
                  <span>Paying: {formatCurrencyExact(debt.actual_payment!)}/mo</span>
                  <span>&middot;</span>
                  <span className="text-success font-medium">+{formatCurrency(extraAmt)} extra</span>
                  {minNeverPaysOff ? (
                    <>
                      <span>&middot;</span>
                      <span className="text-success">the minimum alone would never pay this off</span>
                    </>
                  ) : interestSavedEstimate > 0 && (
                    <>
                      <span>&middot;</span>
                      <span className="text-success">saves ~{formatCurrency(interestSavedEstimate)} in interest</span>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* Promotional balances — one block per promo */}
          {!isPaidOff && promoProjections.map(pr => {
            const p = pr.promo
            const endLabel = new Date(p.promo_end_date + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            const days = promoDaysLeft(p)
            const months = promoMonthsLeft(p)
            const timeLabel = days < 60 ? `${days} days` : `${months} months`
            const isDeferred = p.promo_type === "deferred_interest"

            if (isDeferred) {
              const risk = interestAtRiskFor(debt, pr)
              return (
                <div key={p.id} className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
                    <span className="font-medium">
                      {p.label ? `${p.label} — ` : ""}0% promo ends {endLabel}
                    </span>
                    <span className="text-muted-foreground">&middot; {timeLabel}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Promo balance: <span className="font-medium">{formatCurrency(p.promo_balance)}</span>
                    {(p.deferred_interest_accrued ?? 0) > 0 && (
                      <>
                        {" "}&middot; interest accrued: <span className="font-medium text-warning">{formatCurrency(p.deferred_interest_accrued!)}</span>
                      </>
                    )}
                  </p>
                  {pr.willMake ? (
                    <p className="text-xs text-success flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" />
                      On track — cleared with {pr.buffer} month{pr.buffer === 1 ? "" : "s"} to spare
                    </p>
                  ) : (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      ✗ {formatCurrency(risk)} will dump on {endLabel} — {formatCurrency(pr.projectedBalance)} projected to remain
                    </p>
                  )}
                </div>
              )
            }

            return (
              <div key={p.id} className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="font-medium">
                    {p.label ? `${p.label} — ` : ""}0% promo ends {endLabel}
                  </span>
                  <span className="text-muted-foreground">&middot; {timeLabel}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Remaining promo balance: <span className="font-medium">{formatCurrency(p.promo_balance)}</span>
                  {" "}&middot; {formatPercent(debt.interest_rate)} APR applies after
                </p>
                {pr.willMake ? (
                  <p className="text-xs text-success flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" />
                    On track to clear before deadline
                  </p>
                ) : (
                  <p className="text-xs text-warning flex items-center gap-1">
                    ✗ {formatCurrency(pr.projectedBalance)} remaining at deadline
                  </p>
                )}
              </div>
            )
          })}

          {!isPaidOff && promoExtraNeeded > 0 && (
            <p className="text-xs text-muted-foreground">
              Extra needed to clear every promo in time: <span className="font-medium">+{formatCurrency(promoExtraNeeded)}/mo</span>
            </p>
          )}
        </CardContent>
      </Card>
    )
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            downloadCSV("debts.csv",
              ["Name", "Type", "Current Balance", "Starting Balance", "APR", "Minimum Payment", "Due Day"],
              debts.map(d => [d.name, d.debt_type ?? "other", d.current_balance, d.starting_balance, +(d.interest_rate * 100).toFixed(2), d.minimum_payment, d.due_day])
            )
          }}>
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Debt
          </Button>
        </div>
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2">
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Sort:</span>
        {([
          { value: "category", label: "Category" },
          { value: "name", label: "Name" },
          { value: "balance", label: "Balance" },
          { value: "progress", label: "Progress" },
          { value: "rate", label: "Rate" },
          { value: "owner", label: "Owner" },
        ] as const).map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setDebtSort(opt.value)}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs border transition-colors",
              debtSort === opt.value
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/50"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Debt cards — debts sharing a group render as one combined card */}
      {(() => {
        const { ungrouped, groups } = splitByGroup(debts)
        const debtProgress = (d: Debt) => d.starting_balance > 0 ? (d.starting_balance - d.current_balance) / d.starting_balance : 0
        const groupDominantType = (g: DebtGroup): DebtType => {
          const counts = new Map<DebtType, number>()
          for (const d of g.debts) {
            const t = (d.debt_type ?? "other") as DebtType
            counts.set(t, (counts.get(t) ?? 0) + 1)
          }
          return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
        }

        if (debtSort === "category") {
          const typeOrder = Object.keys(DEBT_TYPE_META) as DebtType[]
          const grouped = typeOrder
            .map(type => ({
              type,
              meta: DEBT_TYPE_META[type],
              color: DEBT_TYPE_CHART_COLORS[type],
              debts: ungrouped
                .filter(d => (d.debt_type ?? "other") === type)
                .sort((a, b) => a.name.localeCompare(b.name)),
              groups: groups.filter(g => groupDominantType(g) === type),
            }))
            .filter(g => g.debts.length > 0 || g.groups.length > 0)

          return grouped.map((group, gi) => (
            <div key={group.type} className="space-y-3">
              <div className={cn("flex items-center gap-2", gi > 0 && "pt-2")}>
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                <span className="text-xs font-medium text-muted-foreground">{group.meta.pluralLabel}</span>
                <div className="flex-1 border-t border-border" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start grid-flow-dense">
                {group.groups.map(g => <DebtGroupCard key={g.name} group={g} onEditDebt={openEdit} />)}
                {group.debts.map(debt => renderDebtCard(debt, openEdit))}
              </div>
            </div>
          ))
        }

        // Other sorts: groups participate as one unit, sorted by their aggregates
        type CardItem = { kind: "debt"; debt: Debt } | { kind: "group"; group: DebtGroup }
        const items: CardItem[] = [
          ...groups.map(group => ({ kind: "group" as const, group })),
          ...ungrouped.map(debt => ({ kind: "debt" as const, debt })),
        ]
        const keyOf = (item: CardItem) => item.kind === "group"
          ? {
              name: item.group.name,
              balance: item.group.totalBalance,
              progress: item.group.totalStarting > 0 ? (item.group.totalStarting - item.group.totalBalance) / item.group.totalStarting : 0,
              rate: item.group.weightedApr,
              owner: item.group.owner,
            }
          : {
              name: item.debt.name,
              balance: item.debt.current_balance,
              progress: debtProgress(item.debt),
              rate: item.debt.interest_rate,
              owner: item.debt.owner,
            }
        const sorted = items.sort((a, b) => {
          const ka = keyOf(a), kb = keyOf(b)
          switch (debtSort) {
            case "name": return ka.name.localeCompare(kb.name)
            case "balance": return kb.balance - ka.balance
            case "progress": return kb.progress - ka.progress
            case "rate": return kb.rate - ka.rate
            // Unowned debts sort last
            case "owner": return (ka.owner ?? "￿").localeCompare(kb.owner ?? "￿") || ka.name.localeCompare(kb.name)
            default: return 0
          }
        })

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start grid-flow-dense">
            {sorted.map(item => item.kind === "group"
              ? <DebtGroupCard key={item.group.name} group={item.group} onEditDebt={openEdit} />
              : renderDebtCard(item.debt, openEdit))}
          </div>
        )
      })()}

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
                  {!result.paidOff ? (
                    <p className="text-sm text-destructive">
                      Never pays off at this rate — the payments don't cover the
                      monthly interest, so the balance keeps growing.
                    </p>
                  ) : (
                    <>
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
                    </>
                  )}
                  {result.debtPayoffOrder.length > 0 && (
                    <div className="pt-2 border-t border-border mt-2">
                      <p className="text-xs text-muted-foreground mb-2">Payoff order:</p>
                      <div className="space-y-2">
                        {(() => {
                          // Consecutive loans from the same group collapse to one row
                          type OrderRow = { key: string; label: string; month: number; count: number; debt?: Debt; balance: number; forgiven?: boolean }
                          const rows: OrderRow[] = []
                          for (const d of result.debtPayoffOrder) {
                            const debt = debts.find(db => db.id === d.id)
                            const g = debt?.group_name?.trim()
                            const last = rows[rows.length - 1]
                            if (g && last && last.key === `group:${g}`) {
                              last.month = Math.max(last.month, d.month)
                              last.count++
                              last.balance += debt?.current_balance ?? 0
                              last.forgiven = last.forgiven || d.forgiven
                            } else if (g) {
                              rows.push({ key: `group:${g}`, label: g, month: d.month, count: 1, balance: debt?.current_balance ?? 0, forgiven: d.forgiven })
                            } else {
                              rows.push({ key: d.id, label: d.name, month: d.month, count: 1, debt, balance: debt?.current_balance ?? 0, forgiven: d.forgiven })
                            }
                          }
                          return rows.map((row, i) => {
                            const payoffDate = new Date()
                            payoffDate.setMonth(payoffDate.getMonth() + row.month)
                            const dateLabel = payoffDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })
                            return (
                              <div key={row.key}>
                                <p className="text-xs font-medium">
                                  {i + 1}. {row.label}{row.count > 1 ? ` (${row.count} loans)` : ""}
                                </p>
                                <p className="text-[10px] text-muted-foreground ml-3.5">
                                  {dateLabel}
                                  {row.debt
                                    ? <> · {formatPercent(row.debt.interest_rate)} · {formatCurrency(row.debt.current_balance)}</>
                                    : row.count > 1 && <> · {formatCurrency(row.balance)}</>}
                                  {row.forgiven && <> · remainder forgiven (RAP)</>}
                                </p>
                              </div>
                            )
                          })
                        })()}
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

        {/* Promo urgency note */}
        {getPromoPrioritizedDebts(debts).length > 0 && (
          <div className="flex items-start gap-2 mt-3 text-xs text-warning bg-warning/5 border border-warning/20 rounded-lg p-3">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Deferred interest deadline on {getPromoPrioritizedDebts(debts).join(", ")} — prioritized above rate order.
            </span>
          </div>
        )}
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

      {/* Debt projection chart */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Projected Debt Over Time</CardTitle>
          <CardDescription>
            {strategyMeta[selectedStrategy].label} strategy — by debt type
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="calendarMonth"
                  tickFormatter={(value: string) => {
                    const [y, m] = value.split("-").map(Number)
                    return `${MONTH_NAMES[m - 1]} '${String(y).slice(2)}`
                  }}
                  interval="preserveStartEnd"
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                />
                <YAxis
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 12 }}
                  className="fill-muted-foreground"
                />
                <Tooltip
                  formatter={(value, name) => {
                    const label = name === "total" ? "Total" : (DEBT_TYPE_META[name as DebtType]?.pluralLabel ?? name)
                    return [formatCurrency(Number(value)), label]
                  }}
                  labelFormatter={(label) => {
                    const [y, m] = String(label).split("-").map(Number)
                    return `${FULL_MONTH_NAMES[m - 1]} ${y}`
                  }}
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                    borderRadius: "0.5rem",
                    color: "var(--fg)",
                  }}
                />
                {/* Total balance line */}
                <Line
                  type="linear"
                  dataKey="total"
                  stroke="var(--fg)"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  opacity={0.4}
                />
                {/* Per-type lines */}
                {activeTypes.map(t => (
                  <Line
                    key={t}
                    type="linear"
                    dataKey={t}
                    stroke={DEBT_TYPE_CHART_COLORS[t]}
                    strokeWidth={2.5}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Legend with payoff dates */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 justify-center">
            <div className="flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed" style={{ borderColor: "var(--fg)", opacity: 0.4 }} />
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
            {activeTypes.map(t => {
              const m = selectedResult.categoryPayoffMonths[t]
              let payoffLabel = ""
              if (m != null && m > 0) {
                const cal = offsetToCalMonth(m)
                const [y, mo] = cal.split("-").map(Number)
                payoffLabel = ` — paid off ${MONTH_NAMES[mo - 1]} '${String(y).slice(2)}`
              }
              return (
                <div key={t} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DEBT_TYPE_CHART_COLORS[t] }} />
                  <span className="text-xs text-muted-foreground">
                    {DEBT_TYPE_META[t].pluralLabel}{payoffLabel}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Collapsible monthly balance table */}
          <div className="flex items-center gap-2 mt-4">
            <button
              type="button"
              onClick={() => setTableOpen(o => !o)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", !tableOpen && "-rotate-90")} />
              Monthly breakdown
            </button>
            {tableOpen && (
              <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => {
                const headers = ["Month", ...sortedDebts.flatMap(d => [`${d.name} Balance`, `${d.name} Payment`]), "Total"]
                const rows = selectedResult.timeline.map((snap) => {
                  const cal = offsetToCalMonth(snap.month)
                  const [y, m] = cal.split("-").map(Number)
                  const label = `${MONTH_NAMES[m - 1]} '${String(y).slice(2)}`
                  const total = Object.values(snap.balances).reduce((s, b) => s + b, 0)
                  const prevSnap = snap.month > 0 ? selectedResult.timeline[snap.month - 1] : null
                  const cells: (string | number)[] = [label]
                  for (const d of sortedDebts) {
                    const bal = snap.balances[d.id] ?? 0
                    let payment = 0
                    if (prevSnap && snap.month > 0) {
                      const prevBal = prevSnap.balances[d.id] ?? 0
                      const afterInterest = prevBal * (1 + d.interest_rate / 12)
                      payment = Math.max(0, +(afterInterest - bal).toFixed(2))
                    }
                    cells.push(+bal.toFixed(2), payment)
                  }
                  cells.push(+total.toFixed(2))
                  return cells
                }).filter(row => {
                  const total = row[row.length - 1]
                  return typeof total !== "number" || total >= 0.01 || row[0] === `${MONTH_NAMES[new Date().getMonth()]} '${String(new Date().getFullYear()).slice(2)}`
                })
                downloadCSV("monthly-breakdown.csv", headers, rows)
              }}>
                <Download className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {tableOpen && (
            <div className="mt-2 overflow-auto max-w-full max-h-96 rounded-lg border border-border">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50 sticky top-0 z-10">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-muted/50">Month</th>
                    {sortedDebts.map(d => (
                      <th key={d.id} className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{d.name}</th>
                    ))}
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedResult.timeline.map((snap) => {
                    const cal = offsetToCalMonth(snap.month)
                    const [y, m] = cal.split("-").map(Number)
                    const label = `${MONTH_NAMES[m - 1]} '${String(y).slice(2)}`
                    const total = Object.values(snap.balances).reduce((s, b) => s + b, 0)
                    if (total < 0.01 && snap.month !== 0) return null
                    const prevSnap = snap.month > 0 ? selectedResult.timeline[snap.month - 1] : null
                    return (
                      <tr key={snap.month} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-1.5 text-muted-foreground sticky left-0 bg-card">{label}</td>
                        {sortedDebts.map(d => {
                          const bal = snap.balances[d.id]
                          // Payment = previous balance after interest - current balance
                          let payment = 0
                          if (prevSnap && snap.month > 0) {
                            const prevBal = prevSnap.balances[d.id] ?? 0
                            const afterInterest = prevBal * (1 + d.interest_rate / 12)
                            payment = Math.max(0, afterInterest - bal)
                          }
                          return (
                            <td key={d.id} className="text-right px-3 py-1.5 tabular-nums">
                              {bal > 0.01 ? (
                                <div>
                                  <div>{formatCurrency(bal)}</div>
                                  {payment > 0.01 && <div className="text-[10px] text-success">-{formatCurrency(payment)}</div>}
                                </div>
                              ) : prevSnap && (prevSnap.balances[d.id] ?? 0) > 0.01 ? (
                                <div>
                                  <span className="text-success">Paid</span>
                                  {payment > 0.01 && <div className="text-[10px] text-success">-{formatCurrency(payment)}</div>}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          )
                        })}
                        <td className="text-right px-3 py-1.5 font-medium tabular-nums">{formatCurrency(total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <DebtModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        debt={editingDebt}
      />

      <PayoffCelebrationModal
        open={!!celebratingDebt}
        onClose={() => setCelebratingDebt(null)}
        debt={celebratingDebt}
      />
    </div>
  )
}
