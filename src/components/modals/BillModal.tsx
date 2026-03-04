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
import type { Bill, Frequency, RecurrenceUnit, RecurrenceEndType } from "@/types/database"
import { CATEGORY_COLORS } from "@/lib/bill-categories"
import { Trash2, Plus, X } from "lucide-react"
import { format } from "date-fns"

interface BillModalProps {
  open: boolean
  onClose: () => void
  bill?: Bill | null
}

// Preset definitions for quick selection
const PRESETS = [
  { label: "Weekly", interval: 1, unit: "week" as RecurrenceUnit },
  { label: "Every 2 weeks", interval: 2, unit: "week" as RecurrenceUnit },
  { label: "Monthly", interval: 1, unit: "month" as RecurrenceUnit },
  { label: "Every 3 months", interval: 3, unit: "month" as RecurrenceUnit },
  { label: "Yearly", interval: 1, unit: "year" as RecurrenceUnit },
] as const

function recurrenceToLegacyFrequency(interval: number, unit: RecurrenceUnit): Frequency {
  if (unit === "week" && interval === 1) return "weekly"
  if (unit === "week" && interval === 2) return "biweekly"
  return "monthly"
}

export function BillModal({ open, onClose, bill }: BillModalProps) {
  const { addBill, updateBill, deleteBill, billCategories, addBillCategory, deleteBillCategory } = useAppData()
  const isEdit = !!bill

  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [nextDueDate, setNextDueDate] = useState("")
  const [category, setCategory] = useState("Other")
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [startDate, setStartDate] = useState("")

  // Recurrence state
  const [recurrenceInterval, setRecurrenceInterval] = useState(1)
  const [recurrenceUnit, setRecurrenceUnit] = useState<RecurrenceUnit>("month")
  const [recurrenceDaysOfWeek, setRecurrenceDaysOfWeek] = useState<number[]>([])
  const [recurrenceEndType, setRecurrenceEndType] = useState<RecurrenceEndType>("never")
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("")
  const [recurrenceEndOccurrences, setRecurrenceEndOccurrences] = useState("")
  const [showCustom, setShowCustom] = useState(false)

  // New category form
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCatName, setNewCatName] = useState("")
  const [newCatColor, setNewCatColor] = useState<string>(CATEGORY_COLORS[0])
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<string | null>(null)

  useEffect(() => {
    if (bill) {
      setName(bill.name)
      setAmount(String(bill.amount))
      setNextDueDate(bill.next_due_date)
      setCategory(bill.category)
      setStartDate(bill.start_date ?? bill.next_due_date)

      // Populate recurrence from bill fields or legacy frequency
      if (bill.recurrence_type && bill.recurrence_unit) {
        setRecurrenceInterval(bill.recurrence_interval ?? 1)
        setRecurrenceUnit(bill.recurrence_unit)
        setRecurrenceDaysOfWeek(bill.recurrence_days_of_week ?? [])
        setRecurrenceEndType(bill.recurrence_end_type ?? "never")
        setRecurrenceEndDate(bill.recurrence_end_date ?? "")
        setRecurrenceEndOccurrences(bill.recurrence_end_occurrences ? String(bill.recurrence_end_occurrences) : "")
        // Determine if custom panel should show
        const matchesPreset = PRESETS.some(p => p.interval === (bill.recurrence_interval ?? 1) && p.unit === bill.recurrence_unit)
        const hasDays = (bill.recurrence_days_of_week?.length ?? 0) > 0
        const hasEnd = (bill.recurrence_end_type ?? "never") !== "never"
        setShowCustom(!matchesPreset || hasDays || hasEnd)
      } else {
        // Map legacy frequency
        switch (bill.frequency) {
          case "weekly":
            setRecurrenceInterval(1); setRecurrenceUnit("week"); break
          case "biweekly":
            setRecurrenceInterval(2); setRecurrenceUnit("week"); break
          default:
            setRecurrenceInterval(1); setRecurrenceUnit("month")
        }
        setRecurrenceDaysOfWeek([])
        setRecurrenceEndType("never")
        setRecurrenceEndDate("")
        setRecurrenceEndOccurrences("")
        setShowCustom(false)
      }
    } else {
      setName("")
      setAmount("")
      setNextDueDate("")
      setCategory("Other")
      setStartDate(format(new Date(), "yyyy-MM-dd"))
      setRecurrenceInterval(1)
      setRecurrenceUnit("month")
      setRecurrenceDaysOfWeek([])
      setRecurrenceEndType("never")
      setRecurrenceEndDate("")
      setRecurrenceEndOccurrences("")
      setShowCustom(false)
    }
    setConfirmDelete(false)
    setShowNewCategory(false)
    setConfirmDeleteCat(null)
  }, [bill, open])

  // Active preset detection
  const activePresetIndex = showCustom
    ? -1
    : PRESETS.findIndex(p => p.interval === recurrenceInterval && p.unit === recurrenceUnit)

  const handlePresetClick = (preset: typeof PRESETS[number]) => {
    setRecurrenceInterval(preset.interval)
    setRecurrenceUnit(preset.unit)
    setRecurrenceDaysOfWeek([])
    setRecurrenceEndType("never")
    setRecurrenceEndDate("")
    setRecurrenceEndOccurrences("")
    setShowCustom(false)
  }

  const toggleDayOfWeek = (day: number) => {
    setRecurrenceDaysOfWeek(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => a - b)
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Derive recurrence_type
      let recurrenceType: string
      if (recurrenceUnit === "week" && recurrenceInterval === 1) recurrenceType = "weekly"
      else if (recurrenceUnit === "week" && recurrenceInterval === 2) recurrenceType = "biweekly"
      else if (recurrenceUnit === "month" && recurrenceInterval === 1) recurrenceType = "monthly"
      else if (recurrenceUnit === "year" && recurrenceInterval === 1) recurrenceType = "yearly"
      else recurrenceType = "custom"

      const data: Omit<Bill, "id" | "household_id"> = {
        name,
        amount: Number(amount),
        frequency: recurrenceToLegacyFrequency(recurrenceInterval, recurrenceUnit),
        next_due_date: nextDueDate,
        category,
        start_date: startDate,
        recurrence_type: recurrenceType as Bill["recurrence_type"],
        recurrence_interval: recurrenceInterval,
        recurrence_unit: recurrenceUnit,
        recurrence_days_of_week: recurrenceDaysOfWeek.length > 0 ? recurrenceDaysOfWeek : undefined,
        recurrence_end_type: recurrenceEndType,
        recurrence_end_date: recurrenceEndType === "on_date" ? recurrenceEndDate || null : null,
        recurrence_end_occurrences: recurrenceEndType === "after_occurrences" ? Number(recurrenceEndOccurrences) || null : null,
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

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return
    await addBillCategory({ name: newCatName.trim(), color: newCatColor, is_default: false })
    setCategory(newCatName.trim())
    setNewCatName("")
    setNewCatColor(CATEGORY_COLORS[0])
    setShowNewCategory(false)
  }

  const handleDeleteCategory = async (catId: string) => {
    await deleteBillCategory(catId)
    setConfirmDeleteCat(null)
  }

  const valid = name.trim() && Number(amount) > 0 && nextDueDate
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"]

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${bill.name}` : "Add a Bill"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input placeholder="e.g., Rent, Electric, Netflix" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {/* Amount + Next Due Date */}
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
              <label className="text-sm font-medium">Next Due Date</label>
              <Input
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Start Date */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Start Date</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Occurrences before this date won't appear on the calendar</p>
          </div>

          {/* Category pills */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Category</label>
            <div className="flex flex-wrap gap-2">
              {billCategories.map((cat) => (
                <div key={cat.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => setCategory(cat.name)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      category === cat.name
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    {cat.name}
                  </button>
                  {/* Delete button on hover */}
                  {confirmDeleteCat === cat.id ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id) }}
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs"
                    >
                      !
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteCat(cat.id) }}
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              {/* Add new category pill */}
              {showNewCategory ? (
                <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-1.5">
                  <Input
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Name"
                    className="h-7 w-24 text-sm"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                  />
                  <div className="flex gap-1">
                    {CATEGORY_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewCatColor(color)}
                        className={`h-4 w-4 rounded-full flex-shrink-0 ${newCatColor === color ? "ring-2 ring-primary ring-offset-1" : ""}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <Button size="sm" variant="default" className="h-7 text-xs" onClick={handleAddCategory}>
                    Add
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowNewCategory(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNewCategory(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> New
                </button>
              )}
            </div>
          </div>

          {/* Recurrence builder */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Frequency</label>
            {/* Quick presets */}
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset, i) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handlePresetClick(preset)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    activePresetIndex === i
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCustom(true)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  showCustom
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/50"
                }`}
              >
                Custom...
              </button>
            </div>

            {/* Custom recurrence panel */}
            {showCustom && (
              <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/30">
                {/* Repeat every N units */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Repeat every</span>
                  <Input
                    type="number"
                    min={1}
                    value={recurrenceInterval}
                    onChange={(e) => setRecurrenceInterval(Math.max(1, Number(e.target.value)))}
                    className="h-8 w-16 text-sm"
                  />
                  <select
                    value={recurrenceUnit}
                    onChange={(e) => setRecurrenceUnit(e.target.value as RecurrenceUnit)}
                    className="h-8 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
                  >
                    <option value="day">days</option>
                    <option value="week">weeks</option>
                    <option value="month">months</option>
                    <option value="year">years</option>
                  </select>
                </div>

                {/* Day-of-week toggles (only for weeks) */}
                {recurrenceUnit === "week" && (
                  <div className="space-y-1.5">
                    <span className="text-sm text-muted-foreground">On</span>
                    <div className="flex gap-1.5">
                      {dayLabels.map((label, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggleDayOfWeek(i)}
                          className={`h-8 w-8 rounded-full text-xs font-medium transition-colors ${
                            recurrenceDaysOfWeek.includes(i)
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* End condition */}
                <div className="space-y-2">
                  <span className="text-sm text-muted-foreground">Ends</span>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="endType"
                        checked={recurrenceEndType === "never"}
                        onChange={() => setRecurrenceEndType("never")}
                        className="accent-primary"
                      />
                      <span className="text-sm">Never</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="endType"
                        checked={recurrenceEndType === "on_date"}
                        onChange={() => setRecurrenceEndType("on_date")}
                        className="accent-primary"
                      />
                      <span className="text-sm">On date</span>
                      {recurrenceEndType === "on_date" && (
                        <Input
                          type="date"
                          value={recurrenceEndDate}
                          onChange={(e) => setRecurrenceEndDate(e.target.value)}
                          className="h-8 w-40 text-sm"
                        />
                      )}
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="endType"
                        checked={recurrenceEndType === "after_occurrences"}
                        onChange={() => setRecurrenceEndType("after_occurrences")}
                        className="accent-primary"
                      />
                      <span className="text-sm">After</span>
                      {recurrenceEndType === "after_occurrences" && (
                        <>
                          <Input
                            type="number"
                            min={1}
                            value={recurrenceEndOccurrences}
                            onChange={(e) => setRecurrenceEndOccurrences(e.target.value)}
                            className="h-8 w-16 text-sm"
                          />
                          <span className="text-sm">occurrences</span>
                        </>
                      )}
                    </label>
                  </div>
                </div>
              </div>
            )}
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
