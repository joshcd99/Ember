import type { Debt, DebtType } from "@/types/database"
import { activePromos, hasDeferredPromo, willMakeDeadline, interestAtRisk, paymentPeriodsLeftFor } from "@/lib/promo-engine"

export type Strategy = "avalanche" | "snowball" | "minimums" | "custom"

interface MonthSnapshot {
  month: number
  totalBalance: number
  balances: Record<string, number>
  /** Balance totals per debt_type */
  typeBalances: Record<string, number>
}

export interface PayoffResult {
  strategy: Strategy
  months: number
  totalInterest: number
  /** False when the 50-year cap was hit with balance remaining — payments
   *  don't cover interest, so months/totalInterest/payoffDate are meaningless */
  paidOff: boolean
  payoffDate: Date
  timeline: MonthSnapshot[]
  debtPayoffOrder: { id: string; name: string; debtType: DebtType; month: number }[]
  /** Month index when the last debt of each type reaches zero */
  categoryPayoffMonths: Record<string, number>
}

/** True while a debt's deferment period (e.g. student loans) is still in the future */
export function isInDeferment(d: Debt, asOf: Date = new Date()): boolean {
  if (!d.deferment_end_date) return false
  return new Date(d.deferment_end_date + "T00:00") > asOf
}

/**
 * Checks if a debt is an at-risk deferred interest promo that should be
 * prioritized above normal strategy ordering.
 */
function isAtRiskDeferredPromo(d: Debt): boolean {
  return hasDeferredPromo(d) && !willMakeDeadline(d)
}

export function sortDebts(debts: Debt[], strategy: Strategy, customOrder?: string[]): Debt[] {
  const sorted = [...debts]

  // Base sort per strategy
  let strategySorted: Debt[]
  switch (strategy) {
    case "avalanche":
      strategySorted = sorted.sort((a, b) => b.interest_rate - a.interest_rate)
      break
    case "snowball":
      strategySorted = sorted.sort((a, b) => a.current_balance - b.current_balance)
      break
    case "custom":
      if (customOrder && customOrder.length > 0) {
        strategySorted = sorted.sort((a, b) => {
          const ai = customOrder.indexOf(a.id)
          const bi = customOrder.indexOf(b.id)
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        })
      } else {
        strategySorted = sorted
      }
      break
    case "minimums":
      strategySorted = sorted
      break
  }

  // Float at-risk deferred interest promos to the top, ranked by interestAtRisk desc
  const atRisk = strategySorted.filter(isAtRiskDeferredPromo)
    .sort((a, b) => interestAtRisk(b) - interestAtRisk(a))
  const rest = strategySorted.filter(d => !isAtRiskDeferredPromo(d))

  return [...atRisk, ...rest]
}

/** Returns names of debts prioritized due to promo deadline urgency */
export function getPromoPrioritizedDebts(debts: Debt[]): string[] {
  return debts
    .filter(isAtRiskDeferredPromo)
    .map(d => d.name)
}

