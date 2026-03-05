import type { Debt } from "@/types/database"
import { differenceInMonths } from "date-fns"

/**
 * Months remaining until promo_end_date from the given reference date.
 * Returns 0 if no promo or already past.
 */
export function monthsUntilPromoEnd(debt: Debt, asOf: Date = new Date()): number {
  if (!debt.promo_end_date) return 0
  const end = new Date(debt.promo_end_date)
  const months = differenceInMonths(end, asOf)
  return Math.max(0, months)
}

/**
 * For deferred_interest type: total interest that has accumulated silently
 * since debt creation (or since the promo balance was established).
 * Formula: promo_balance * (regular_apr / 12) * monthsElapsed
 */
export function calculateDeferredInterest(debt: Debt, asOf: Date = new Date()): number {
  if (debt.promo_type !== "deferred_interest") return 0
  if (!debt.promo_balance || !debt.regular_apr || !debt.created_at) return 0

  const created = new Date(debt.created_at)
  const monthsElapsed = Math.max(0, differenceInMonths(asOf, created))
  return debt.promo_balance * (debt.regular_apr / 12) * monthsElapsed
}

/**
 * Given current actual_payment (or minimum if null),
 * what will the remaining promo_balance be on promo_end_date?
 * Accounts for minimum payments reducing the promo balance monthly.
 */
export function projectedBalanceAtPromoEnd(debt: Debt): number {
  if (!debt.promo_balance || !debt.promo_end_date) return 0

  const monthsLeft = monthsUntilPromoEnd(debt)
  if (monthsLeft <= 0) return debt.promo_balance

  const monthlyPayment = debt.actual_payment ?? debt.minimum_payment
  const promoRate = (debt.promo_apr ?? 0) / 12

  let balance = debt.promo_balance
  for (let m = 0; m < monthsLeft; m++) {
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

  const monthsLeft = monthsUntilPromoEnd(debt)
  if (monthsLeft <= 0) return debt.promo_balance // already past deadline

  const currentPayment = debt.actual_payment ?? debt.minimum_payment
  const promoRate = (debt.promo_apr ?? 0) / 12

  // Binary search for the additional amount needed
  let lo = 0
  let hi = debt.promo_balance
  for (let iter = 0; iter < 50; iter++) {
    const mid = (lo + hi) / 2
    const testPayment = currentPayment + mid

    let balance = debt.promo_balance
    for (let m = 0; m < monthsLeft; m++) {
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
 * For deferred_interest: total interest that will dump if deadline missed.
 * Calculated as if the full promo period elapses with the original promo_balance.
 * For true_zero: 0 (no deferred interest).
 */
export function interestAtRisk(debt: Debt): number {
  if (debt.promo_type !== "deferred_interest") return 0
  if (!debt.promo_balance || !debt.regular_apr || !debt.promo_end_date) return 0

  const created = new Date(debt.created_at)
  const end = new Date(debt.promo_end_date)
  const totalPromoMonths = Math.max(0, differenceInMonths(end, created))

  // Interest accumulates on the original promo_balance for the full promo period
  return debt.promo_balance * (debt.regular_apr / 12) * totalPromoMonths
}

/**
 * Returns the number of months of buffer if on track (positive = months ahead),
 * or negative if behind. Used for progress bar coloring.
 */
export function deadlineBuffer(debt: Debt): number {
  if (!debt.promo_type || !debt.promo_balance || !debt.promo_end_date) return Infinity

  const monthlyPayment = debt.actual_payment ?? debt.minimum_payment
  const promoRate = (debt.promo_apr ?? 0) / 12
  const monthsLeft = monthsUntilPromoEnd(debt)

  // Simulate: how many months to pay off promo balance?
  let balance = debt.promo_balance
  let monthsNeeded = 0
  while (balance > 0.01 && monthsNeeded < 600) {
    monthsNeeded++
    balance += balance * promoRate
    balance -= Math.min(balance, monthlyPayment)
  }

  return monthsLeft - monthsNeeded
}

/**
 * Returns true if the debt has an active promo (type set, balance > 0, end date in the future).
 */
export function hasActivePromo(debt: Debt): boolean {
  if (!debt.promo_type || !debt.promo_end_date) return false
  if (!debt.promo_balance || debt.promo_balance <= 0.01) return false
  return new Date(debt.promo_end_date) > new Date()
}
