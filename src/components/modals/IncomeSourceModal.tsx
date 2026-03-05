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
import type { IncomeSource, Frequency, RecurrenceUnit, RecurrenceEndType } from "@/types/database"
import { DatePicker } from "@/components/ui/date-picker"
import { Trash2 } from "lucide-react"

interface IncomeSourceModalProps {
  open: boolean
  onClose: () => void
  source?: IncomeSource | null
  initialDate?: string
}

// Preset definitions for quick selection
const PRESETS = [
  { label: "Weekly", interval: 1, unit: "week" as RecurrenceUnit, daysOfMonth: undefined as number[] | undefined },
  { label: "Every 2 weeks", interval: 2, unit: "week" as RecurrenceUnit, daysOfMonth: undefined as number[] | undefined },
  { label: "1st & 15th", interval: 1, unit: "month" as RecurrenceUnit, daysOfMonth: [1, 15] },
  { label: "Monthly", interval: 1, unit: "month" as RecurrenceUnit, daysOfMonth: undefined as number[] | undefined },
  { label: "Every 3 months", interval: 3, unit: "month" as RecurrenceUnit, daysOfMonth: undefined as number[] | undefined },
  { label: "Yearly", interval: 1, unit: "year" as RecurrenceUnit, daysOfMonth: undefined as number[] | undefined },
] as const

function recurrenceToLegacyFrequency(interval: number, unit: RecurrenceUnit): Frequency {
  if (unit === "week" && interval === 1) return "weekly"
  if (unit === "week" && interval === 2) return "biweekly"
  return "monthly"
}

