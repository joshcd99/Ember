import { addDays, addWeeks, addMonths, addYears, isBefore, startOfDay } from "date-fns"
import type { Bill, RecurrenceUnit } from "@/types/database"

const MAX_ITERATIONS = 500

interface NormalizedRecurrence {
  interval: number
  unit: RecurrenceUnit
  daysOfWeek: number[] | undefined
  endType: "never" | "on_date" | "after_occurrences"
  endDate: string | null
  endOccurrences: number | null
}

function normalizeRecurrence(bill: Bill): NormalizedRecurrence {
  if (bill.recurrence_type && bill.recurrence_unit) {
    return {
      interval: bill.recurrence_interval ?? 1,
      unit: bill.recurrence_unit,
      daysOfWeek: bill.recurrence_days_of_week,
      endType: bill.recurrence_end_type ?? "never",
      endDate: bill.recurrence_end_date ?? null,
      endOccurrences: bill.recurrence_end_occurrences ?? null,
    }
  }
  // Map legacy frequency
  switch (bill.frequency) {
    case "weekly":
      return { interval: 1, unit: "week", daysOfWeek: undefined, endType: "never", endDate: null, endOccurrences: null }
    case "biweekly":
      return { interval: 2, unit: "week", daysOfWeek: undefined, endType: "never", endDate: null, endOccurrences: null }
    case "monthly":
    default:
      return { interval: 1, unit: "month", daysOfWeek: undefined, endType: "never", endDate: null, endOccurrences: null }
  }
}

function stepDate(date: Date, interval: number, unit: RecurrenceUnit): Date {
  switch (unit) {
    case "day": return addDays(date, interval)
    case "week": return addWeeks(date, interval)
    case "month": return addMonths(date, interval)
    case "year": return addYears(date, interval)
  }
}

function isPastEnd(rec: NormalizedRecurrence, date: Date, occurrenceCount: number): boolean {
  if (rec.endType === "on_date" && rec.endDate) {
    return !isBefore(date, addDays(startOfDay(new Date(rec.endDate)), 1))
  }
  if (rec.endType === "after_occurrences" && rec.endOccurrences != null) {
    return occurrenceCount >= rec.endOccurrences
  }
  return false
}

export function getNextDueDate(bill: Bill, fromDate: Date): Date | null {
  const rec = normalizeRecurrence(bill)
  let current = startOfDay(new Date(bill.next_due_date))
  const from = startOfDay(fromDate)
  const startDateLimit = bill.start_date ? startOfDay(new Date(bill.start_date)) : null
  let iterations = 0
  let occurrenceCount = 0

  // Step forward until on or after fromDate
  while (isBefore(current, from) && iterations < MAX_ITERATIONS) {
    current = stepDate(current, rec.interval, rec.unit)
    occurrenceCount++
    iterations++
    if (isPastEnd(rec, current, occurrenceCount)) return null
  }

  // Also step forward past start_date if needed
  while (startDateLimit && isBefore(current, startDateLimit) && iterations < MAX_ITERATIONS) {
    current = stepDate(current, rec.interval, rec.unit)
    occurrenceCount++
    iterations++
    if (isPastEnd(rec, current, occurrenceCount)) return null
  }

  if (iterations >= MAX_ITERATIONS) return null
  if (isPastEnd(rec, current, occurrenceCount)) return null

  return current
}

export function getOccurrencesInRange(bill: Bill, start: Date, end: Date): Date[] {
  const rec = normalizeRecurrence(bill)
  const results: Date[] = []
  let current = startOfDay(new Date(bill.next_due_date))
  const rangeStart = startOfDay(start)
  const rangeEnd = startOfDay(end)
  const startDateLimit = bill.start_date ? startOfDay(new Date(bill.start_date)) : null
  let iterations = 0
  let occurrenceCount = 0

  // Step forward to reach the range
  while (isBefore(current, rangeStart) && iterations < MAX_ITERATIONS) {
    current = stepDate(current, rec.interval, rec.unit)
    occurrenceCount++
    iterations++
    if (isPastEnd(rec, current, occurrenceCount)) return results
  }

  // Collect occurrences within range
  while (isBefore(current, rangeEnd) && iterations < MAX_ITERATIONS) {
    if (isPastEnd(rec, current, occurrenceCount)) break
    if (!startDateLimit || !isBefore(current, startDateLimit)) {
      results.push(current)
    }
    current = stepDate(current, rec.interval, rec.unit)
    occurrenceCount++
    iterations++
  }

  return results
}

export function recurrenceToMonthlyMultiplier(bill: Bill): number {
  const rec = normalizeRecurrence(bill)
  switch (rec.unit) {
    case "day": return 30.44 / rec.interval
    case "week": return 4.33 / rec.interval
    case "month": return 1 / rec.interval
    case "year": return 1 / (12 * rec.interval)
  }
}

export function formatRecurrence(bill: Bill): string {
  if (!bill.recurrence_type || !bill.recurrence_unit) {
    // Fallback to legacy frequency
    switch (bill.frequency) {
      case "weekly": return "Weekly"
      case "biweekly": return "Every 2 weeks"
      case "monthly": return "Monthly"
      default: return "Monthly"
    }
  }

  const { recurrence_interval: interval = 1, recurrence_unit: unit } = bill
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  let base: string
  if (unit === "week" && interval === 1 && bill.recurrence_days_of_week?.length) {
    const days = bill.recurrence_days_of_week.sort((a, b) => a - b).map(d => dayNames[d])
    base = `Weekly on ${days.join(", ")}`
  } else if (unit === "week" && interval === 1) {
    base = "Weekly"
  } else if (unit === "week" && interval === 2) {
    base = "Every 2 weeks"
  } else if (unit === "month" && interval === 1) {
    base = "Monthly"
  } else if (unit === "month" && interval === 3) {
    base = "Every 3 months"
  } else if (unit === "year" && interval === 1) {
    base = "Yearly"
  } else {
    const unitLabel = interval === 1 ? unit : `${unit}s`
    base = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unitLabel}`
  }

  // Append end info
  if (bill.recurrence_end_type === "on_date" && bill.recurrence_end_date) {
    const d = new Date(bill.recurrence_end_date)
    const monthStr = d.toLocaleString("en-US", { month: "short" })
    base += ` · ends ${monthStr} ${d.getFullYear()}`
  } else if (bill.recurrence_end_type === "after_occurrences" && bill.recurrence_end_occurrences) {
    base += ` · ${bill.recurrence_end_occurrences} times`
  }

  return base
}
