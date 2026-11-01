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
import type { DebtPromoInput } from "@/hooks/useData"
import { OWNER_OPTIONS } from "@/lib/owners"
import type { Debt, DebtPromo, DebtType, PromoType } from "@/types/database"
import { DEBT_TYPE_META } from "@/lib/debt-types"
import { formatCurrency, cn } from "@/lib/utils"
import { computeInterestSavings } from "@/lib/interest-savings"
import { celebrateDebtPayoff } from "@/lib/confetti"
import { Trash2, ChevronDown, AlertTriangle, Info, Plus } from "lucide-react"

// One editable promotional balance row (string-valued for form inputs)
interface PromoDraft {
  key: string
  id?: string
  label: string
  promo_type: PromoType
  promo_apr: string
  promo_end_date: string
  promo_balance: string
  deferred_interest_accrued: string
}

let promoDraftCounter = 0
function newPromoDraft(): PromoDraft {
  return {
    key: `draft-${++promoDraftCounter}`,
    label: "",
    promo_type: "deferred_interest",
    promo_apr: "0",
    promo_end_date: "",
    promo_balance: "",
    deferred_interest_accrued: "",
  }
}

function draftFromPromo(p: DebtPromo): PromoDraft {
  return {
    key: p.id,
    id: p.id,
    label: p.label,
    promo_type: p.promo_type,
    promo_apr: String((p.promo_apr * 100).toFixed(2)),
    promo_end_date: p.promo_end_date,
    promo_balance: String(p.promo_balance),
    deferred_interest_accrued: p.deferred_interest_accrued != null ? String(p.deferred_interest_accrued) : "",
  }
}

function draftToPromo(d: PromoDraft): DebtPromoInput {
  return {
    id: d.id,
    label: d.label.trim(),
    promo_type: d.promo_type,
    promo_apr: Number(d.promo_apr) / 100 || 0,
    promo_end_date: d.promo_end_date,
    promo_balance: Number(d.promo_balance) || 0,
    deferred_interest_accrued:
      d.promo_type === "deferred_interest" && d.deferred_interest_accrued
        ? Number(d.deferred_interest_accrued)
        : null,
  }
}

interface DebtModalProps {
  open: boolean
  onClose: () => void
  debt?: Debt | null // null = add, Debt = edit
  initial?: Partial<Debt> | null // prefill values for add mode (e.g. from a synced bank account)
  onCreated?: (debt: Debt) => void | Promise<void>
}

