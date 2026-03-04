import { useMemo, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/EmptyState"
import { useAppData } from "@/contexts/DataContext"
import { calculatePayoff } from "@/lib/payoff-engine"
import { getCheckinStreak } from "@/lib/mock-data"
import { formatCurrency } from "@/lib/utils"
import { Sparkles, Share2, X } from "lucide-react"

export function Review() {
  const { debts, transactions, checkins, bills, loading } = useAppData()
  const shareRef = useRef<HTMLDivElement>(null)
  const [showShare, setShowShare] = useState(false)

  // Determine data age
  const earliestDate = useMemo(() => {
    const dates: number[] = []
    for (const d of debts) dates.push(new Date(d.created_at).getTime())
    for (const t of transactions) dates.push(new Date(t.date).getTime())
    return dates.length > 0 ? new Date(Math.min(...dates)) : null
  }, [debts, transactions])

  const monthsOfData = useMemo(() => {
    if (!earliestDate) return 0
    const now = new Date()
    return (now.getFullYear() - earliestDate.getFullYear()) * 12 + (now.getMonth() - earliestDate.getMonth())
  }, [earliestDate])

  // Review stats
  const stats = useMemo(() => {
    if (monthsOfData < 6) return null

    // Period: trailing 12 months or since earliest
    const now = new Date()
    const periodStart = new Date(now.getFullYear() - 1, now.getMonth(), 1)

    // Debt paid down
    const totalStarting = debts.reduce((s, d) => s + d.starting_balance, 0)
    const totalCurrent = debts.reduce((s, d) => s + d.current_balance, 0)
    const debtPaidDown = totalStarting - totalCurrent
    const debtPaidPercent = totalStarting > 0 ? (debtPaidDown / totalStarting) * 100 : 0

    // Interest avoided: minimums-only interest vs actual (estimated)
    const minimumsResult = calculatePayoff(debts.map(d => ({ ...d, current_balance: d.starting_balance })), "minimums")
    const avalancheResult = calculatePayoff(debts, "avalanche")
    const interestAvoided = Math.max(0, minimumsResult.totalInterest - avalancheResult.totalInterest)

    // Biggest single payment
    const debtPayments = transactions.filter(t => t.type === "debt_payment")
    const biggestPayment = debtPayments.reduce((max, t) => t.amount > max.amount ? t : max, { amount: 0, label: "None" } as { amount: number; label: string })

    // Best streak
    const bestStreak = getCheckinStreak(checkins)

    // Bills paid
    const expenseTransactions = transactions.filter(t =>
      t.type === "expense" && new Date(t.date) >= periodStart
    )
    const billsPaidCount = expenseTransactions.length + bills.length * Math.min(12, monthsOfData)
    const billsPaidTotal = bills.reduce((s, b) => s + b.amount, 0) * Math.min(12, monthsOfData)

    // Months ahead of minimums
    const monthsAhead = Math.max(0, minimumsResult.months - avalancheResult.months)

    return {
      debtPaidDown,
      debtPaidPercent,
      interestAvoided,
      biggestPayment,
      bestStreak,
      billsPaidCount,
      billsPaidTotal,
      monthsAhead,
      totalStarting,
    }
  }, [debts, transactions, checkins, bills, monthsOfData])

  const handleShare = async () => {
    if (!shareRef.current) return
    try {
      const html2canvas = (await import("html2canvas")).default
      const canvas = await html2canvas(shareRef.current, {
        backgroundColor: "#141210",
        scale: 2,
      })
      canvas.toBlob(blob => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "ember-year-in-review.png"
        a.click()
        URL.revokeObjectURL(url)
      })
    } catch {
      // Fallback
    }
  }

  if (loading) {
    return <div className="animate-pulse text-muted-foreground py-12 text-center">Loading...</div>
  }

  if (monthsOfData < 6 || !stats) {
    const monthsNeeded = 6 - monthsOfData
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl">Year in Review</h1>
          <p className="text-muted-foreground mt-1">Look back at what you've accomplished.</p>
        </div>
        <EmptyState
          icon={<Sparkles className="h-8 w-8 text-warning" />}
          title="Your first review is coming"
          description={`You need at least 6 months of data. Your first review will be ready in ${monthsNeeded > 0 ? monthsNeeded : 1} month${monthsNeeded !== 1 ? "s" : ""}. Keep going!`}
        />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <p className="text-warning text-sm font-medium tracking-widest uppercase">Year in Review</p>
        <h1 className="font-display text-4xl">Your Ember Journey</h1>
        <p className="text-muted-foreground">Here's what you accomplished.</p>
      </div>

      {/* Stats */}
      <div className="space-y-6">
        {/* Debt paid down */}
        <Card className="border-primary/20">
          <CardContent className="py-8 text-center space-y-2">
            <p className="text-sm text-muted-foreground uppercase tracking-widest">Total debt paid down</p>
            <p className="font-display text-5xl text-primary">{formatCurrency(stats.debtPaidDown)}</p>
            <p className="text-muted-foreground">{stats.debtPaidPercent.toFixed(0)}% of {formatCurrency(stats.totalStarting)}</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          {/* Interest avoided */}
          <Card>
            <CardContent className="py-6 text-center space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Interest avoided</p>
              <p className="font-display text-3xl text-success">{formatCurrency(stats.interestAvoided)}</p>
              <p className="text-xs text-muted-foreground">vs minimums only</p>
            </CardContent>
          </Card>

          {/* Months ahead */}
          <Card>
            <CardContent className="py-6 text-center space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Months ahead</p>
              <p className="font-display text-3xl text-warning">{stats.monthsAhead}</p>
              <p className="text-xs text-muted-foreground">ahead of minimum payments</p>
            </CardContent>
          </Card>
        </div>

        {/* Biggest payment */}
        <Card>
          <CardContent className="py-6 text-center space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Biggest single payment</p>
            <p className="font-display text-3xl">{formatCurrency(stats.biggestPayment.amount)}</p>
            <p className="text-sm text-muted-foreground">{stats.biggestPayment.label}</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          {/* Best streak */}
          <Card>
            <CardContent className="py-6 text-center space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Best check-in streak</p>
              <p className="font-display text-3xl">{stats.bestStreak} days</p>
            </CardContent>
          </Card>

          {/* Bills paid */}
          <Card>
            <CardContent className="py-6 text-center space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Bills handled</p>
              <p className="font-display text-3xl">{formatCurrency(stats.billsPaidTotal)}</p>
              <p className="text-xs text-muted-foreground">~{stats.billsPaidCount} payments</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Share button */}
      <div className="text-center">
        <Button onClick={() => setShowShare(true)}>
          <Share2 className="h-4 w-4" /> Generate review card
        </Button>
      </div>

      {/* Share modal */}
      {showShare && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Your review card</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowShare(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div
              ref={shareRef}
              className="rounded-xl p-8 text-center space-y-4"
              style={{ backgroundColor: "#141210", color: "#fafaf8" }}
            >
              <div className="text-3xl">🔥</div>
              <p style={{ color: "#e8845a", fontFamily: "Instrument Serif, serif", fontSize: "1.5rem" }}>
                Year in Review
              </p>
              <p style={{ fontSize: "2rem", fontWeight: "bold" }}>
                {formatCurrency(stats.debtPaidDown)} paid off
              </p>
              <p style={{ color: "#a8a29e" }}>
                {formatCurrency(stats.interestAvoided)} in interest avoided
              </p>
              <p style={{ color: "#6b7280", fontSize: "0.75rem" }}>Powered by Ember</p>
            </div>
            <Button className="w-full" onClick={handleShare}>
              Save as image
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
