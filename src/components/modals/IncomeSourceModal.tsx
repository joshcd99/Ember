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
import type { IncomeSource, Frequency } from "@/types/database"
import { Trash2 } from "lucide-react"

interface IncomeSourceModalProps {
  open: boolean
  onClose: () => void
  source?: IncomeSource | null
}

export function IncomeSourceModal({ open, onClose, source }: IncomeSourceModalProps) {
  const { addIncomeSource, updateIncomeSource, deleteIncomeSource } = useAppData()
  const isEdit = !!source

  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [frequency, setFrequency] = useState<Frequency>("monthly")
  const [nextExpectedDate, setNextExpectedDate] = useState("")
  const [isVariable, setIsVariable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (source) {
      setName(source.name)
      setAmount(String(source.amount))
      setFrequency(source.frequency)
      setNextExpectedDate(source.next_expected_date)
      setIsVariable(source.is_variable)
    } else {
      setName("")
      setAmount("")
      setFrequency("monthly")
      setNextExpectedDate("")
      setIsVariable(false)
    }
    setConfirmDelete(false)
  }, [source, open])

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = {
        name,
        amount: Number(amount),
        frequency,
        next_expected_date: nextExpectedDate,
        is_variable: isVariable,
      }
      if (isEdit) {
        await updateIncomeSource(source.id, data)
      } else {
        await addIncomeSource(data)
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
      await deleteIncomeSource(source!.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const valid = name.trim() && Number(amount) > 0 && nextExpectedDate

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${source.name}` : "Add Income Source"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input placeholder="e.g., Day Job, Freelance" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  placeholder="2,800"
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

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Next Expected Date</label>
            <Input
              type="date"
              value={nextExpectedDate}
              onChange={(e) => setNextExpectedDate(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isVariable}
              onChange={(e) => setIsVariable(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <div>
              <span className="text-sm font-medium">Variable amount</span>
              <p className="text-xs text-muted-foreground">Amount changes each period (e.g., freelance, tips)</p>
            </div>
          </label>
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
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Source"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
