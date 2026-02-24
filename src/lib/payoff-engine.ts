import type { Debt } from "@/types/database"

export type Strategy = "avalanche" | "snowball" | "minimums"

interface MonthSnapshot {
  month: number
  totalBalance: number
  balances: Record<string, number>
}

interface PayoffResult {
  strategy: Strategy
  months: number
  totalInterest: number
  payoffDate: Date
  timeline: MonthSnapshot[]
  debtPayoffOrder: { id: string; name: string; month: number }[]
}

function sortDebts(debts: Debt[], strategy: Strategy): Debt[] {
  const sorted = [...debts]
  switch (strategy) {
    case "avalanche":
      return sorted.sort((a, b) => b.interest_rate - a.interest_rate)
    case "snowball":
      return sorted.sort((a, b) => a.current_balance - b.current_balance)
    case "minimums":
      return sorted
  }
}

export function calculatePayoff(
  debts: Debt[],
  strategy: Strategy,
  extraMonthly: number = 0,
  lumpSum: { amount: number; debtId: string; month: number } | null = null
): PayoffResult {
  if (debts.length === 0) {
    return {
      strategy,
      months: 0,
      totalInterest: 0,
      payoffDate: new Date(),
      timeline: [],
      debtPayoffOrder: [],
    }
  }

  const ordered = sortDebts(debts, strategy)
  const balances: Record<string, number> = {}
  const rates: Record<string, number> = {}
  const minimums: Record<string, number> = {}

  for (const d of debts) {
    balances[d.id] = d.current_balance
    rates[d.id] = d.interest_rate / 12
    minimums[d.id] = d.minimum_payment
  }

  const timeline: MonthSnapshot[] = []
  const debtPayoffOrder: { id: string; name: string; month: number }[] = []
  let totalInterest = 0
  let month = 0
  const maxMonths = 600 // 50 year cap

  // Record initial state
  timeline.push({
    month: 0,
    totalBalance: Object.values(balances).reduce((s, b) => s + b, 0),
    balances: { ...balances },
  })

  while (month < maxMonths) {
    const totalBalance = Object.values(balances).reduce((s, b) => s + b, 0)
    if (totalBalance <= 0.01) break

    month++

    // Apply lump sum if this is the month
    if (lumpSum && month === lumpSum.month && balances[lumpSum.debtId] > 0) {
      balances[lumpSum.debtId] = Math.max(0, balances[lumpSum.debtId] - lumpSum.amount)
    }

    // Accrue interest
    for (const id of Object.keys(balances)) {
      if (balances[id] > 0) {
        const interest = balances[id] * rates[id]
        balances[id] += interest
        totalInterest += interest
      }
    }

    // Pay minimums on all debts
    let extraAvailable = strategy === "minimums" ? 0 : extraMonthly
    for (const id of Object.keys(balances)) {
      if (balances[id] > 0) {
        const payment = Math.min(balances[id], minimums[id])
        balances[id] -= payment
      }
    }

    // Apply extra to priority debt (in strategy order)
    if (extraAvailable > 0) {
      for (const d of ordered) {
        if (balances[d.id] > 0 && extraAvailable > 0) {
          const payment = Math.min(balances[d.id], extraAvailable)
          balances[d.id] -= payment
          extraAvailable -= payment
        }
      }
    }

    // Check for newly paid off debts
    for (const d of debts) {
      if (
        balances[d.id] <= 0.01 &&
        !debtPayoffOrder.find(p => p.id === d.id)
      ) {
        balances[d.id] = 0
        debtPayoffOrder.push({ id: d.id, name: d.name, month })

        // Snowball / avalanche: freed-up minimum rolls into extra
        if (strategy !== "minimums") {
          extraMonthly += minimums[d.id]
        }
      }
    }

    timeline.push({
      month,
      totalBalance: Object.values(balances).reduce((s, b) => s + b, 0),
      balances: { ...balances },
    })
  }

  const payoffDate = new Date()
  payoffDate.setMonth(payoffDate.getMonth() + month)

  return {
    strategy,
    months: month,
    totalInterest: Math.round(totalInterest * 100) / 100,
    payoffDate,
    timeline,
    debtPayoffOrder,
  }
}

export function getHighestImpactAction(debts: Debt[]): {
  debtName: string
  extraAmount: number
  interestSaved: number
} | null {
  if (debts.length === 0) return null

  // The highest-rate debt saves the most interest per dollar applied
  const sorted = [...debts].sort((a, b) => b.interest_rate - a.interest_rate)
  const target = sorted[0]
  const extraAmount = 50 // suggest $50 extra

  // Interest saved by paying $50 extra this month
  const monthlyRate = target.interest_rate / 12
  const interestSaved = extraAmount * monthlyRate * (target.current_balance / target.starting_balance) * 12

  return {
    debtName: target.name,
    extraAmount,
    interestSaved: Math.round(interestSaved * 100) / 100,
  }
}
