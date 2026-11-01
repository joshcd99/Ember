import type { Bill } from "@/types/database"

/** Raw bank transaction row from simplefin_transactions */
export interface RawBankTxn {
  id: string
  account_id: string
  posted: string
  amount: number
  description: string
}

export type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly"

export const CADENCE_LABELS: Record<Cadence, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
}

export interface RecurringCandidate {
  key: string
  /** Cleaned merchant name, title-cased for display */
  name: string
  sampleDescription: string
  /** Median charge amount (positive) */
  amount: number
  /** Amount swings between charges (e.g. utilities) — median shown */
  amountVaries: boolean
  cadence: Cadence
  occurrences: number
  lastDate: string
  nextExpected: string
  dayOfMonth: number | null
  /** Loosely matches an existing expense name */
  alreadyTracked: boolean
}

const NOISE_TOKENS = new Set([
  "ach", "pos", "debit", "credit", "card", "purchase", "payment", "pmt",
  "recurring", "web", "pymt", "des", "ppd", "co", "id", "online", "autopay",
  "withdrawal", "transaction", "to", "from", "the", "inc", "llc", "com",
])

const STATE_CODES = new Set([
  "al","ak","az","ar","ca","co","ct","de","fl","ga","hi","ia","il","in","ks",
  "ky","la","ma","md","me","mi","mn","mo","ms","mt","nc","nd","ne","nh","nj",
  "nm","nv","ny","oh","ok","or","pa","ri","sc","sd","tn","tx","ut","va","vt",
  "wa","wi","wv","wy","dc",
])

/** Card-payment style descriptors to ignore on liability accounts */
const PAYMENT_PATTERN = /payment|pymt|\bpmt\b|autopay|auto pay|thank you|thankyou|transfer|xfer|epay|bill pay/i

/** Collapse a bank descriptor down to a stable merchant key */
export function normalizeMerchant(description: string): string {
  const tokens = description
    .toLowerCase()
    .replace(/[*#]/g, " ")
    .replace(/\d[\d\-/.:]*/g, " ") // numbers, dates, reference codes
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1 && !NOISE_TOKENS.has(t))
  // Trailing state codes fragment merchants ("xcel energy mn" vs "xcel energy")
  while (tokens.length > 1 && STATE_CODES.has(tokens[tokens.length - 1])) tokens.pop()
  return tokens.slice(0, 3).join(" ")
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function classifyInterval(days: number): Cadence | null {
  if (days >= 5 && days <= 9) return "weekly"
  if (days >= 12 && days <= 17) return "biweekly"
  if (days >= 24 && days <= 37) return "monthly"
  if (days >= 80 && days <= 100) return "quarterly"
  if (days >= 345 && days <= 385) return "yearly"
  return null
}

const CADENCE_DAYS: Record<Cadence, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
  yearly: 365,
}

/**
 * Finds charges that repeat at a steady interval, across checking and
 * liability (credit card / loan) accounts.
 *
 * - Checking/savings: a charge is money out (amount < 0).
 * - Credit cards/loans: institutions disagree on sign, so both signs count,
 *   but payment-style descriptors (card payments, transfers) are skipped.
 * - Two hits are enough for monthly+ cadences when the interval and amount
 *   are tight; weekly/biweekly need three.
 * - Steady amounts (±20%) pass outright; swings up to ±45% (utilities) pass
 *   flagged as "varies", using the median.
 */
export function detectRecurringCharges(
  txns: RawBankTxn[],
  existingBills: Bill[],
  accountKinds?: Map<string, string | null>,
): RecurringCandidate[] {
  const billKeys = existingBills.map(b => normalizeMerchant(b.name)).filter(Boolean)

  const isCharge = (t: RawBankTxn): boolean => {
    const kind = accountKinds?.get(t.account_id)
    if (kind === "credit_card" || kind === "loan") {
      return !PAYMENT_PATTERN.test(t.description)
    }
    return t.amount < 0
  }

  const groups = new Map<string, RawBankTxn[]>()
  for (const t of txns) {
    if (!isCharge(t)) continue
    const key = normalizeMerchant(t.description)
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push(t)
    groups.set(key, list)
  }

  const candidates: RecurringCandidate[] = []

  for (const [key, list] of groups) {
    // One charge per day per merchant; sorted oldest → newest
    const byDate = new Map<string, RawBankTxn>()
    for (const t of list) byDate.set(t.posted, t)
    const hits = [...byDate.values()].sort((a, b) => a.posted.localeCompare(b.posted))
    if (hits.length < 2) continue

    const intervals: number[] = []
    for (let i = 1; i < hits.length; i++) {
      const days = (new Date(hits[i].posted).getTime() - new Date(hits[i - 1].posted).getTime()) / 86400e3
      intervals.push(days)
    }

    const cadence = classifyInterval(median(intervals))
    if (!cadence) continue

    // Every interval must agree with the cadence (one outlier allowed for 5+ hits)
    const misses = intervals.filter(d => classifyInterval(d) !== cadence).length
    if (misses > (hits.length >= 5 ? 1 : 0)) continue

    const amounts = hits.map(h => Math.abs(h.amount))
    const med = median(amounts)
    if (med <= 0) continue
    const maxDeviation = Math.max(...amounts.map(a => Math.abs(a - med) / med))

    if (hits.length === 2) {
      // Only two sightings: trust it only for monthly+ cadences with a tight
      // interval and near-identical amounts
      if (cadence === "weekly" || cadence === "biweekly") continue
      const interval = intervals[0]
      if (cadence === "monthly" && (interval < 26 || interval > 35)) continue
      if (maxDeviation > 0.1) continue
    } else if (maxDeviation > 0.45) {
      continue
    }

    const amountVaries = maxDeviation > 0.2

    const last = hits[hits.length - 1]
    const next = new Date(last.posted + "T00:00")
    if (cadence === "monthly") next.setMonth(next.getMonth() + 1)
    else if (cadence === "quarterly") next.setMonth(next.getMonth() + 3)
    else if (cadence === "yearly") next.setFullYear(next.getFullYear() + 1)
    else next.setDate(next.getDate() + CADENCE_DAYS[cadence])

    candidates.push({
      key,
      name: titleCase(key),
      sampleDescription: last.description,
      amount: Math.round(med * 100) / 100,
      amountVaries,
      cadence,
      occurrences: hits.length,
      lastDate: last.posted,
      nextExpected: next.toISOString().slice(0, 10),
      dayOfMonth: cadence === "monthly" ? new Date(last.posted + "T00:00").getDate() : null,
      alreadyTracked: billKeys.some(bk => bk === key || bk.includes(key) || key.includes(bk)),
    })
  }

  return candidates.sort((a, b) => b.amount - a.amount)
}
