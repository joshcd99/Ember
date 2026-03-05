import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { useAppData } from "@/contexts/DataContext"
import type { Debt, DebtType, PromoType } from "@/types/database"
import { DEBT_TYPE_META } from "@/lib/debt-types"
import { formatCurrency, cn } from "@/lib/utils"
import { calculatePayoff } from "@/lib/payoff-engine"
import { interestAtRisk, projectedBalanceAtPromoEnd, willMakeDeadline } from "@/lib/promo-engine"
import { Trash2, ChevronDown, AlertTriangle, Info } from "lucide-react"

interface DebtModalProps {
  open: boolean
  onClose: () => void
  debt?: Debt | null // null = add, Debt = edit
}

export function DebtModal({ open, onClose, debt }: DebtModalProps) {
  const { addDebt, updateDebt, deleteDebt } = useAppData()
  const isEdit = !!debt

  const [name, setName] = useState("")
  const [currentBalance, setCurrentBalance] = useState("")
  const [startingBalance, setStartingBalance] = useState("")
  const [interestRate, setInterestRate] = useState("")
  const [minimumPayment, setMinimumPayment] = useState("")
  const [dueDay, setDueDay] = useState("")
  const [debtType, setDebtType] = useState<DebtType>("other")
  const [actualPayment, setActualPayment] = useState("")
  const [promoExpanded, setPromoExpanded] = useState(false)
  const [promoType, setPromoType] = useState<PromoType>("deferred_interest")
  const [promoApr, setPromoApr] = useState("0")
  const [promoEndDate, setPromoEndDate] = useState("")
  const [promoBalance, setPromoBalance] = useState("")
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (debt) {
      setName(debt.name)
      setDebtType(debt.debt_type ?? "other")
      setCurrentBalance(String(debt.current_balance))
      setStartingBalance(String(debt.starting_balance))
      setInterestRate(String((debt.interest_rate * 100).toFixed(2)))
      setMinimumPayment(String(debt.minimum_payment))
      setDueDay(String(debt.due_day))
      setActualPayment(debt.actual_payment != null ? String(debt.actual_payment) : "")
      // Promo fields
      const hasPromo = !!debt.promo_type
      setPromoExpanded(hasPromo)
      setPromoType(debt.promo_type ?? "deferred_interest")
      setPromoApr(debt.promo_apr != null ? String((debt.promo_apr * 100).toFixed(2)) : "0")
      setPromoEndDate(debt.promo_end_date ?? "")
      setPromoBalance(debt.promo_balance != null ? String(debt.promo_balance) : "")
    } else {
      setName("")
      setDebtType("other")
      setCurrentBalance("")
      setStartingBalance("")
      setInterestRate("")
      setMinimumPayment("")
      setDueDay("")
      setActualPayment("")
      setPromoExpanded(false)
      setPromoType("deferred_interest")
      setPromoApr("0")
      setPromoEndDate("")
      setPromoBalance("")
    }
    setConfirmDelete(false)
  }, [debt, open])

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = {
        name,
        debt_type: debtType,
        current_balance: Number(currentBalance),
        starting_balance: Number(startingBalance) || Number(currentBalance),
        interest_rate: Number(interestRate) / 100,
        minimum_payment: Number(minimumPayment),
        due_day: Number(dueDay),
        actual_payment: actualPayment ? Number(actualPayment) : null,
        promo_type: promoExpanded ? promoType : null,
        promo_apr: promoExpanded ? Number(promoApr) / 100 : null,
        promo_end_date: promoExpanded && promoEndDate ? promoEndDate : null,
        promo_balance: promoExpanded && promoBalance ? Number(promoBalance) : null,
        regular_apr: promoExpanded ? Number(interestRate) / 100 : null,
      }
      if (isEdit) {
        await updateDebt(debt.id, data)
      } else {
        await addDebt(data)
      }
      onClose()
    } catch {
      // Error handling could be improved
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setSaving(true)
    try {
      await deleteDebt(debt!.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  // Individual payoff projection chart (edit mode only)
  const chartData = isEdit ? buildPayoffChart(debt) : []

  const valid =
    name.trim() &&
    Number(currentBalance) > 0 &&
    Number(interestRate) >= 0 &&
    Number(minimumPayment) > 0 &&
    Number(dueDay) >= 1 &&
    Number(dueDay) <= 31

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${debt.name}` : "Add a Debt"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Name" placeholder="e.g., Chase Visa" value={name} onChange={setName} />

          {/* Debt type selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Type</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(DEBT_TYPE_META) as DebtType[]).map(type => {
                const meta = DEBT_TYPE_META[type]
                const isSelected = debtType === type
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setDebtType(type)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: meta.color }} />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Current Balance"
              type="number"
              prefix="$"
              placeholder="4,200"
              value={currentBalance}
              onChange={setCurrentBalance}
            />
            <Field
              label="Starting Balance"
              type="number"
              prefix="$"
              placeholder="Optional"
              value={startingBalance}
              onChange={setStartingBalance}
              hint="Defaults to current balance"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field
              label="Interest Rate"
              type="number"
              suffix="%"
              placeholder="21.99"
              value={interestRate}
              onChange={setInterestRate}
            />
            <Field
              label="Minimum Payment"
              type="number"
              prefix="$"
              placeholder="95"
              value={minimumPayment}
              onChange={setMinimumPayment}
            />
            <Field
              label="Due Day"
              type="number"
              placeholder="15"
              value={dueDay}
              onChange={setDueDay}
              hint="1–31"
            />
          </div>

          {/* Actually paying field */}
          <div>
            <Field
              label="Actually Paying"
              type="number"
              prefix="$"
              placeholder="Leave blank to use minimum"
              value={actualPayment}
              onChange={setActualPayment}
              hint="What you're actually paying monthly on this debt"
            />
            {(() => {
              const ap = Number(actualPayment)
              const mp = Number(minimumPayment)
              const bal = Number(currentBalance)
              const rate = Number(interestRate) / 100
              if (!ap || !mp || ap <= mp || !bal || bal <= 0) return null
              const extra = ap - mp

              const isDeferred = promoExpanded && promoType === "deferred_interest" && promoEndDate
              const pBal = promoExpanded && promoBalance ? Number(promoBalance) : bal
              const pApr = promoExpanded ? Number(promoApr) / 100 : rate

              if (isDeferred && pBal > 0) {
                // Build debt objects from form values for promo engine
                const formDebt: Debt = {
                  id: "calc", household_id: "", name: "", debt_type: "other",
                  current_balance: bal, starting_balance: Number(startingBalance) || bal,
                  interest_rate: rate, minimum_payment: mp, due_day: 1,
                  created_at: new Date().toISOString(), last_verified_at: null,
                  promo_type: "deferred_interest",
                  promo_apr: pApr,
                  promo_end_date: promoEndDate,
                  promo_balance: pBal,
                  actual_payment: ap,
                }
                const minFormDebt: Debt = { ...formDebt, actual_payment: null }

                // Deferred interest at deadline = current_balance × monthly_rate × total_promo_months
                const deferredDump = interestAtRisk(formDebt)

                // Minimum path: misses deadline → dump + post-dump interest
                const projBal = projectedBalanceAtPromoEnd(minFormDebt)
                const postDumpBalance = projBal + deferredDump
                if (postDumpBalance <= 0.01) return null

                const syntheticDebt: Debt = {
                  ...formDebt,
                  current_balance: postDumpBalance,
                  starting_balance: postDumpBalance,
                  minimum_payment: mp,
                  promo_type: null, promo_apr: null,
                  promo_end_date: null, promo_balance: null,
                  actual_payment: null,
                }
                const minResult = calculatePayoff([syntheticDebt], "minimums")
                const minTotal = deferredDump + minResult.totalInterest

                // Actual payment path: if beats deadline, total interest = $0
                let actualTotal = 0
                if (!willMakeDeadline(formDebt)) {
                  const actualProjBal = projectedBalanceAtPromoEnd(formDebt)
                  const actualPostDump = actualProjBal + deferredDump
                  if (actualPostDump > 0.01) {
                    const actualSynthetic: Debt = {
                      ...syntheticDebt,
                      current_balance: actualPostDump,
                      starting_balance: actualPostDump,
                      minimum_payment: ap,
                    }
                    const actualResult = calculatePayoff([actualSynthetic], "minimums")
                    actualTotal = deferredDump + actualResult.totalInterest
                  }
                }

                const saved = Math.max(0, minTotal - actualTotal)
                if (saved < 1) return null
                return (
                  <p className="text-xs text-success mt-1.5">
                    +{formatCurrency(extra)} extra saves ~{formatCurrency(saved)} in interest
                  </p>
                )
              }

              // Standard path: no deferred interest
              const fakeDebt: Debt = {
                id: "calc", household_id: "", name: "", debt_type: "other",
                current_balance: bal, starting_balance: bal,
                interest_rate: rate, minimum_payment: mp, due_day: 1,
                created_at: new Date().toISOString(), last_verified_at: null,
              }
              const minResult = calculatePayoff([fakeDebt], "minimums")
              const actualResult = calculatePayoff([{ ...fakeDebt, minimum_payment: ap }], "minimums")
              const saved = Math.max(0, minResult.totalInterest - actualResult.totalInterest)
              if (saved < 1) return null
              return (
                <p className="text-xs text-success mt-1.5">
                  +{formatCurrency(extra)} extra saves ~{formatCurrency(saved)} in interest
                </p>
              )
            })()}
          </div>

          {/* Promotional balance section */}
          <div className="border border-border rounded-lg">
            <button
              type="button"
              onClick={() => setPromoExpanded(!promoExpanded)}
              className="flex items-center justify-between w-full px-3 py-2.5 text-sm text-left hover:bg-muted/50 rounded-lg transition-colors"
            >
              <span className={promoExpanded ? "font-medium" : "text-muted-foreground"}>
                {promoExpanded ? "Promotional Balance" : "+ This debt has a promotional rate"}
              </span>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", promoExpanded && "rotate-180")} />
            </button>

            {promoExpanded && (
              <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                {/* Promo type selector */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Promo Type</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPromoType("deferred_interest")}
                      className={cn(
                        "flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors text-left",
                        promoType === "deferred_interest"
                          ? "border-warning bg-warning/10 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-warning/50"
                      )}
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-warning flex-shrink-0" />
                      <div>
                        <div className="font-medium">Deferred Interest</div>
                        <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                          Interest accumulates silently. Most store cards &amp; BNPL.
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromoType("true_zero")}
                      className={cn(
                        "flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors text-left",
                        promoType === "true_zero"
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      <Info className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      <div>
                        <div className="font-medium">True 0%</div>
                        <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                          No hidden interest. Most balance transfer cards.
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Promo Rate"
                    type="number"
                    suffix="%"
                    placeholder="0"
                    value={promoApr}
                    onChange={setPromoApr}
                  />
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Promo End Date</label>
                    <DatePicker
                      value={promoEndDate}
                      onChange={setPromoEndDate}
                      placeholder="Select end date"
                    />
                  </div>
                </div>
                <Field
                  label="Promo Balance"
                  type="number"
                  prefix="$"
                  placeholder={currentBalance || "0"}
                  value={promoBalance}
                  onChange={setPromoBalance}
                  hint="Defaults to current balance"
                />
              </div>
            )}
          </div>
        </div>

        {/* Individual payoff chart for edit mode */}
        {isEdit && chartData.length > 1 && (
          <div className="mt-4">
            <p className="text-sm font-medium mb-2 text-muted-foreground">
              Payoff projection (minimum payments only)
            </p>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    labelFormatter={(l) => `Month ${l}`}
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: "0.5rem",
                      color: "var(--fg)",
                    }}
                  />
                  <Line type="monotone" dataKey="balance" stroke="#e8845a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <DialogFooter>
          {isEdit && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
              className="mr-auto"
            >
              <Trash2 className="h-4 w-4" />
              {confirmDelete ? "Confirm delete" : "Delete"}
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !valid}>
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Debt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  prefix,
  suffix,
  hint,
}: {
  label: string
  type?: string
  placeholder?: string
  value: string
  onChange: (v: string) => void
  prefix?: string
  suffix?: string
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
            {prefix}
          </span>
        )}
        <Input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${prefix ? "pl-7" : ""} ${suffix ? "pr-7" : ""}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function buildPayoffChart(debt: Debt) {
  const data: Array<{ month: number; balance: number }> = []
  let balance = debt.current_balance
  const monthlyRate = debt.interest_rate / 12
  let month = 0

  data.push({ month, balance })

  while (balance > 0.01 && month < 600) {
    month++
    balance = balance * (1 + monthlyRate)
    const payment = Math.min(balance, debt.minimum_payment)
    balance -= payment
    // Sample every few months if long payoff
    const step = month < 60 ? 1 : 3
    if (month % step === 0 || balance <= 0.01) {
      data.push({ month, balance: Math.max(0, balance) })
    }
  }

  return data
}
