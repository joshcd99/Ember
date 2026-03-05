import { addDays, addWeeks, addMonths, addYears, isBefore, startOfDay } from "date-fns"
import type { Bill, IncomeSource, RecurrenceUnit } from "@/types/database"

const MAX_ITERATIONS = 500

/** Any record with recurrence fields + a date anchor */
export type Recurrent = (Bill | IncomeSource) & {
  recurrence_type?: string
  recurrence_interval?: number
  recurrence_unit?: RecurrenceUnit
  recurrence_days_of_week?: number[]
  recurrence_end_type?: string
  recurrence_end_date?: string | null
  recurrence_end_occurrences?: number | null
}

/** Get the anchor date string from a recurrent item */
function getAnchorDate(item: Recurrent): string {
  if ("next_due_date" in item) return item.next_due_date
  return item.next_expected_date
}

interface NormalizedRecurrence {
  interval: number
  unit: RecurrenceUnit
  daysOfWeek: number[] | undefined
  endType: "never" | "on_date" | "after_occurrences"
  endDate: string | null
  endOccurrences: number | null
}

export function normalizeRecurrence(item: Recurrent): NormalizedRecurrence {
  if (item.recurrence_type && item.recurrence_unit) {
    return {
      interval: item.recurrence_interval ?? 1,
      unit: item.recurrence_unit,
      daysOfWeek: item.recurrence_days_of_week,
      endType: (item.recurrence_end_type as NormalizedRecurrence["endType"]) ?? "never",
      endDate: item.recurrence_end_date ?? null,
      endOccurrences: item.recurrence_end_occurrences ?? null,
    }
  }
  // Map legacy frequency
  switch (item.frequency) {
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

export function getNextDueDate(item: Recurrent, fromDate: Date): Date | null {
  const rec = normalizeRecurrence(item)
  let current = startOfDay(new Date(getAnchorDate(item)))
  const from = startOfDay(fromDate)
  let iterations = 0
  let occurrenceCount = 0

  // Step forward until on or after fromDate
  while (isBefore(current, from) && iterations < MAX_ITERATIONS) {
    current = stepDate(current, rec.interval, rec.unit)
    occurrenceCount++
    iterations++
    if (isPastEnd(rec, current, occurrenceCount)) return null
  }

  if (iterations >= MAX_ITERATIONS) return null
  if (isPastEnd(rec, current, occurrenceCount)) return null

  return current
}

export function getOccurrencesInRange(item: Recurrent, start: Date, end: Date): Date[] {
  const rec = normalizeRecurrence(item)
  const results: Date[] = []
  let current = startOfDay(new Date(getAnchorDate(item)))
  const rangeStart = startOfDay(start)
  const rangeEnd = startOfDay(end)
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
    results.push(current)
    current = stepDate(current, rec.interval, rec.unit)
    occurrenceCount++
    iterations++
  }

  return results
}

export function recurrenceToMonthlyMultiplier(item: Recurrent): number {
  const rec = normalizeRecurrence(item)
  switch (rec.unit) {
    case "day": return 30.44 / rec.interval
    case "week": return 4.33 / rec.interval
    case "month": return 1 / rec.interval
    case "year": return 1 / (12 * rec.interval)
  }
}

export function formatRecurrence(item: Recurrent): string {
  if (!item.recurrence_type || !item.recurrence_unit) {
    // Fallback to legacy frequency
    switch (item.frequency) {
      case "weekly": return "Weekly"
      case "biweekly": return "Every 2 weeks"
      case "monthly": return "Monthly"
      default: return "Monthly"
    }
  }

  const { recurrence_interval: interval = 1, recurrence_unit: unit } = item
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  let base: string
  if (unit === "week" && interval === 1 && item.recurrence_days_of_week?.length) {
    const days = item.recurrence_days_of_week.sort((a, b) => a - b).map(d => dayNames[d])
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
  if (item.recurrence_end_type === "on_date" && item.recurrence_end_date) {
    const d = new Date(item.recurrence_end_date)
    const monthStr = d.toLocaleString("en-US", { month: "short" })
    base += ` · ends ${monthStr} ${d.getFullYear()}`
  } else if (item.recurrence_end_type === "after_occurrences" && item.recurrence_end_occurrences) {
    base += ` · ${item.recurrence_end_occurrences} times`
  }

  return base
}
