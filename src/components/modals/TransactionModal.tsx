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
import { useAppData } from "@/contexts/DataContext"
import { DatePicker } from "@/components/ui/date-picker"

interface TransactionModalProps {
  open: boolean
  onClose: () => void
  initialDate?: string
}

export function TransactionModal({ open, onClose, initialDate }: TransactionModalProps) {
  const { addTransaction } = useAppData()

  const [label, setLabel] = useState("")
  const [amount, setAmount] = useState("")
  const [type, setType] = useState<"income" | "expense">("expense")
  const [date, setDate] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLabel("")
    setAmount("")
    setType("expense")
    setDate(initialDate ?? "")
  }, [open, initialDate])

  const handleSave = async () => {
    setSaving(true)
    try {
      await addTransaction({
        type: type === "income" ? "income" : "expense",
        amount: Number(amount),
        label,
        date,
        linked_income_source_id: null,
        linked_debt_id: null,
        is_projected: false,
      })
      onClose()
    } catch {
      // Error handling
    } finally {
      setSaving(false)
    }
  }

  const valid = label.trim() && Number(amount) > 0 && date

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>One-Time Transaction</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type toggle */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType("expense")}
                className={`flex-1 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  type === "expense"
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/50"
                }`}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => setType("income")}
                className={`flex-1 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  type === "income"
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/50"
                }`}
              >
                Income
              </button>
            </div>
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Label</label>
            <Input placeholder="e.g., Car repair, Birthday gift" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>

          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  placeholder="50"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Date</label>
              <DatePicker value={date} onChange={setDate} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !valid}>
            {saving ? "Saving..." : "Add Transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
