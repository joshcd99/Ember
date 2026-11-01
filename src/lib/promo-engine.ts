import type { Debt, DebtPromo } from "@/types/database"
import { differenceInDays, differenceInMonths } from "date-fns"

const MAX_SIM_MONTHS = 600

/** Projection for one promo under the debt's current payment pace */
export interface PromoProjection {
  promo: DebtPromo
  /** Monthly payment opportunities before this promo's deadline */
  periodsLeft: number
  /** Promo balance remaining when its deadline hits */
  projectedBalance: number
  willMake: boolean
  /** Months until this promo's balance clears under the allocation */
  monthsNeeded: number
  /** periodsLeft - monthsNeeded (negative = behind) */
  buffer: number
}

/** Active promos (balance outstanding, deadline in the future), earliest deadline first */
export function activePromos(debt: Debt, asOf: Date = new Date()): DebtPromo[] {
  return (debt.promos ?? [])
    .filter(p => p.promo_balance > 0.01 && new Date(p.promo_end_date + "T00:00") > asOf)
    .sort((a, b) => a.promo_end_date.localeCompare(b.promo_end_date))
}

export function hasActivePromo(debt: Debt): boolean {
  return activePromos(debt).length > 0
}

export function hasDeferredPromo(debt: Debt): boolean {
  return activePromos(debt).some(p => p.promo_type === "deferred_interest")
}

export function promoDaysLeft(p: DebtPromo, asOf: Date = new Date()): number {
  return Math.max(0, differenceInDays(new Date(p.promo_end_date + "T00:00"), asOf))
}

export function promoMonthsLeft(p: DebtPromo, asOf: Date = new Date()): number {
  return Math.max(0, differenceInMonths(new Date(p.promo_end_date + "T00:00"), asOf))
}

/** Monthly payment opportunities before this promo's deadline (partial month counts) */
export function paymentPeriodsLeftFor(p: DebtPromo, asOf: Date = new Date()): number {
  return Math.max(0, Math.ceil(promoDaysLeft(p, asOf) / 30.44))
}

export function earliestPromoEndDate(debt: Debt): string | null {
  const promos = activePromos(debt)
  return promos.length > 0 ? promos[0].promo_end_date : null
}

/**
 * Simulates the debt's monthly payment against all active promos at once.
 * Allocation model: the payment goes to the earliest-deadline promo first,
 * overflow rolls to the next. Each promo accrues its own promo APR.
 */
export function simulatePromos(debt: Debt, monthlyPayment?: number): PromoProjection[] {
  const promos = activePromos(debt)
  if (promos.length === 0) return []

  const payment = monthlyPayment ?? debt.actual_payment ?? debt.minimum_payment
  const balances = promos.map(p => p.promo_balance)
  const periods = promos.map(p => paymentPeriodsLeftFor(p))
  const monthsNeeded = promos.map(() => MAX_SIM_MONTHS)
  const projected = promos.map(() => 0)
  const horizon = Math.max(...periods)

  for (let m = 1; m <= MAX_SIM_MONTHS; m++) {
    for (let i = 0; i < promos.length; i++) {
      if (balances[i] > 0.01) balances[i] += balances[i] * (promos[i].promo_apr / 12)
    }
    let avail = payment
    for (let i = 0; i < promos.length && avail > 0; i++) {
      if (balances[i] > 0.01) {
        const pay = Math.min(balances[i], avail)
        balances[i] -= pay
        avail -= pay
      }
    }
    for (let i = 0; i < promos.length; i++) {
      if (balances[i] <= 0.01 && monthsNeeded[i] === MAX_SIM_MONTHS) monthsNeeded[i] = m
      if (m === periods[i]) projected[i] = Math.max(0, balances[i])
    }
    if (m >= horizon && balances.every(b => b <= 0.01)) break
  }

  return promos.map((p, i) => ({
    promo: p,
    periodsLeft: periods[i],
    projectedBalance: Math.round(projected[i] * 100) / 100,
    willMake: projected[i] <= 0.01,
    monthsNeeded: monthsNeeded[i],
    buffer: periods[i] - monthsNeeded[i],
  }))
}

/** True when the current payment pace clears every promo before its deadline */
export function willMakeDeadline(debt: Debt): boolean {
  return simulatePromos(debt).every(pr => pr.willMake)
}

/** Sum of user-entered accrued deferred interest across active deferred promos */
export function calculateDeferredInterest(debt: Debt): number {
  return activePromos(debt)
    .filter(p => p.promo_type === "deferred_interest")
    .reduce((s, p) => s + (p.deferred_interest_accrued ?? 0), 0)
}

/** Interest that dumps if THIS promo's deadline is missed (deferred type only) */
export function interestAtRiskFor(debt: Debt, pr: PromoProjection): number {
  if (pr.promo.promo_type !== "deferred_interest") return 0
  const accrued = pr.promo.deferred_interest_accrued ?? 0
  return accrued + pr.promo.promo_balance * (debt.interest_rate / 12) * pr.periodsLeft
}

/** Total deferred interest at risk across promos that are NOT on track */
export function interestAtRisk(debt: Debt): number {
  return simulatePromos(debt)
    .filter(pr => !pr.willMake)
    .reduce((s, pr) => s + interestAtRiskFor(debt, pr), 0)
}

/** Additional monthly payment needed so every promo clears before its deadline */
export function extraNeededToMakeDeadline(debt: Debt): number {
  if (willMakeDeadline(debt)) return 0
  const promos = activePromos(debt)
  const current = debt.actual_payment ?? debt.minimum_payment
  let lo = 0
  let hi = promos.reduce((s, p) => s + p.promo_balance, 0)
  for (let iter = 0; iter < 50; iter++) {
    const mid = (lo + hi) / 2
    if (simulatePromos(debt, current + mid).every(pr => pr.willMake)) {
      hi = mid
    } else {
      lo = mid
    }
  }
  return Math.ceil(hi)
}

/** Months of slack on the tightest promo (negative = behind; Infinity = no promos) */
export function deadlineBuffer(debt: Debt): number {
  const prs = simulatePromos(debt)
  if (prs.length === 0) return Infinity
  return Math.min(...prs.map(pr => pr.buffer))
}