export function calculatePayoff(
  debts: Debt[],
  strategy: Strategy,
  extraMonthly: number = 0,
  lumpSum: { amount: number; debtId: string; month: number } | null = null,
  customOrder?: string[]
): PayoffResult {
  if (debts.length === 0) {
    return {
      strategy,
      months: 0,
      totalInterest: 0,
      paidOff: true,
      payoffDate: new Date(),
      timeline: [],
      debtPayoffOrder: [],
      categoryPayoffMonths: {},
    }
  }

  const ordered = sortDebts(debts, strategy, customOrder)
  const balances: Record<string, number> = {}
  const regularRates: Record<string, number> = {} // rate on non-promo balance
  // Per-debt promo segments: that slice of the balance accrues at its own
  // promo APR until its end month, then folds into the regular rate
  const promoSegs: Record<string, { balance: number; rate: number; endMonth: number }[]> = {}
  const minimums: Record<string, number> = {}
  const defermentEndMonths: Record<string, number> = {} // month index when deferment ends (0 = none)
  const defermentAccrues: Record<string, boolean> = {}

  const now = new Date()
  for (const d of debts) {
    balances[d.id] = d.current_balance
    regularRates[d.id] = d.interest_rate / 12

    // Deferment: no required payments (and optionally no interest) until the end date
    if (d.deferment_end_date) {
      const endDate = new Date(d.deferment_end_date + "T00:00")
      defermentEndMonths[d.id] = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (30.44 * 24 * 60 * 60 * 1000)))
    } else {
      defermentEndMonths[d.id] = 0
    }
    defermentAccrues[d.id] = d.deferment_interest_accrues ?? true

    promoSegs[d.id] = activePromos(d, now).map(p => ({
      balance: p.promo_balance,
      rate: p.promo_apr / 12,
      endMonth: paymentPeriodsLeftFor(p, now),
    }))

    minimums[d.id] = d.minimum_payment
  }

  // Map debt id → debt_type for grouping
  const debtTypeMap: Record<string, DebtType> = {}
  for (const d of debts) {
    debtTypeMap[d.id] = d.debt_type ?? "other"
  }

  const computeTypeBalances = () => {
    const tb: Record<string, number> = {}
    for (const id of Object.keys(balances)) {
      const t = debtTypeMap[id]
      tb[t] = (tb[t] ?? 0) + balances[id]
    }
    return tb
  }

  const timeline: MonthSnapshot[] = []
  const debtPayoffOrder: PayoffResult["debtPayoffOrder"] = []
  let totalInterest = 0
  let month = 0
  const maxMonths = 600 // 50 year cap

  // Record initial state
  timeline.push({
    month: 0,
    totalBalance: Object.values(balances).reduce((s, b) => s + b, 0),
    balances: { ...balances },
    typeBalances: computeTypeBalances(),
  })

  while (month < maxMonths) {
    const totalBalance = Object.values(balances).reduce((s, b) => s + b, 0)
    if (totalBalance <= 0.01) break

    month++

    // Apply lump sum if this is the month
    if (lumpSum && month === lumpSum.month && balances[lumpSum.debtId] > 0) {
      balances[lumpSum.debtId] = Math.max(0, balances[lumpSum.debtId] - lumpSum.amount)
    }

    // Accrue interest: promo segments at their own APRs while active, the
    // rest of the balance at the regular rate. Paused entirely during a
    // non-accruing deferment (e.g. subsidized loans).
    for (const id of Object.keys(balances)) {
      if (balances[id] > 0) {
        if (month <= defermentEndMonths[id] && !defermentAccrues[id]) continue
        const segs = promoSegs[id].filter(s => month <= s.endMonth)
        const segTotal = segs.reduce((s, seg) => s + seg.balance, 0)
        // When the balance has been paid below the promo total, scale the
        // promo share down so segments never exceed what's actually owed
        const scale = segTotal > 0 ? Math.min(1, balances[id] / segTotal) : 0
        const promoInterest = segs.reduce((s, seg) => s + seg.balance * scale * seg.rate, 0)
        const nonPromo = Math.max(0, balances[id] - segTotal)
        const interest = promoInterest + nonPromo * regularRates[id]
        balances[id] += interest
        totalInterest += interest
      }
    }

    // Pay minimums on all debts (none required while a debt is in deferment)
    let extraAvailable = strategy === "minimums" ? 0 : extraMonthly
    for (const id of Object.keys(balances)) {
      if (balances[id] > 0 && month > defermentEndMonths[id]) {
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
        debtPayoffOrder.push({ id: d.id, name: d.name, debtType: debtTypeMap[d.id], month })

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
      typeBalances: computeTypeBalances(),
    })
  }

  // Compute per-category payoff month (last debt of that type to hit zero)
  const categoryPayoffMonths: Record<string, number> = {}
  for (const entry of debtPayoffOrder) {
    categoryPayoffMonths[entry.debtType] = Math.max(
      categoryPayoffMonths[entry.debtType] ?? 0,
      entry.month
    )
  }

  const payoffDate = new Date()
  payoffDate.setMonth(payoffDate.getMonth() + month)

  return {
    strategy,
    months: month,
    totalInterest: Math.round(totalInterest * 100) / 100,
    paidOff: Object.values(balances).reduce((s, b) => s + b, 0) <= 0.01,
    payoffDate,
    timeline,
    debtPayoffOrder,
    categoryPayoffMonths,
  }
}

export function getHighestImpactAction(debts: Debt[]): {
  debtName: string
  extraAmount: number
  interestSaved: number
} | null {
  // Paying extra on a paused-interest deferment saves nothing right now
  const candidates = debts.filter(d => !(isInDeferment(d) && d.deferment_interest_accrues === false))
  if (candidates.length === 0) return null

  // The highest-rate debt saves the most interest per dollar applied
  const sorted = [...candidates].sort((a, b) => b.interest_rate - a.interest_rate)
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
