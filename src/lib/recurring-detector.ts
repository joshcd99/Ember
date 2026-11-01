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
  /** Most recent charge amount (positive) */
  amount: number
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
  "withdrawal", "transaction", "to", "from", "the",
])

/** Collapse a bank descriptor down to a stable merchant key */
export function normalizeMerchant(description: string): string {
  const tokens = description
    .toLowerCase()
    .replace(/[*#]/g, " ")
    .replace(/\d[\d\-/.:]*/g, " ") // numbers, dates, reference codes
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1 && !NOISE_TOKENS.has(t))
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
  if (days >= 25 && days <= 35) return "monthly"
  if (days >= 80 && days <= 100) return "quarterly"
  if (days >= 350 && days <= 380) return "yearly"
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
 * Finds charges that repeat at a steady interval with a steady amount.
 * Needs at least 3 hits for short cadences, 2 for quarterly/yearly.
 */
export function detectRecurringCharges(txns: RawBankTxn[], existingBills: Bill[]): RecurringCandidate[] {
  const billKeys = existingBills.map(b => normalizeMerchant(b.name)).filter(Boolean)

  // Charges only (money out), grouped by merchant
  const groups = new Map<string, RawBankTxn[]>()
  for (const t of txns) {
    if (t.amount >= 0) continue
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

    // Short cadences need 3 hits to trust; long ones accept 2
    const minHits = cadence === "quarterly" || cadence === "yearly" ? 2 : 3
    if (hits.length < minHits) continue

    // Amounts must be steady: within 20% of the median (or all identical)
    const amounts = hits.map(h => Math.abs(h.amount))
    const med = median(amounts)
    if (med <= 0 || amounts.some(a => Math.abs(a - med) / med > 0.2)) continue

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
      amount: Math.round(Math.abs(last.amount) * 100) / 100,
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
