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
import type { Debt } from "@/types/database"
import { formatCurrency } from "@/lib/utils"
import { Trash2 } from "lucide-react"

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
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (debt) {
      setName(debt.name)
      setCurrentBalance(String(debt.current_balance))
      setStartingBalance(String(debt.starting_balance))
      setInterestRate(String((debt.interest_rate * 100).toFixed(2)))
      setMinimumPayment(String(debt.minimum_payment))
      setDueDay(String(debt.due_day))
    } else {
      setName("")
      setCurrentBalance("")
      setStartingBalance("")
      setInterestRate("")
      setMinimumPayment("")
      setDueDay("")
    }
    setConfirmDelete(false)
  }, [debt, open])

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = {
        name,
        current_balance: Number(currentBalance),
        starting_balance: Number(startingBalance) || Number(currentBalance),
        interest_rate: Number(interestRate) / 100,
        minimum_payment: Number(minimumPayment),
        due_day: Number(dueDay),
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
