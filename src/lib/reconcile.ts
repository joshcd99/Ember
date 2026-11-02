/**
 * Reconciles scheduled occurrences (income, bills) against actual bank
 * activity, so a paycheck that lands a few days early drops out of the
 * cash-flow projection instead of being counted twice — once inside the
 * current balance and again on its expected date.
 */

export interface FeedTxn {
  account_id: string
  posted: string // YYYY-MM-DD
  amount: number // signed: deposits positive, withdrawals negative
  description: string
}

export interface ExpectedEvent {
  key: string
  date: Date
  /** Expected magnitude (positive) */
  amount: number
  direction: "in" | "out"
}

export interface ReconcileMatch {
  postedDate: string
  postedAmount: number
  description: string
}

const WINDOW_DAYS = 7
/** Amount tolerance: paychecks and bills drift a little between cycles */
const tolerance = (expected: number) => Math.max(expected * 0.2, 5)

/**
 * Greedy nearest-date pairing: each bank transaction satisfies at most one
 * occurrence; sign must agree with the direction and the amount must land
 * within tolerance. Only non-future activity counts — money that hasn't
 * hit the account yet can't be "already in the balance".
 */
export function reconcileExpected(
  expected: ExpectedEvent[],
  feed: FeedTxn[],
  today: Date = new Date(),
): Map<string, ReconcileMatch> {
  const matches = new Map<string, ReconcileMatch>()
  const consumed = new Set<FeedTxn>()
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)

  const byDate = [...expected].sort((a, b) => a.date.getTime() - b.date.getTime())
  for (const ev of byDate) {
    let best: FeedTxn | null = null
    let bestScore = Infinity
    for (const t of feed) {
      if (consumed.has(t)) continue
      if (ev.direction === "in" ? t.amount <= 0 : t.amount >= 0) continue
      const posted = new Date(t.posted + "T00:00")
      if (posted > todayEnd) continue
      const dayDiff = Math.abs(posted.getTime() - ev.date.getTime()) / 86400e3
      if (dayDiff > WINDOW_DAYS) continue
      const amtDiff = Math.abs(Math.abs(t.amount) - ev.amount)
      if (amtDiff > tolerance(ev.amount)) continue
      // Closest date wins; amount closeness breaks ties
      const score = dayDiff * 1000 + amtDiff
      if (score < bestScore) {
        bestScore = score
        best = t
      }
    }
    if (best) {
      consumed.add(best)
      matches.set(ev.key, {
        postedDate: best.posted,
        postedAmount: Math.abs(best.amount),
        description: best.description,
      })
    }
  }
  return matches
}
