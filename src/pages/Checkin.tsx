import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CheckCircle2, Plus, Flame, ShoppingCart, DollarSign, CreditCard, Coffee } from "lucide-react"
import { useAppData } from "@/contexts/DataContext"
import { getCheckinStreak } from "@/lib/mock-data"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { TransactionType } from "@/types/database"

const typeConfig: Record<TransactionType, { label: string; icon: React.ReactNode; color: string }> = {
  expense: { label: "Spending", icon: <ShoppingCart className="h-5 w-5" />, color: "text-destructive" },
  income: { label: "Income Received", icon: <DollarSign className="h-5 w-5" />, color: "text-success" },
  debt_payment: { label: "Debt Payment", icon: <CreditCard className="h-5 w-5" />, color: "text-primary" },
}

export function Checkin() {
  const { checkins, transactions, addTransaction, logCheckin, loading } = useAppData()

  const [step, setStep] = useState<"start" | "type" | "details" | "done">("start")
  const [selectedType, setSelectedType] = useState<TransactionType | null>(null)
  const [amount, setAmount] = useState("")
  const [label, setLabel] = useState("")
  const [saving, setSaving] = useState(false)

  if (loading) {
    return <div className="animate-pulse text-muted-foreground py-12 text-center">Loading...</div>
  }

  const streak = getCheckinStreak(checkins)
  const todayStr = new Date().toISOString().split("T")[0]
  const todayEntries = transactions.filter(t => t.date === todayStr)
  const checkedInToday = checkins.some(c => c.date === todayStr && c.completed_at)

  const handleSubmit = async () => {
    if (!selectedType || !amount || !label) return
    setSaving(true)
    try {
      await addTransaction({
        type: selectedType,
        amount: Number(amount),
        label,
        date: todayStr,
        linked_income_source_id: null,
        linked_debt_id: null,
        is_projected: false,
      })
      await logCheckin()
      setStep("done")
    } catch {
      // handle error
    } finally {
      setSaving(false)
    }
  }

  const handleNothingToday = async () => {
    setSaving(true)
    try {
      await logCheckin()
      setStep("done")
    } catch {
      // handle error
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setStep("start")
    setSelectedType(null)
    setAmount("")
    setLabel("")
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center">
        <h1 className="font-display text-3xl">Daily Check-in</h1>
        <p className="text-muted-foreground mt-1">Quick and easy. Keep the ember going.</p>
      </div>

      {/* Streak */}
      <Card className="text-center">
        <CardContent className="py-6">
          <Flame className="h-10 w-10 text-warning mx-auto mb-2" />
          <p className="text-3xl font-bold">{streak} day streak</p>
          <p className="text-sm text-muted-foreground mt-1">
            {streak === 0 ? "Light the match." : "Still burning. Keep it going!"}
          </p>
        </CardContent>
      </Card>

      {/* Already checked in today */}
      {checkedInToday && step === "start" && (
        <Card className="border-success/30 bg-success/5 text-center">
          <CardContent className="py-4">
            <CheckCircle2 className="h-6 w-6 text-success mx-auto mb-1" />
            <p className="text-sm font-medium text-success">Already checked in today. The ember's still lit.</p>
          </CardContent>
        </Card>
      )}

      {/* Check-in flow */}
      {step === "start" && (
        <div className="space-y-4">
          <Button
            size="lg"
            className="w-full h-16 text-lg"
            onClick={() => setStep("type")}
          >
            <Plus className="h-6 w-6 mr-2" />
            Add an entry
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full h-12"
            onClick={handleNothingToday}
            disabled={saving}
          >
            {saving ? "Logging..." : "Nothing to log today"}
          </Button>
        </div>
      )}

      {step === "type" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-center text-muted-foreground">What are you logging?</p>
          {(Object.keys(typeConfig) as TransactionType[]).map(type => {
            const config = typeConfig[type]
            return (
              <Button
                key={type}
                variant="outline"
                size="lg"
                className="w-full h-14 justify-start gap-4"
                onClick={() => {
                  setSelectedType(type)
                  setStep("details")
                }}
              >
                <span className={config.color}>{config.icon}</span>
                {config.label}
              </Button>
            )
          })}
          <Button
            variant="ghost"
            size="lg"
            className="w-full h-12 text-muted-foreground"
            onClick={handleNothingToday}
            disabled={saving}
          >
            <Coffee className="h-5 w-5 mr-2" />
            {saving ? "Logging..." : "Nothing to log today"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setStep("start")}>
            Back
          </Button>
        </div>
      )}

      {step === "details" && selectedType && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className={typeConfig[selectedType].color}>
                {typeConfig[selectedType].icon}
              </span>
              {typeConfig[selectedType].label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="pl-7"
                  autoFocus
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Label</label>
              <Input
                placeholder={
                  selectedType === "expense"
                    ? "e.g., Groceries, Coffee"
                    : selectedType === "income"
                    ? "e.g., Paycheck, Freelance"
                    : "e.g., Extra payment — Chase Visa"
                }
                value={label}
                onChange={e => setLabel(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep("type")}>
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={!amount || !label || saving}
              >
                {saving ? "Saving..." : "Submit"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "done" && (
        <Card className="text-center">
          <CardContent className="py-8">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
            <h2 className="text-xl font-semibold mb-1">Feeding the flame.</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {amount ? `${formatCurrency(Number(amount))} — ${label}` : "Still burning. Nothing to log today."}
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={reset}>
                Add another
              </Button>
              <Button onClick={reset}>
                Done
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's entries */}
      {todayEntries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Today's entries</h3>
          <div className="space-y-2">
            {todayEntries.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <span className={typeConfig[t.type].color}>
                    {typeConfig[t.type].icon}
                  </span>
                  <span className="text-sm">{t.label}</span>
                </div>
                <span className="text-sm font-medium">{formatCurrency(t.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent check-ins */}
      {checkins.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Recent check-ins</h3>
          <div className="flex flex-wrap gap-2">
            {checkins.slice(0, 14).map(c => (
              <div
                key={c.id}
                className="h-8 w-8 rounded-md bg-primary/15 flex items-center justify-center"
                title={formatDate(c.date)}
              >
                <CheckCircle2 className="h-4 w-4 text-primary" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
