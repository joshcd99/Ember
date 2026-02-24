import type { Debt, IncomeSource, Bill, Transaction, Checkin } from "@/types/database"

export const mockDebts: Debt[] = [
  {
    id: "1",
    household_id: "mock-household",
    name: "Chase Visa",
    current_balance: 4200,
    starting_balance: 6500,
    interest_rate: 0.2199,
    minimum_payment: 95,
    due_day: 15,
    created_at: "2025-06-01T00:00:00Z",
    last_verified_at: "2026-01-10T00:00:00Z",
  },
  {
    id: "2",
    household_id: "mock-household",
    name: "Student Loan",
    current_balance: 12800,
    starting_balance: 18000,
    interest_rate: 0.055,
    minimum_payment: 180,
    due_day: 1,
    created_at: "2025-06-01T00:00:00Z",
    last_verified_at: "2025-12-01T00:00:00Z",
  },
  {
    id: "3",
    household_id: "mock-household",
    name: "Car Loan",
    current_balance: 8400,
    starting_balance: 15000,
    interest_rate: 0.069,
    minimum_payment: 285,
    due_day: 20,
    created_at: "2025-06-01T00:00:00Z",
    last_verified_at: "2026-02-01T00:00:00Z",
  },
  {
    id: "4",
    household_id: "mock-household",
    name: "Amex Blue",
    current_balance: 1100,
    starting_balance: 2200,
    interest_rate: 0.1799,
    minimum_payment: 35,
    due_day: 28,
    created_at: "2025-06-01T00:00:00Z",
    last_verified_at: "2026-02-15T00:00:00Z",
  },
]

export const mockIncomeSources: IncomeSource[] = [
  {
    id: "1",
    household_id: "mock-household",
    name: "Day Job",
    amount: 2800,
    frequency: "biweekly",
    next_expected_date: "2026-02-27",
    is_variable: false,
  },
  {
    id: "2",
    household_id: "mock-household",
    name: "Freelance",
    amount: 600,
    frequency: "monthly",
    next_expected_date: "2026-03-01",
    is_variable: true,
  },
]

export const mockBills: Bill[] = [
  { id: "1", household_id: "mock-household", name: "Rent", amount: 1400, frequency: "monthly", next_due_date: "2026-03-01", category: "housing" },
  { id: "2", household_id: "mock-household", name: "Electric", amount: 120, frequency: "monthly", next_due_date: "2026-03-05", category: "utilities" },
  { id: "3", household_id: "mock-household", name: "Internet", amount: 65, frequency: "monthly", next_due_date: "2026-02-28", category: "utilities" },
  { id: "4", household_id: "mock-household", name: "Phone", amount: 85, frequency: "monthly", next_due_date: "2026-03-10", category: "utilities" },
  { id: "5", household_id: "mock-household", name: "Car Insurance", amount: 140, frequency: "monthly", next_due_date: "2026-03-01", category: "insurance" },
  { id: "6", household_id: "mock-household", name: "Groceries", amount: 400, frequency: "monthly", next_due_date: "2026-03-01", category: "food" },
]

export const mockTransactions: Transaction[] = [
  { id: "1", user_id: "mock", household_id: "mock-household", type: "debt_payment", amount: 150, label: "Extra payment - Chase Visa", date: "2026-02-20", linked_income_source_id: null, linked_debt_id: "1", is_projected: false },
  { id: "2", user_id: "mock", household_id: "mock-household", type: "income", amount: 2800, label: "Paycheck", date: "2026-02-13", linked_income_source_id: "1", linked_debt_id: null, is_projected: false },
  { id: "3", user_id: "mock", household_id: "mock-household", type: "expense", amount: 45, label: "Coffee & lunch", date: "2026-02-22", linked_income_source_id: null, linked_debt_id: null, is_projected: false },
]

export const mockCheckins: Checkin[] = [
  { id: "1", user_id: "mock", household_id: "mock-household", date: "2026-02-24", completed_at: "2026-02-24T09:00:00Z" },
  { id: "2", user_id: "mock", household_id: "mock-household", date: "2026-02-23", completed_at: "2026-02-23T10:00:00Z" },
  { id: "3", user_id: "mock", household_id: "mock-household", date: "2026-02-22", completed_at: "2026-02-22T08:30:00Z" },
  { id: "4", user_id: "mock", household_id: "mock-household", date: "2026-02-21", completed_at: "2026-02-21T11:00:00Z" },
  { id: "5", user_id: "mock", household_id: "mock-household", date: "2026-02-20", completed_at: "2026-02-20T09:15:00Z" },
  { id: "6", user_id: "mock", household_id: "mock-household", date: "2026-02-19", completed_at: "2026-02-19T08:00:00Z" },
  { id: "7", user_id: "mock", household_id: "mock-household", date: "2026-02-18", completed_at: "2026-02-18T10:30:00Z" },
]

export function getTotalDebt(debts: Debt[]): number {
  return debts.reduce((sum, d) => sum + d.current_balance, 0)
}

export function getTotalStartingDebt(debts: Debt[]): number {
  return debts.reduce((sum, d) => sum + d.starting_balance, 0)
}

export function getMonthlyIncome(sources: IncomeSource[]): number {
  return sources.reduce((sum, s) => {
    switch (s.frequency) {
      case "weekly": return sum + s.amount * 4.33
      case "biweekly": return sum + s.amount * 2.167
      case "monthly": return sum + s.amount
    }
  }, 0)
}

export function getMonthlyBills(bills: Bill[]): number {
  return bills.reduce((sum, b) => {
    switch (b.frequency) {
      case "weekly": return sum + b.amount * 4.33
      case "biweekly": return sum + b.amount * 2.167
      case "monthly": return sum + b.amount
    }
  }, 0)
}

export function getMonthlyMinimums(debts: Debt[]): number {
  return debts.reduce((sum, d) => sum + d.minimum_payment, 0)
}

export function getCheckinStreak(checkins: Checkin[]): number {
  if (checkins.length === 0) return 0
  const sorted = [...checkins]
    .filter(c => c.completed_at !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  let streak = 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i < sorted.length; i++) {
    const checkinDate = new Date(sorted[i].date)
    checkinDate.setHours(0, 0, 0, 0)
    const expectedDate = new Date(today)
    expectedDate.setDate(expectedDate.getDate() - i)

    if (checkinDate.getTime() === expectedDate.getTime()) {
      streak++
    } else {
      break
    }
  }
  return streak
}
