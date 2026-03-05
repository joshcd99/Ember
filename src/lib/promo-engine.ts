import type { Debt } from "@/types/database"
import { differenceInDays, differenceInMonths } from "date-fns"

/**
 * Days remaining until promo_end_date. Returns 0 if no promo or already past.
 */
export function daysUntilPromoEnd(debt: Debt, asOf: Date = new Date()): number {
  if (!debt.promo_end_date) return 0
  const end = new Date(debt.promo_end_date + "T00:00")
  return Math.max(0, differenceInDays(end, asOf))
}

/**
 * Months remaining until promo_end_date (for display). Uses day-aware rounding.
 */
export function monthsUntilPromoEnd(debt: Debt, asOf: Date = new Date()): number {
  if (!debt.promo_end_date) return 0
  const end = new Date(debt.promo_end_date + "T00:00")
  return Math.max(0, differenceInMonths(end, asOf))
}

/**
 * Number of payment periods (months) remaining before the promo deadline.
 * This is what drives simulations — how many monthly payments fit before the end date.
 * Uses ceiling to count a partial month as a full payment opportunity.
 */
export function paymentPeriodsLeft(debt: Debt, asOf: Date = new Date()): number {
  const days = daysUntilPromoEnd(debt, asOf)
  return Math.max(0, Math.ceil(days / 30.44)) // average days per month
}

/**
 * For deferred_interest type: returns the user-entered accrued deferred interest.
 * This replaces the old formula-based calculation that relied on created_at.
 */
export function calculateDeferredInterest(debt: Debt): number {
  if (debt.promo_type !== "deferred_interest") return 0
  return debt.deferred_interest_accrued ?? 0
}

/**
 * Given current actual_payment (or minimum if null),
 * what will the remaining promo_balance be on promo_end_date?
 * Simulates monthly payments over the remaining payment periods.
 */
export function projectedBalanceAtPromoEnd(debt: Debt): number {
  if (!debt.promo_balance || !debt.promo_end_date) return 0

  const periods = paymentPeriodsLeft(debt)
  if (periods <= 0) return debt.promo_balance

  const monthlyPayment = debt.actual_payment ?? debt.minimum_payment
  const promoRate = (debt.promo_apr ?? 0) / 12

  let balance = debt.promo_balance
  for (let m = 0; m < periods; m++) {
    balance += balance * promoRate
    balance -= Math.min(balance, monthlyPayment)
    if (balance <= 0.01) return 0
  }
  return Math.max(0, balance)
}

/**
 * Returns true if current payment pace clears promo_balance before promo_end_date.
 */
export function willMakeDeadline(debt: Debt): boolean {
  if (!debt.promo_type || !debt.promo_balance || !debt.promo_end_date) return true
  return projectedBalanceAtPromoEnd(debt) <= 0.01
}

/**
 * How much additional monthly payment would be needed to clear promo_balance in time.
 * Returns 0 if already on track.
 */
export function extraNeededToMakeDeadline(debt: Debt): number {
  if (willMakeDeadline(debt)) return 0
  if (!debt.promo_balance || !debt.promo_end_date) return 0

  const periods = paymentPeriodsLeft(debt)
  if (periods <= 0) return debt.promo_balance // already past deadline

  const currentPayment = debt.actual_payment ?? debt.minimum_payment
  const promoRate = (debt.promo_apr ?? 0) / 12

  // Binary search for the additional amount needed
  let lo = 0
  let hi = debt.promo_balance
  for (let iter = 0; iter < 50; iter++) {
    const mid = (lo + hi) / 2
    const testPayment = currentPayment + mid

    let balance = debt.promo_balance
    for (let m = 0; m < periods; m++) {
      balance += balance * promoRate
      balance -= Math.min(balance, testPayment)
      if (balance <= 0.01) { balance = 0; break }
    }

    if (balance <= 0.01) {
      hi = mid
    } else {
      lo = mid
    }
  }

  return Math.ceil(hi)
}

/**
 * For deferred_interest: total interest at risk if deadline is missed.
 * = already accrued + forward-looking interest over remaining months.
 * Forward: promo_balance × (interest_rate / 12) × paymentPeriodsLeft
 * For true_zero: 0.
 */
export function interestAtRisk(debt: Debt): number {
  if (debt.promo_type !== "deferred_interest") return 0
  if (!debt.promo_balance || !debt.interest_rate || !debt.promo_end_date) return 0

  const accrued = debt.deferred_interest_accrued ?? 0
  const monthlyRate = debt.interest_rate / 12
  const periods = paymentPeriodsLeft(debt)
  return accrued + debt.promo_balance * monthlyRate * periods
}

/**
 * Returns the number of months of buffer if on track (positive = months ahead),
 * or negative if behind. Used for progress bar coloring.
 */
export function deadlineBuffer(debt: Debt): number {
  if (!debt.promo_type || !debt.promo_balance || !debt.promo_end_date) return Infinity

  const monthlyPayment = debt.actual_payment ?? debt.minimum_payment
  const promoRate = (debt.promo_apr ?? 0) / 12
  const periods = paymentPeriodsLeft(debt)

  // Simulate: how many months to pay off promo balance?
  let balance = debt.promo_balance
  let monthsNeeded = 0
  while (balance > 0.01 && monthsNeeded < 600) {
    monthsNeeded++
    balance += balance * promoRate
    balance -= Math.min(balance, monthlyPayment)
  }

  return periods - monthsNeeded
}

/**
 * Returns true if the debt has an active promo (type set, balance > 0, end date in the future).
 */
export function hasActivePromo(debt: Debt): boolean {
  if (!debt.promo_type || !debt.promo_end_date) return false
  if (!debt.promo_balance || debt.promo_balance <= 0.01) return false
  return new Date(debt.promo_end_date + "T00:00") > new Date()
}
