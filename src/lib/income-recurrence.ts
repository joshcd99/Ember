import { addWeeks, addMonths, isBefore, startOfDay } from "date-fns"
import type { IncomeSource } from "@/types/database"

const MAX_ITERATIONS = 500

function stepIncome(date: Date, frequency: string): Date {
  switch (frequency) {
    case "weekly": return addWeeks(date, 1)
    case "biweekly": return addWeeks(date, 2)
    case "monthly": return addMonths(date, 1)
    default: return addMonths(date, 1)
  }
}

export function getIncomeOccurrencesInRange(source: IncomeSource, start: Date, end: Date): Date[] {
  const results: Date[] = []
  let current = startOfDay(new Date(source.next_expected_date))
  const rangeStart = startOfDay(start)
  const rangeEnd = startOfDay(end)
  const startDateLimit = source.start_date ? startOfDay(new Date(source.start_date)) : null
  let iterations = 0

  while (isBefore(current, rangeStart) && iterations < MAX_ITERATIONS) {
    current = stepIncome(current, source.frequency)
    iterations++
  }

  while (isBefore(current, rangeEnd) && iterations < MAX_ITERATIONS) {
    if (!startDateLimit || !isBefore(current, startDateLimit)) {
      results.push(current)
    }
    current = stepIncome(current, source.frequency)
    iterations++
  }

  return results
}