export function IncomeSourceModal({ open, onClose, source, initialDate }: IncomeSourceModalProps) {
  const { addIncomeSource, updateIncomeSource, deleteIncomeSource } = useAppData()
  const isEdit = !!source

  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [nextExpectedDate, setNextExpectedDate] = useState("")
  const [isVariable, setIsVariable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Recurrence state
  const [recurrenceInterval, setRecurrenceInterval] = useState(1)
  const [recurrenceUnit, setRecurrenceUnit] = useState<RecurrenceUnit>("month")
  const [recurrenceDaysOfWeek, setRecurrenceDaysOfWeek] = useState<number[]>([])
  const [recurrenceDaysOfMonth, setRecurrenceDaysOfMonth] = useState<number[]>([])
  const [recurrenceEndType, setRecurrenceEndType] = useState<RecurrenceEndType>("never")
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("")
  const [recurrenceEndOccurrences, setRecurrenceEndOccurrences] = useState("")
  const [showCustom, setShowCustom] = useState(false)

  useEffect(() => {
    if (source) {
      setName(source.name)
      setAmount(String(source.amount))
      setNextExpectedDate(source.next_expected_date)
      setIsVariable(source.is_variable)

      // Populate recurrence from source fields or legacy frequency
      if (source.recurrence_type && source.recurrence_unit) {
        setRecurrenceInterval(source.recurrence_interval ?? 1)
        setRecurrenceUnit(source.recurrence_unit)
        setRecurrenceDaysOfWeek(source.recurrence_days_of_week ?? [])
        setRecurrenceDaysOfMonth(source.recurrence_days_of_month ?? [])
        setRecurrenceEndType(source.recurrence_end_type ?? "never")
        setRecurrenceEndDate(source.recurrence_end_date ?? "")
        setRecurrenceEndOccurrences(source.recurrence_end_occurrences ? String(source.recurrence_end_occurrences) : "")
        // Determine if custom panel should show
        const srcDaysOfMonth = source.recurrence_days_of_month ?? []
        const matchesPreset = PRESETS.some(p =>
          p.interval === (source.recurrence_interval ?? 1) &&
          p.unit === source.recurrence_unit &&
          JSON.stringify(p.daysOfMonth ?? []) === JSON.stringify(srcDaysOfMonth)
        )
        const hasDays = (source.recurrence_days_of_week?.length ?? 0) > 0
        const hasDaysOfMonth = srcDaysOfMonth.length > 0 && !matchesPreset
        const hasEnd = (source.recurrence_end_type ?? "never") !== "never"
        setShowCustom(!matchesPreset || hasDays || hasDaysOfMonth || hasEnd)
      } else {
        // Map legacy frequency
        switch (source.frequency) {
          case "weekly":
            setRecurrenceInterval(1); setRecurrenceUnit("week"); break
          case "biweekly":
            setRecurrenceInterval(2); setRecurrenceUnit("week"); break
          default:
            setRecurrenceInterval(1); setRecurrenceUnit("month")
        }
        setRecurrenceDaysOfWeek([])
        setRecurrenceDaysOfMonth([])
        setRecurrenceEndType("never")
        setRecurrenceEndDate("")
        setRecurrenceEndOccurrences("")
        setShowCustom(false)
      }
    } else {
      setName("")
      setAmount("")
      setNextExpectedDate(initialDate ?? "")
      setIsVariable(false)
      setRecurrenceInterval(1)
      setRecurrenceUnit("month")
      setRecurrenceDaysOfWeek([])
      setRecurrenceDaysOfMonth([])
      setRecurrenceEndType("never")
      setRecurrenceEndDate("")
      setRecurrenceEndOccurrences("")
      setShowCustom(false)
    }
    setConfirmDelete(false)
  }, [source, open])

  // Active preset detection
  const activePresetIndex = showCustom
    ? -1
    : PRESETS.findIndex(p =>
        p.interval === recurrenceInterval &&
        p.unit === recurrenceUnit &&
        JSON.stringify(p.daysOfMonth ?? []) === JSON.stringify(recurrenceDaysOfMonth)
      )

  const handlePresetClick = (preset: typeof PRESETS[number]) => {
    setRecurrenceInterval(preset.interval)
    setRecurrenceUnit(preset.unit)
    setRecurrenceDaysOfWeek([])
    setRecurrenceDaysOfMonth(preset.daysOfMonth ? [...preset.daysOfMonth] : [])
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

  const toggleDayOfMonth = (day: number) => {
    setRecurrenceDaysOfMonth(prev =>
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

      const data: Omit<IncomeSource, "id" | "household_id"> = {
        name,
        amount: Number(amount),
        frequency: recurrenceToLegacyFrequency(recurrenceInterval, recurrenceUnit),
        next_expected_date: nextExpectedDate,
        is_variable: isVariable,
        recurrence_type: recurrenceType as IncomeSource["recurrence_type"],
        recurrence_interval: recurrenceInterval,
        recurrence_unit: recurrenceUnit,
        recurrence_days_of_week: recurrenceDaysOfWeek.length > 0 ? recurrenceDaysOfWeek : undefined,
        recurrence_days_of_month: recurrenceDaysOfMonth.length > 0 ? recurrenceDaysOfMonth : undefined,
        recurrence_end_type: recurrenceEndType,
        recurrence_end_date: recurrenceEndType === "on_date" ? recurrenceEndDate || null : null,
        recurrence_end_occurrences: recurrenceEndType === "after_occurrences" ? Number(recurrenceEndOccurrences) || null : null,
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
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"]

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
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
              <label className="text-sm font-medium">Next Expected Date</label>
              <DatePicker
                value={nextExpectedDate}
                onChange={setNextExpectedDate}
              />
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
                    onChange={(e) => {
                      const newUnit = e.target.value as RecurrenceUnit
                      setRecurrenceUnit(newUnit)
                      if (newUnit !== "week") setRecurrenceDaysOfWeek([])
                      if (newUnit !== "month") setRecurrenceDaysOfMonth([])
                    }}
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

                {/* Day-of-month toggles (only for months) */}
                {recurrenceUnit === "month" && (
                  <div className="space-y-1.5">
                    <span className="text-sm text-muted-foreground">On days</span>
                    <div className="grid grid-cols-7 gap-1.5">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDayOfMonth(day)}
                          className={`h-8 w-8 rounded-full text-xs font-medium transition-colors ${
                            recurrenceDaysOfMonth.includes(day)
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {day}
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
                        name="incomeEndType"
                        checked={recurrenceEndType === "never"}
                        onChange={() => setRecurrenceEndType("never")}
                        className="accent-primary"
                      />
                      <span className="text-sm">Never</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="incomeEndType"
                        checked={recurrenceEndType === "on_date"}
                        onChange={() => setRecurrenceEndType("on_date")}
                        className="accent-primary"
                      />
                      <span className="text-sm">On date</span>
                      {recurrenceEndType === "on_date" && (
                        <DatePicker
                          value={recurrenceEndDate}
                          onChange={setRecurrenceEndDate}
                          className="w-40"
                        />
                      )}
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="incomeEndType"
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
