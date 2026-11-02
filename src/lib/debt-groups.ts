import type { Debt } from "@/types/database"
import { isInDeferment } from "@/lib/payoff-engine"

/**
 * Debts sharing a group_name are billed together (e.g. federal student
 * loans under one servicer: one payment, split across loans). The UI
 * shows the group as a single combined card/payment; payoff math stays
 * per-loan since rates differ.
 */
export interface DebtGroup {
  name: string
  debts: Debt[]
  totalBalance: number
  totalStarting: number
  /** Combined monthly payment: sum of actual ?? minimum, skipping deferred loans */
  totalPayment: number
  /** Combined required minimum, skipping deferred loans */
  totalMinimum: number
  /** Balance-weighted average APR */
  weightedApr: number
  /** Most common due day among members */
  dueDay: number
  /** Owner label when every member agrees, else null */
  owner: string | null
  paidOff: boolean
}

export function splitByGroup(debts: Debt[]): { ungrouped: Debt[]; groups: DebtGroup[] } {
  const ungrouped: Debt[] = []
  const byName = new Map<string, Debt[]>()
  for (const d of debts) {
    const g = d.group_name?.trim()
    if (g) {
      const list = byName.get(g) ?? []
      list.push(d)
      byName.set(g, list)
    } else {
      ungrouped.push(d)
    }
  }

  const groups: DebtGroup[] = []
  for (const [name, members] of byName) {
    // A one-debt "group" renders as a plain card
    if (members.length < 2) {
      ungrouped.push(...members)
      continue
    }
    const totalBalance = members.reduce((s, d) => s + d.current_balance, 0)
    const totalStarting = members.reduce((s, d) => s + d.starting_balance, 0)
    const active = members.filter(d => !isInDeferment(d))
    const totalPayment = active.reduce((s, d) => s + (d.actual_payment ?? d.minimum_payment), 0)
    const totalMinimum = active.reduce((s, d) => s + d.minimum_payment, 0)
    const weightedApr = totalBalance > 0
      ? members.reduce((s, d) => s + d.interest_rate * d.current_balance, 0) / totalBalance
      : 0
    const dayCounts = new Map<number, number>()
    for (const d of members) dayCounts.set(d.due_day, (dayCounts.get(d.due_day) ?? 0) + 1)
    const dueDay = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const owners = new Set(members.map(d => d.owner ?? ""))
    groups.push({
      name,
      debts: [...members].sort((a, b) => a.name.localeCompare(b.name)),
      totalBalance,
      totalStarting,
      totalPayment,
      totalMinimum,
      weightedApr,
      dueDay,
      owner: owners.size === 1 ? (members[0].owner ?? null) : null,
      paidOff: totalBalance <= 0.01,
    })
  }
  groups.sort((a, b) => a.name.localeCompare(b.name))
  return { ungrouped, groups }
}

/** All distinct group names, for the group picker datalist */
export function existingGroupNames(debts: Debt[]): string[] {
  return [...new Set(debts.map(d => d.group_name?.trim()).filter((g): g is string => !!g))].sort()
}

/**
 * Splits a combined payment across group members proportionally by
 * balance, cent-exact (leftover cents go to the largest balances) —
 * an approximation of how servicers allocate a single payment.
 */
export function splitGroupPayment(members: Debt[], total: number): Map<string, number> {
  const result = new Map<string, number>()
  const totalBalance = members.reduce((s, d) => s + d.current_balance, 0)
  if (totalBalance <= 0 || total <= 0) {
    for (const d of members) result.set(d.id, 0)
    return result
  }
  const totalCents = Math.round(total * 100)
  let assigned = 0
  const shares = members.map(d => {
    const cents = Math.floor((totalCents * d.current_balance) / totalBalance)
    assigned += cents
    return { id: d.id, cents, balance: d.current_balance }
  })
  // Distribute remaining cents to the largest balances
  let leftover = totalCents - assigned
  const bySize = [...shares].sort((a, b) => b.balance - a.balance)
  for (let i = 0; leftover > 0; i = (i + 1) % bySize.length, leftover--) {
    bySize[i].cents += 1
  }
  for (const s of shares) result.set(s.id, s.cents / 100)
  return result
}
