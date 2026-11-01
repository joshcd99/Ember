import type { Debt } from "@/types/database"
import { calculatePayoff } from "@/lib/payoff-engine"
import { activePromos, paymentPeriodsLeftFor } from "@/lib/promo-engine"

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
 * Interest savings from paying actual vs minimum. Deferred-interest promos are
 * handled per promo: payments are split proportionally by balance between the
 * non-promo portion and each promo, and each promo faces its own deadline.
 */
export function computeInterestSavings(debt: Debt): InterestSavingsResult {
  const actual = debt.actual_payment ?? debt.minimum_payment
  const min = debt.minimum_payment
  const bal = debt.current_balance
  const rate = debt.interest_rate

  const deferredPromos = activePromos(debt).filter(p => p.promo_type === "deferred_interest")

  // No deferred promos: standard payoff comparison
  if (deferredPromos.length === 0 || bal <= 0.01) {
    const totalMin = totalInterest(bal, rate, min)
    const totalAct = totalInterest(bal, rate, actual)
    return {
      interestSaved: Math.max(0, totalMin - totalAct),
      totalInterestMinimum: totalMin,
      totalInterestActual: totalAct,
    }
  }

  const promoBalTotal = Math.min(bal, deferredPromos.reduce((s, p) => s + p.promo_balance, 0))
  const nonPromoBal = Math.max(0, bal - promoBalTotal)

  let totalMin = totalInterest(nonPromoBal, rate, min * (nonPromoBal / bal))
  let totalAct = totalInterest(nonPromoBal, rate, actual * (nonPromoBal / bal))

  for (const p of deferredPromos) {
    const ratio = Math.min(p.promo_balance, bal) / bal
    const r = computePromoSavings(
      p.promo_balance,
      rate,
      p.promo_apr,
      paymentPeriodsLeftFor(p),
      p.deferred_interest_accrued ?? 0,
      min * ratio,
      actual * ratio,
    )
    totalMin += r.totalInterestMinimum
    totalAct += r.totalInterestActual
  }

  return {
    interestSaved: Math.max(0, totalMin - totalAct),
    totalInterestMinimum: totalMin,
    totalInterestActual: totalAct,
  }
}

/**
 * Deferred-interest outcome for one promo balance given a monthly payment share:
 * clear it before the deadline and the interest never existed; miss it and the
 * accrued amount dumps onto the remaining balance.
 */
function computePromoSavings(
  promoBal: number,
  rate: number,
  promoApr: number,
  periods: number,
  accrued: number,
  minPayment: number,
  actualPayment: number,
): InterestSavingsResult {
  const monthlyRate = rate / 12
  const deferredAtDeadline = accrued + promoBal * monthlyRate * periods

  const projectAtDeadline = (payment: number): number => {
    let balance = promoBal
    for (let m = 0; m < periods; m++) {
      balance += balance * (promoApr / 12)
      balance -= Math.min(balance, payment)
      if (balance <= 0.01) return 0
    }
    return Math.max(0, balance)
  }

  const pathInterest = (payment: number): number => {
    const atDeadline = projectAtDeadline(payment)
    if (atDeadline <= 0.01) return 0
    return deferredAtDeadline + totalInterest(atDeadline + deferredAtDeadline, rate, payment)
  }

  const minInterest = pathInterest(minPayment)
  const actInterest = pathInterest(actualPayment)

  return {
    interestSaved: Math.max(0, minInterest - actInterest),
    totalInterestMinimum: minInterest,
    totalInterestActual: actInterest,
  }
}