export function DebtModal({ open, onClose, debt, initial, onCreated }: DebtModalProps) {
  const { addDebt, updateDebt, deleteDebt, saveDebtPromos } = useAppData()
  const isEdit = !!debt

  const [name, setName] = useState("")
  const [owner, setOwner] = useState("")
  const [currentBalance, setCurrentBalance] = useState("")
  const [startingBalance, setStartingBalance] = useState("")
  const [interestRate, setInterestRate] = useState("")
  const [minimumPayment, setMinimumPayment] = useState("")
  const [dueDay, setDueDay] = useState("")
  const [debtType, setDebtType] = useState<DebtType>("other")
  const [actualPayment, setActualPayment] = useState("")
  const [promoDrafts, setPromoDrafts] = useState<PromoDraft[]>([])
  const [defermentExpanded, setDefermentExpanded] = useState(false)
  const [defermentEndDate, setDefermentEndDate] = useState("")
  const [defermentAccrues, setDefermentAccrues] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (debt) {
      setName(debt.name)
      setOwner(debt.owner ?? "")
      setDebtType(debt.debt_type ?? "other")
      setCurrentBalance(String(debt.current_balance))
      setStartingBalance(String(debt.starting_balance))
      setInterestRate(String((debt.interest_rate * 100).toFixed(2)))
      setMinimumPayment(String(debt.minimum_payment))
      setDueDay(String(debt.due_day))
      setActualPayment(debt.actual_payment != null ? String(debt.actual_payment) : "")
      setPromoDrafts(
        [...(debt.promos ?? [])]
          .sort((a, b) => a.promo_end_date.localeCompare(b.promo_end_date))
          .map(draftFromPromo)
      )
      setDefermentExpanded(!!debt.deferment_end_date)
      setDefermentEndDate(debt.deferment_end_date ?? "")
      setDefermentAccrues(debt.deferment_interest_accrues ?? true)
    } else {
      setName(initial?.name ?? "")
      setOwner(initial?.owner ?? "")
      setDebtType(initial?.debt_type ?? "other")
      setCurrentBalance(initial?.current_balance != null ? String(initial.current_balance) : "")
      setStartingBalance(initial?.starting_balance != null ? String(initial.starting_balance) : "")
      setInterestRate("")
      setMinimumPayment("")
      setDueDay("")
      setActualPayment("")
      setPromoDrafts([])
      setDefermentExpanded(false)
      setDefermentEndDate("")
      setDefermentAccrues(true)
    }
    setConfirmDelete(false)
  }, [debt, initial, open])

  const handleSave = async () => {
    setSaving(true)
    try {
      // Only include optional fields when non-null to avoid Supabase
      // rejecting columns that haven't been migrated yet
      const data = {
        name,
        debt_type: debtType,
        current_balance: Number(currentBalance),
        starting_balance: Number(startingBalance) || Number(currentBalance),
        interest_rate: Number(interestRate) / 100,
        minimum_payment: Number(minimumPayment),
        due_day: Number(dueDay),
        ...(actualPayment ? { actual_payment: Number(actualPayment) } : {}),
        // Deferment: only send when set on add (older rows pattern); always
        // send on edit so clearing the section (or changing type) clears the fields
        ...(defermentEligible && defermentExpanded && defermentEndDate
          ? { deferment_end_date: defermentEndDate, deferment_interest_accrues: defermentAccrues }
          : isEdit
            ? { deferment_end_date: null, deferment_interest_accrues: true }
            : {}),
        ...(owner.trim() ? { owner: owner.trim() } : isEdit ? { owner: null } : {}),
      }
      let savedDebtId: string | null = null
      if (isEdit) {
        await updateDebt(debt.id, data)
        savedDebtId = debt.id
      } else {
        const created = await addDebt(data)
        savedDebtId = created?.id ?? null
        if (created && onCreated) await onCreated(created)
      }
      // Sync the promo set (deletes removed rows, so always run on edit)
      if (savedDebtId && (isEdit || promoDrafts.length > 0)) {
        await saveDebtPromos(savedDebtId, promoDrafts.map(draftToPromo))
      }
      onClose()
      if (isEdit && Number(currentBalance) === 0 && debt.current_balance > 0) {
        celebrateDebtPayoff()
      }
    } catch (err) {
      console.error("DebtModal save failed:", err)
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

  // Deferment is a student-loan concept; the section hides for other types
  const defermentEligible = debtType === "student_loan"
  const inDeferment = defermentEligible && defermentExpanded && !!defermentEndDate
  const valid =
    name.trim() &&
    Number(currentBalance) > 0 &&
    Number(interestRate) >= 0 &&
    // A deferred loan has no required payment yet
    (Number(minimumPayment) > 0 || inDeferment) &&
    Number(dueDay) >= 1 &&
    Number(dueDay) <= 31 &&
    promoDrafts.every(d => d.promo_end_date && Number(d.promo_balance) > 0)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${debt.name}` : "Add a Debt"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name" placeholder="e.g., Chase Visa" value={name} onChange={setName} />
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Owner</label>
              <select
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground"
              >
                <option value="">No owner</option>
                {OWNER_OPTIONS.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>

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
              placeholder={inDeferment ? "0" : "95"}
              value={minimumPayment}
              onChange={setMinimumPayment}
              hint={inDeferment ? "After deferment ends" : undefined}
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

              const formDebt: Debt = {
                id: "calc", household_id: "", name: "", debt_type: "other",
                current_balance: bal, starting_balance: Number(startingBalance) || bal,
                interest_rate: rate, minimum_payment: mp, due_day: 1,
                created_at: new Date().toISOString(), last_verified_at: null,
                actual_payment: ap,
                promos: promoDrafts
                  .filter(d => d.promo_end_date && Number(d.promo_balance) > 0)
                  .map((d, i): DebtPromo => ({
                    id: `calc-${i}`, household_id: "", debt_id: "calc",
                    label: d.label,
                    promo_type: d.promo_type,
                    promo_apr: Number(d.promo_apr) / 100 || 0,
                    promo_end_date: d.promo_end_date,
                    promo_balance: Number(d.promo_balance),
                    deferred_interest_accrued: d.deferred_interest_accrued ? Number(d.deferred_interest_accrued) : null,
                    created_at: new Date().toISOString(),
                  })),
              }
              const { interestSaved } = computeInterestSavings(formDebt)
              if (interestSaved < 1) return null
              return (
                <p className="text-xs text-success mt-1.5">
                  +{formatCurrency(extra)} extra saves ~{formatCurrency(interestSaved)} in interest
                </p>
              )
            })()}
          </div>

          {/* Promotional balances — a card can carry several at once */}
          <div className="border border-border rounded-lg">
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className={promoDrafts.length > 0 ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
                {promoDrafts.length > 0
                  ? `Promotional Balances (${promoDrafts.length})`
                  : "Promotional balances"}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setPromoDrafts(ds => [...ds, newPromoDraft()])}
              >
                <Plus className="h-3.5 w-3.5" /> Add promo
              </Button>
            </div>

            {promoDrafts.length > 0 && (
              <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                {promoDrafts.map((draft, idx) => {
                  const update = (patch: Partial<PromoDraft>) =>
                    setPromoDrafts(ds => ds.map(d => d.key === draft.key ? { ...d, ...patch } : d))
                  return (
                    <div key={draft.key} className="rounded-lg border border-border p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder={`Label (e.g. "TV purchase") — promo ${idx + 1}`}
                          value={draft.label}
                          onChange={(e) => update({ label: e.target.value })}
                          className="h-8 text-sm flex-1"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 shrink-0"
                          onClick={() => setPromoDrafts(ds => ds.filter(d => d.key !== draft.key))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => update({ promo_type: "deferred_interest" })}
                          className={cn(
                            "flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors text-left",
                            draft.promo_type === "deferred_interest"
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
                          onClick={() => update({ promo_type: "true_zero" })}
                          className={cn(
                            "flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors text-left",
                            draft.promo_type === "true_zero"
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

                      <div className="grid grid-cols-2 gap-3">
                        <Field
                          label="Promo Rate"
                          type="number"
                          suffix="%"
                          placeholder="0"
                          value={draft.promo_apr}
                          onChange={(v) => update({ promo_apr: v })}
                        />
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">Promo End Date</label>
                          <DatePicker
                            value={draft.promo_end_date}
                            onChange={(v) => update({ promo_end_date: v })}
                            placeholder="Select end date"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field
                          label="Promo Balance"
                          type="number"
                          prefix="$"
                          placeholder="0"
                          value={draft.promo_balance}
                          onChange={(v) => update({ promo_balance: v })}
                        />
                        {draft.promo_type === "deferred_interest" && (
                          <Field
                            label="Interest Accrued"
                            type="number"
                            prefix="$"
                            placeholder="0"
                            value={draft.deferred_interest_accrued}
                            onChange={(v) => update({ deferred_interest_accrued: v })}
                            hint="From your statement"
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Deferment section — student loans only */}
          {defermentEligible && (
          <div className="border border-border rounded-lg">
            <button
              type="button"
              onClick={() => setDefermentExpanded(!defermentExpanded)}
              className="flex items-center justify-between w-full px-3 py-2.5 text-sm text-left hover:bg-muted/50 rounded-lg transition-colors"
            >
              <span className={defermentExpanded ? "font-medium" : "text-muted-foreground"}>
                {defermentExpanded ? "Deferment" : "+ This loan is in deferment"}
              </span>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", defermentExpanded && "rotate-180")} />
            </button>

            {defermentExpanded && (
              <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Deferment Ends</label>
                  <DatePicker
                    value={defermentEndDate}
                    onChange={setDefermentEndDate}
                    placeholder="Select end date"
                  />
                  <p className="text-xs text-muted-foreground">
                    No payments are scheduled until this date — payoff projections,
                    cash flow, and the calendar all skip this loan until then.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Interest During Deferment</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDefermentAccrues(true)}
                      className={cn(
                        "flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors text-left",
                        defermentAccrues
                          ? "border-warning bg-warning/10 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-warning/50"
                      )}
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-warning flex-shrink-0" />
                      <div>
                        <div className="font-medium">Accrues</div>
                        <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                          Unsubsidized loans: the balance grows while deferred.
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDefermentAccrues(false)}
                      className={cn(
                        "flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors text-left",
                        !defermentAccrues
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      <Info className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      <div>
                        <div className="font-medium">Paused</div>
                        <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                          Subsidized federal loans: interest is covered for you.
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}
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
