import type { Debt } from "@/types/database"
import { calculatePayoff } from "@/lib/payoff-engine"
import { paymentPeriodsLeft, willMakeDeadline, projectedBalanceAtPromoEnd } from "@/lib/promo-engine"

export interface InterestSavingsResult {
  interestSaved: number
  totalInterestMinimum: number
  totalInterestActual: number
}

/**
 * Compute total interest paid (minimum vs actual) using a synthetic non-promo debt
 * run through calculatePayoff.
 */
function totalInterest(balance: number, rate: number, payment: number): number {
  if (balance <= 0.01 || payment <= 0) return 0
  const synth: Debt = {
    id: "synth", household_id: "", name: "", debt_type: "other",
    current_balance: balance, starting_balance: balance,
    interest_rate: rate, minimum_payment: payment, due_day: 1,
    created_at: new Date().toISOString(), last_verified_at: null,
  }
  return calculatePayoff([synth], "minimums").totalInterest
}

/**
 * Unified interest savings calculation with 3 cases:
 * - Case 1: No promo (standard payoff comparison)
 * - Case 2: Full promo (promo_balance ≈ current_balance)
 * - Case 3: Partial promo (split proportionally)
 */
export function computeInterestSavings(debt: Debt): InterestSavingsResult {
  const actual = debt.actual_payment ?? debt.minimum_payment
  const min = debt.minimum_payment
  const bal = debt.current_balance
  const rate = debt.interest_rate

  const hasPromo = debt.promo_type === "deferred_interest"
    && (debt.promo_balance ?? 0) > 0
    && !!debt.promo_end_date

  // Case 1: No promo
  if (!hasPromo) {
    const totalMin = totalInterest(bal, rate, min)
    const totalAct = totalInterest(bal, rate, actual)
    return {
      interestSaved: Math.max(0, totalMin - totalAct),
      totalInterestMinimum: totalMin,
      totalInterestActual: totalAct,
    }
  }

  const promoBal = debt.promo_balance!
  const nonPromoBal = Math.max(0, bal - promoBal)
  const isFullPromo = nonPromoBal < 0.01

  // Case 2: Full promo (promo_balance ≈ current_balance)
  if (isFullPromo) {
    return computePromoSavings(debt, promoBal, rate, min, actual)
  }

  // Case 3: Partial promo — split payments proportionally
  const promoRatio = promoBal / bal
  const promoMin = min * promoRatio
  const promoActual = actual * promoRatio
  const nonPromoMin = min - promoMin
  const nonPromoActual = actual - promoActual

  // Non-promo portion: standard payoff
  const nonPromoMinInterest = totalInterest(nonPromoBal, rate, nonPromoMin)
  const nonPromoActInterest = totalInterest(nonPromoBal, rate, nonPromoActual)

  // Promo portion: deferred interest logic
  const promoResult = computePromoSavings(
    debt, promoBal, rate, promoMin, promoActual
  )

  const totalMin = nonPromoMinInterest + promoResult.totalInterestMinimum
  const totalAct = nonPromoActInterest + promoResult.totalInterestActual

  return {
    interestSaved: Math.max(0, totalMin - totalAct),
    totalInterestMinimum: totalMin,
    totalInterestActual: totalAct,
  }
}

/**
 * Deferred interest promo savings for a given promo balance portion.
 */
function computePromoSavings(
  debt: Debt,
  promoBal: number,
  rate: number,
  minPayment: number,
  actualPayment: number,
): InterestSavingsResult {
  const periods = paymentPeriodsLeft(debt)
  const monthlyRate = rate / 12
  const accrued = debt.deferred_interest_accrued ?? 0

  // Forward-looking deferred interest that will accrue by deadline
  const forwardInterest = promoBal * monthlyRate * periods
  const deferredAtDeadline = accrued + forwardInterest

  // Balance remaining at deadline on minimum payments
  const minDebt: Debt = { ...debt, actual_payment: minPayment || null }
  const balAtDeadlineMin = projectedBalanceAtPromoEnd(minDebt)
  const postDumpMin = balAtDeadlineMin + deferredAtDeadline

  // Minimum path: dump + post-dump payoff
  const minInterest = deferredAtDeadline + totalInterest(postDumpMin, rate, minPayment)

  // Actual path: if clears before deadline, zero interest
  const actualDebt: Debt = { ...debt, actual_payment: actualPayment || null }
  let actInterest = 0
  if (!willMakeDeadline(actualDebt)) {
    const balAtDeadlineAct = projectedBalanceAtPromoEnd(actualDebt)
    const postDumpAct = balAtDeadlineAct + deferredAtDeadline
    actInterest = deferredAtDeadline + totalInterest(postDumpAct, rate, actualPayment)
  }

  return {
    interestSaved: Math.max(0, minInterest - actInterest),
    totalInterestMinimum: minInterest,
    totalInterestActual: actInterest,
  }
}
