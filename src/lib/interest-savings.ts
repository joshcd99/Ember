import type { Debt } from "@/types/database"
import { calculatePayoff } from "@/lib/payoff-engine"
import { activePromos, paymentPeriodsLeftFor } from "@/lib/promo-engine"

export interface InterestSavingsResult {
  interestSaved: number
  totalInterestMinimum: number
  totalInterestActual: number
  /** The payment doesn't cover interest, so the balance compounds forever —
   *  any "interest paid" figure from that path is meaningless */
  minimumNeverPaysOff: boolean
  actualNeverPaysOff: boolean
}

/**
 * Total interest paid, and whether the payment actually retires the balance,
 * using a synthetic non-promo debt run through calculatePayoff.
 */
function totalInterestDetailed(balance: number, rate: number, payment: number): { interest: number; paidOff: boolean } {
  if (balance <= 0.01) return { interest: 0, paidOff: true }
  if (payment <= 0) return { interest: 0, paidOff: false }
  const synth: Debt = {
    id: "synth", household_id: "", name: "", debt_type: "other",
    current_balance: balance, starting_balance: balance,
    interest_rate: rate, minimum_payment: payment, due_day: 1,
    created_at: new Date().toISOString(), last_verified_at: null,
  }
  const result = calculatePayoff([synth], "minimums")
  const end = result.timeline[result.timeline.length - 1]
  return { interest: result.totalInterest, paidOff: (end?.totalBalance ?? 0) <= 0.01 }
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
    const minR = totalInterestDetailed(bal, rate, min)
    const actR = totalInterestDetailed(bal, rate, actual)
    return {
      interestSaved: Math.max(0, minR.interest - actR.interest),
      totalInterestMinimum: minR.interest,
      totalInterestActual: actR.interest,
      minimumNeverPaysOff: !minR.paidOff,
      actualNeverPaysOff: !actR.paidOff,
    }
  }

  const promoBalTotal = Math.min(bal, deferredPromos.reduce((s, p) => s + p.promo_balance, 0))
  const nonPromoBal = Math.max(0, bal - promoBalTotal)

  const nonMinR = totalInterestDetailed(nonPromoBal, rate, min * (nonPromoBal / bal))
  const nonActR = totalInterestDetailed(nonPromoBal, rate, actual * (nonPromoBal / bal))
  let totalMin = nonMinR.interest
  let totalAct = nonActR.interest
  let minNever = !nonMinR.paidOff
  let actNever = !nonActR.paidOff

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
    minNever = minNever || r.minimumNeverPaysOff
    actNever = actNever || r.actualNeverPaysOff
  }

  return {
    interestSaved: Math.max(0, totalMin - totalAct),
    totalInterestMinimum: totalMin,
    totalInterestActual: totalAct,
    minimumNeverPaysOff: minNever,
    actualNeverPaysOff: actNever,
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

  const pathInterest = (payment: number): { interest: number; paidOff: boolean } => {
    const atDeadline = projectAtDeadline(payment)
    if (atDeadline <= 0.01) return { interest: 0, paidOff: true }
    const post = totalInterestDetailed(atDeadline + deferredAtDeadline, rate, payment)
    return { interest: deferredAtDeadline + post.interest, paidOff: post.paidOff }
  }

  const minR = pathInterest(minPayment)
  const actR = pathInterest(actualPayment)

  return {
    interestSaved: Math.max(0, minR.interest - actR.interest),
    totalInterestMinimum: minR.interest,
    totalInterestActual: actR.interest,
    minimumNeverPaysOff: !minR.paidOff,
    actualNeverPaysOff: !actR.paidOff,
  }
}
