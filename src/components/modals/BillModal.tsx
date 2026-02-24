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
import type { Bill, Frequency } from "@/types/database"
import { Trash2 } from "lucide-react"

const CATEGORIES = ["housing", "utilities", "insurance", "subscriptions", "food", "transport", "other"] as const

interface BillModalProps {
  open: boolean
  onClose: () => void
  bill?: Bill | null
}

export function BillModal({ open, onClose, bill }: BillModalProps) {
  const { addBill, updateBill, deleteBill } = useAppData()
  const isEdit = !!bill

  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [frequency, setFrequency] = useState<Frequency>("monthly")
  const [nextDueDate, setNextDueDate] = useState("")
  const [category, setCategory] = useState("other")
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (bill) {
      setName(bill.name)
      setAmount(String(bill.amount))
      setFrequency(bill.frequency)
      setNextDueDate(bill.next_due_date)
      setCategory(bill.category)
    } else {
      setName("")
      setAmount("")
      setFrequency("monthly")
      setNextDueDate("")
      setCategory("other")
    }
    setConfirmDelete(false)
  }, [bill, open])

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = {
        name,
        amount: Number(amount),
        frequency,
        next_due_date: nextDueDate,
        category,
      }
      if (isEdit) {
        await updateBill(bill.id, data)
      } else {
        await addBill(data)
      }
      onClose()
    } catch {
      // Error handling
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
      await deleteBill(bill!.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const valid = name.trim() && Number(amount) > 0 && nextDueDate

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${bill.name}` : "Add a Bill"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input placeholder="e.g., Rent, Electric, Netflix" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  placeholder="120"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as Frequency)}
                className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Next Due Date</label>
              <Input
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

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
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Bill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
