import type { Bill, Debt, IncomeSource } from "@/types/database"
import { getOccurrencesInRange } from "@/lib/recurrence"

/** A synced bank transaction as the review flow sees it */
export interface ReviewTxn {
  id: string
  account_id: string
  posted: string // YYYY-MM-DD
  amount: number // signed
  description: string
}

export interface AccountInfo {
  kind: string | null
  linked_debt_id: string | null
}

export interface TxnSuggestion {
  kind: "bill" | "income" | "debt" | "transfer"
  refId?: string
  label: string
}

const PAYMENT_PATTERN = /payment|pymt|\bpmt\b|autopay|auto pay|thank you|thankyou|epay|bill pay/i

const dayDiff = (a: string, b: string) =>
  Math.abs(new Date(a + "T00:00").getTime() - new Date(b + "T00:00").getTime()) / 86400e3

const amountClose = (actual: number, expected: number) =>
  expected > 0 && Math.abs(actual - expected) <= Math.max(expected * 0.2, 5)

/**
 * Best guess at what a bank transaction is: a transfer between own
 * accounts, a planned income deposit, a planned bill, or a debt payment.
 * Card purchases and anything unrecognized return null — those are
 * spending for the user to categorize.
 */
export function suggestForTxn(
  txn: ReviewTxn,
  all: ReviewTxn[],
  accounts: Map<string, AccountInfo>,
  bills: Bill[],
  incomeSources: IncomeSource[],
  debts: Debt[],
): TxnSuggestion | null {
  const info = accounts.get(txn.account_id)
  const isLiability = info?.kind === "credit_card" || info?.kind === "loan"
  const abs = Math.abs(txn.amount)

  // Transfer: an opposite transaction of the same size in another account
  // within 3 days
  const twin = all.find(t =>
    t.id !== txn.id &&
    t.account_id !== txn.account_id &&
    Math.abs(t.amount + txn.amount) <= 1 &&
    dayDiff(t.posted, txn.posted) <= 3
  )
  if (twin && !isLiability && !(accounts.get(twin.account_id)?.kind === "credit_card" || accounts.get(twin.account_id)?.kind === "loan")) {
    return { kind: "transfer", label: "Transfer between accounts" }
  }

  // A payment-shaped transaction on (or twin-matched to) a liability
  // account is a debt payment on its linked debt
  if (isLiability && info?.linked_debt_id && PAYMENT_PATTERN.test(txn.description)) {
    const debt = debts.find(d => d.id === info.linked_debt_id)
    if (debt) return { kind: "debt", refId: debt.id, label: `Payment on ${debt.name}` }
  }

  const windowStart = new Date(txn.posted + "T00:00")
  windowStart.setDate(windowStart.getDate() - 10)
  const windowEnd = new Date(txn.posted + "T00:00")
  windowEnd.setDate(windowEnd.getDate() + 10)

  if (!isLiability && txn.amount > 0) {
    // Deposit on a cash account → planned income nearby?
    for (const source of incomeSources) {
      if (!amountClose(abs, source.amount)) continue
      const occ = getOccurrencesInRange(source, windowStart, windowEnd)
      if (occ.some(d => dayDiff(d.toISOString().slice(0, 10), txn.posted) <= 7)) {
        return { kind: "income", refId: source.id, label: `${source.name} (planned income)` }
      }
    }
  }

  if (!isLiability && txn.amount < 0) {
    // Money out of a cash account → planned bill, or a debt payment
    for (const bill of bills) {
      if (!amountClose(abs, bill.amount)) continue
      const occ = getOccurrencesInRange(bill, windowStart, windowEnd)
      if (occ.some(d => dayDiff(d.toISOString().slice(0, 10), txn.posted) <= 7)) {
        return { kind: "bill", refId: bill.id, label: `${bill.name} (planned bill)` }
      }
    }
    for (const debt of debts) {
      const expected = debt.actual_payment ?? debt.minimum_payment
      if (!amountClose(abs, expected)) continue
      const day = new Date(txn.posted + "T00:00").getDate()
      const drift = Math.min(Math.abs(day - debt.due_day), 31 - Math.abs(day - debt.due_day))
      if (drift <= 7) {
        return { kind: "debt", refId: debt.id, label: `Payment on ${debt.name}` }
      }
    }
  }

  return null
}
