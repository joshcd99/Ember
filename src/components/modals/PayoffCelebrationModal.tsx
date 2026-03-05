import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"
import { calculatePayoff } from "@/lib/payoff-engine"
import { interestAtRisk, projectedBalanceAtPromoEnd, willMakeDeadline } from "@/lib/promo-engine"
import type { Debt } from "@/types/database"

interface PayoffCelebrationModalProps {
  open: boolean
  onClose: () => void
  debt: Debt | null
}

function computeInterestSavings(debt: Debt) {
  const effectivePayment = debt.actual_payment ?? debt.minimum_payment
  const hadExtraPayments = effectivePayment > debt.minimum_payment

  // Deferred interest promo path
  if (debt.promo_type === "deferred_interest" && debt.promo_end_date) {
    const deferredDump = interestAtRisk(debt)

    // Minimum-only projection: assume would miss deadline → dump happens
    const minDebt: Debt = { ...debt, actual_payment: null, current_balance: debt.starting_balance }
    const projBal = projectedBalanceAtPromoEnd(minDebt)
    const postDumpBalance = projBal + deferredDump
    let minTotalInterest = deferredDump
    let minMonths = 0
    if (postDumpBalance > 0.01) {
      const syntheticDebt: Debt = {
        ...debt,
        current_balance: postDumpBalance,
        starting_balance: postDumpBalance,
        minimum_payment: debt.minimum_payment,
        promo_type: null,
        promo_apr: null,
        promo_end_date: null,
        promo_balance: null,
      }
      const minResult = calculatePayoff([syntheticDebt], "minimums")
      minTotalInterest += minResult.totalInterest
      minMonths = minResult.months
    }

    // Actual payment: if beat the deadline, interest = $0
    let actualTotalInterest = 0
    let actualMonths = 0
    if (!willMakeDeadline(debt)) {
      const actualProjBal = projectedBalanceAtPromoEnd(debt)
      const actualPostDump = actualProjBal + deferredDump
      if (actualPostDump > 0.01) {
        const actualSynthetic: Debt = {
          ...debt,
          current_balance: actualPostDump,
          starting_balance: actualPostDump,
          minimum_payment: effectivePayment,
          promo_type: null,
          promo_apr: null,
          promo_end_date: null,
          promo_balance: null,
        }
        const actualResult = calculatePayoff([actualSynthetic], "minimums")
        actualTotalInterest = deferredDump + actualResult.totalInterest
        actualMonths = actualResult.months
      }
    }

    return {
      interestSaved: Math.max(0, minTotalInterest - actualTotalInterest),
      monthsSaved: Math.max(0, minMonths - actualMonths),
      totalInterestPaid: actualTotalInterest,
      totalMonthsPaid: actualMonths,
      hadExtraPayments,
    }
  }

  // Standard path
  const minOnlyDebt: Debt = {
    ...debt,
    current_balance: debt.starting_balance,
  }
  const minResult = calculatePayoff([minOnlyDebt], "minimums")

  const actualDebt: Debt = {
    ...debt,
    current_balance: debt.starting_balance,
    minimum_payment: effectivePayment,
  }
  const actualResult = calculatePayoff([actualDebt], "minimums")

  return {
    interestSaved: Math.max(0, minResult.totalInterest - actualResult.totalInterest),
    monthsSaved: Math.max(0, minResult.months - actualResult.months),
    totalInterestPaid: actualResult.totalInterest,
    totalMonthsPaid: actualResult.months,
    hadExtraPayments,
  }
}

export function PayoffCelebrationModal({ open, onClose, debt }: PayoffCelebrationModalProps) {
  if (!debt) return null

  const isPromoVictory = debt.promo_type && debt.promo_balance != null && debt.promo_balance <= 0.01 && debt.promo_end_date && new Date(debt.promo_end_date) > new Date()
  const savings = computeInterestSavings(debt)

  // Promo victory: "You beat the clock"
  if (isPromoVictory) {
    const isDeferredInterest = debt.promo_type === "deferred_interest"
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="text-center max-w-sm">
          <div className="py-6 space-y-4">
            <div className="text-6xl">🔥</div>
            <h2 className="font-display text-3xl text-warning">You beat the clock.</h2>
            {isDeferredInterest ? (
              <p className="font-serif text-xl text-success">
                {formatCurrency(savings.interestSaved)} in deferred interest: avoided.
              </p>
            ) : (
              <p className="text-muted-foreground">
                You cleared the promo balance. No interest ever charged.
              </p>
            )}
            <Button onClick={onClose} className="mt-4">
              Back to debts
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Regular debt payoff
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="text-center max-w-sm">
        <div className="py-6 space-y-4">
          <div className="text-6xl">🔥</div>
          <h2 className="font-display text-2xl">{debt.name} — paid off</h2>

          {savings.hadExtraPayments ? (
            <>
              <p className="text-muted-foreground">
                Paid off {savings.monthsSaved > 0 ? `${savings.monthsSaved} months early` : "on schedule"}
              </p>
              {savings.interestSaved > 0 && (
                <p className="font-serif text-2xl text-success">
                  {formatCurrency(savings.interestSaved)}
                </p>
              )}
              {savings.interestSaved > 0 && (
                <p className="text-sm text-muted-foreground">
                  in interest avoided by putting extra toward this debt
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-muted-foreground">One less fire to fight.</p>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(savings.totalInterestPaid)} paid over {savings.totalMonthsPaid} months
              </p>
            </>
          )}

          <Button onClick={onClose} className="mt-4">
            Back to debts
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
