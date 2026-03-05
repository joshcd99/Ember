import { addDays, addWeeks, addMonths, addYears, isBefore, startOfDay, getDaysInMonth } from "date-fns"
import type { Bill, IncomeSource, RecurrenceUnit } from "@/types/database"

const MAX_ITERATIONS = 500

/** Any record with recurrence fields + a date anchor */
export type Recurrent = (Bill | IncomeSource) & {
  recurrence_type?: string
  recurrence_interval?: number
  recurrence_unit?: RecurrenceUnit
  recurrence_days_of_week?: number[]
  recurrence_days_of_month?: number[]
  recurrence_end_type?: string
  recurrence_end_date?: string | null
  recurrence_end_occurrences?: number | null
}

/** Parse the anchor date from a recurrent item as local time */
function parseAnchorDate(item: Recurrent): Date {
  const s = "next_due_date" in item ? item.next_due_date : item.next_expected_date
  return new Date(s.includes("T") ? s : s + "T00:00")
}

interface NormalizedRecurrence {
  interval: number
  unit: RecurrenceUnit
  daysOfWeek: number[] | undefined
  daysOfMonth: number[] | undefined
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
      daysOfMonth: item.recurrence_days_of_month,
      endType: (item.recurrence_end_type as NormalizedRecurrence["endType"]) ?? "never",
      endDate: item.recurrence_end_date ?? null,
      endOccurrences: item.recurrence_end_occurrences ?? null,
    }
  }
  // Map legacy frequency
  switch (item.frequency) {
    case "weekly":
      return { interval: 1, unit: "week", daysOfWeek: undefined, daysOfMonth: undefined, endType: "never", endDate: null, endOccurrences: null }
    case "biweekly":
      return { interval: 2, unit: "week", daysOfWeek: undefined, daysOfMonth: undefined, endType: "never", endDate: null, endOccurrences: null }
    case "monthly":
    default:
      return { interval: 1, unit: "month", daysOfWeek: undefined, daysOfMonth: undefined, endType: "never", endDate: null, endOccurrences: null }
  }
}

/** Get all dates for specific days-of-month within a given month, clamping to month length */
function getDaysOfMonthDates(year: number, month: number, days: number[]): Date[] {
  const maxDay = getDaysInMonth(new Date(year, month))
  return days
    .map(d => Math.min(d, maxDay))
    .filter((d, i, arr) => arr.indexOf(d) === i) // dedupe after clamping
    .sort((a, b) => a - b)
    .map(d => new Date(year, month, d))
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
    const end = new Date(rec.endDate.includes("T") ? rec.endDate : rec.endDate + "T00:00")
    return !isBefore(date, addDays(startOfDay(end), 1))
  }
  if (rec.endType === "after_occurrences" && rec.endOccurrences != null) {
    return occurrenceCount >= rec.endOccurrences
  }
  return false
}

export function getNextDueDate(item: Recurrent, fromDate: Date): Date | null {
  const rec = normalizeRecurrence(item)
  const from = startOfDay(fromDate)

  // Days-of-month mode: iterate month-by-month and check each specified day
  if (rec.daysOfMonth?.length && rec.unit === "month") {
    const anchor = startOfDay(parseAnchorDate(item))
    let year = anchor.getFullYear()
    let month = anchor.getMonth()
    let iterations = 0
    let occurrenceCount = 0

    while (iterations < MAX_ITERATIONS) {
      const dates = getDaysOfMonthDates(year, month, rec.daysOfMonth)
      for (const d of dates) {
        if (isPastEnd(rec, d, occurrenceCount)) return null
        if (!isBefore(d, from)) return d
        occurrenceCount++
      }
      // Step by interval months
      const next = addMonths(new Date(year, month, 1), rec.interval)
      year = next.getFullYear()
      month = next.getMonth()
      iterations++
    }
    return null
  }

  let current = startOfDay(parseAnchorDate(item))
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
  const rangeStart = startOfDay(start)
  const rangeEnd = startOfDay(end)

  // Days-of-month mode: iterate month-by-month
  if (rec.daysOfMonth?.length && rec.unit === "month") {
    const anchor = startOfDay(parseAnchorDate(item))
    let year = anchor.getFullYear()
    let month = anchor.getMonth()
    let iterations = 0
    let occurrenceCount = 0

    // Advance to the range
    while (iterations < MAX_ITERATIONS) {
      const dates = getDaysOfMonthDates(year, month, rec.daysOfMonth)
      const lastDate = dates[dates.length - 1]
      if (!lastDate || !isBefore(lastDate, rangeStart)) break
      occurrenceCount += dates.filter(d => isBefore(d, rangeStart)).length
      const next = addMonths(new Date(year, month, 1), rec.interval)
      year = next.getFullYear()
      month = next.getMonth()
      iterations++
    }

    // Collect within range
    while (iterations < MAX_ITERATIONS) {
      const dates = getDaysOfMonthDates(year, month, rec.daysOfMonth)
      let allPastRange = true
      for (const d of dates) {
        if (isPastEnd(rec, d, occurrenceCount)) return results
        if (!isBefore(d, rangeEnd)) { allPastRange = true; break }
        allPastRange = false
        if (!isBefore(d, rangeStart)) results.push(d)
        occurrenceCount++
      }
      if (allPastRange && dates.length > 0 && !isBefore(dates[0], rangeEnd)) break
      const next = addMonths(new Date(year, month, 1), rec.interval)
      year = next.getFullYear()
      month = next.getMonth()
      iterations++
    }

    return results
  }

  let current = startOfDay(parseAnchorDate(item))
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
  // Use annual ratios divided by 12 for accuracy
  switch (rec.unit) {
    case "day": return 365 / rec.interval / 12
    case "week": return 52 / rec.interval / 12
    case "month": {
      const base = 1 / rec.interval
      // Multiply by number of days-of-month if set (e.g., 1st+15th = 2x per month)
      return rec.daysOfMonth?.length ? base * rec.daysOfMonth.length : base
    }
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

  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"]
    const v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }

  let base: string
  if (unit === "week" && interval === 1 && item.recurrence_days_of_week?.length) {
    const days = item.recurrence_days_of_week.sort((a, b) => a - b).map(d => dayNames[d])
    base = `Weekly on ${days.join(", ")}`
  } else if (unit === "week" && interval === 1) {
    base = "Weekly"
  } else if (unit === "week" && interval === 2) {
    base = "Every 2 weeks"
  } else if (unit === "month" && item.recurrence_days_of_month?.length) {
    const dayStr = item.recurrence_days_of_month.sort((a, b) => a - b).map(d => ordinal(d)).join(", ")
    base = interval === 1 ? `Monthly on ${dayStr}` : `Every ${interval} months on ${dayStr}`
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
