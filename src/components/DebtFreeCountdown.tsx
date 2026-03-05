import { useState, useRef, useMemo } from "react"
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { formatCurrency, formatDate, formatCountdown } from "@/lib/utils"
import { differenceInDays } from "date-fns"
import { Share2, X, Flame } from "lucide-react"

interface DebtFreeCountdownProps {
  debtFreeDate: Date | null
  months: number | null
  totalDebt: number
  startingDebt: number
  progressPercent: number
  paidOff: number
  strategyLabel?: string
}

export function DebtFreeCountdown({ debtFreeDate, months, totalDebt, startingDebt, progressPercent, paidOff, strategyLabel }: DebtFreeCountdownProps) {
  const [showCelebration, setShowCelebration] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const shareCardRef = useRef<HTMLDivElement>(null)

  const daysRemaining = useMemo(() => {
    if (!debtFreeDate) return null
    return Math.max(0, differenceInDays(debtFreeDate, new Date()))
  }, [debtFreeDate])

  const isDebtFree = totalDebt <= 0.01 && startingDebt > 0

  const handleShare = async () => {
    if (!shareCardRef.current) return
    try {
      const html2canvas = (await import("html2canvas")).default
      const canvas = await html2canvas(shareCardRef.current, {
        backgroundColor: "#141210",
        scale: 2,
      })
      canvas.toBlob(blob => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "ember-debt-free.png"
        a.click()
        URL.revokeObjectURL(url)
      })
    } catch {
      // Fallback if html2canvas fails
    }
  }

  // Celebration screen
  if (isDebtFree || showCelebration) {
    return (
      <>
        <Card className="border-warning/30 bg-warning/5 overflow-hidden">
          <CardContent className="py-8 text-center space-y-4 relative">
            <div className="text-6xl">🔥</div>
            <h2 className="font-display text-3xl text-warning">You did it!</h2>
            <p className="text-muted-foreground">
              You paid off {formatCurrency(startingDebt)} in debt. That fire burned bright.
            </p>
            <div className="flex justify-center gap-3">
              <Button onClick={() => setShowShare(true)}>
                <Share2 className="h-4 w-4" /> Share your win
              </Button>
              {!isDebtFree && (
                <Button variant="outline" onClick={() => setShowCelebration(false)}>
                  Back
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Shareable card overlay */}
        {showShare && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-card rounded-xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Your shareable card</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowShare(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {/* The card to capture */}
              <div
                ref={shareCardRef}
                className="rounded-xl p-8 text-center space-y-3"
                style={{ backgroundColor: "#141210", color: "#fafaf8" }}
              >
                <div className="text-4xl">🔥</div>
                <p className="font-display text-2xl" style={{ color: "#e8845a" }}>
                  I paid off {formatCurrency(startingDebt)} in debt
                </p>
                <p style={{ color: "#a8a29e" }}>Powered by Ember</p>
              </div>
              <Button className="w-full" onClick={handleShare}>
                Save as image
              </Button>
            </div>
          </div>
        )}
      </>
    )
  }

  // Regular countdown card
  return (
    <Card>
      <CardHeader>
        <CardDescription>Debt-Free Countdown</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {debtFreeDate ? (
          <>
            <p className="font-display text-2xl">{formatDate(debtFreeDate)}</p>
            {daysRemaining !== null && daysRemaining > 0 && (
              <p className={`text-lg font-semibold flex items-center gap-2 ${daysRemaining < 30 ? "text-warning" : "text-primary"}`}>
                {daysRemaining < 30 && <Flame className="h-5 w-5" />}
                {formatCountdown(daysRemaining)}
              </p>
            )}
            <Progress value={progressPercent} className="mt-2" />
            <p className="text-xs text-muted-foreground">
              {formatCurrency(paidOff)} paid off ({progressPercent.toFixed(0)}%)
              {strategyLabel ? ` · ${strategyLabel}` : months ? ` · ${months} months at current pace` : ""}
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-2xl">—</p>
            <p className="text-xs text-muted-foreground">Add debts and income to see your timeline</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
