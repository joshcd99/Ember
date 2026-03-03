export interface SavingsSnapshot {
  month: number
  balance: number
  balanceNoInterest: number
}

export interface SavingsMilestone {
  month: number
  balance: number
  balanceNoInterest: number
}

export interface SavingsProjection {
  timeline: SavingsSnapshot[]
  milestones: Record<number, SavingsMilestone>
}

export function projectSavings(options: {
  startingBalance: number
  monthlyNet: number
  apy: number
  months?: number
  purchase?: { amount: number; month: number } | null
}): SavingsProjection {
  const { startingBalance, monthlyNet, apy, months = 36, purchase = null } = options
  const monthlyRate = apy / 12

  const timeline: SavingsSnapshot[] = []
  const milestoneMonths = [6, 12, 24, 36]
  const milestones: Record<number, SavingsMilestone> = {}

  let balance = startingBalance
  let balanceNoInterest = startingBalance

  timeline.push({ month: 0, balance, balanceNoInterest })

  for (let m = 1; m <= months; m++) {
    // Add monthly net contribution
    balance += monthlyNet
    balanceNoInterest += monthlyNet

    // Apply purchase if this is the month
    if (purchase && m === purchase.month) {
      balance -= purchase.amount
      balanceNoInterest -= purchase.amount
    }

    // Apply interest (only on positive balance)
    if (balance > 0) {
      balance *= 1 + monthlyRate
    }

    // Floor at 0
    balance = Math.max(0, balance)
    balanceNoInterest = Math.max(0, balanceNoInterest)

    timeline.push({
      month: m,
      balance: Math.round(balance * 100) / 100,
      balanceNoInterest: Math.round(balanceNoInterest * 100) / 100,
    })

    if (milestoneMonths.includes(m)) {
      milestones[m] = {
        month: m,
        balance: Math.round(balance * 100) / 100,
        balanceNoInterest: Math.round(balanceNoInterest * 100) / 100,
      }
    }
  }

  return { timeline, milestones }
}
