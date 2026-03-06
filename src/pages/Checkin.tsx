import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CheckCircle2, Plus, Flame, ShoppingCart, DollarSign, CreditCard, Coffee, PiggyBank, PartyPopper } from "lucide-react"
import { useAppData } from "@/contexts/DataContext"
import { getCheckinStreak } from "@/lib/mock-data"
import { formatCurrency, formatDate } from "@/lib/utils"
import { celebrateDebtPayoff } from "@/lib/confetti"
import type { TransactionType } from "@/types/database"
import type { Debt } from "@/types/database"

const typeConfig: Record<TransactionType, { label: string; icon: React.ReactNode; color: string }> = {
  expense: { label: "Spending", icon: <ShoppingCart className="h-5 w-5" />, color: "text-destructive" },
  income: { label: "Income Received", icon: <DollarSign className="h-5 w-5" />, color: "text-success" },
  debt_payment: { label: "Debt Payment", icon: <CreditCard className="h-5 w-5" />, color: "text-primary" },
}

export function Checkin() {
  const { checkins, transactions, debts, savingsAccount, addTransaction, logCheckin, updateDebt, updateSavingsAccount, loading } = useAppData()

  const [step, setStep] = useState<"start" | "type" | "details" | "savings" | "done">("start")
  const [selectedType, setSelectedType] = useState<TransactionType | null>(null)
  const [amount, setAmount] = useState("")
  const [label, setLabel] = useState("")
  const [saving, setSaving] = useState(false)

  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null)
  const [debtPaidOff, setDebtPaidOff] = useState(false)

  const [savingsBalance, setSavingsBalance] = useState(0)
  const [savingsApy, setSavingsApy] = useState(0)
  const [savingSavings, setSavingSavings] = useState(false)

  useEffect(() => {
    if (savingsAccount) {
      setSavingsBalance(savingsAccount.current_balance)
      setSavingsApy(savingsAccount.apy * 100)
    }
  }, [savingsAccount])

  // Fire confetti when a debt is paid off
  useEffect(() => {
    if (debtPaidOff && step === "done") {
      celebrateDebtPayoff()
    }
  }, [debtPaidOff, step])

  if (loading) {
    return <div className="animate-pulse text-muted-foreground py-12 text-center">Loading...</div>
  }

  const streak = getCheckinStreak(checkins)
  const todayStr = new Date().toISOString().split("T")[0]
  const todayEntries = transactions.filter(t => t.date === todayStr)
  const checkedInToday = checkins.some(c => c.date === todayStr && c.completed_at)

  const activeDebts = debts.filter(d => d.current_balance > 0)

  const handleSelectDebt = (debt: Debt) => {
    setSelectedDebt(debt)
    setAmount(String(debt.actual_payment ?? debt.minimum_payment))
    setLabel(debt.name)
  }

  const handleSubmit = async () => {
    if (!selectedType || !amount || !label) return
    setSaving(true)
    try {
      const paymentAmount = Number(amount)

      await addTransaction({
        type: selectedType,
        amount: paymentAmount,
        label,
        date: todayStr,
        linked_income_source_id: null,
        linked_debt_id: selectedDebt?.id ?? null,
        is_projected: false,
      })

      // Update debt balance if linked
      if (selectedDebt) {
        const newBalance = Math.max(0, selectedDebt.current_balance - paymentAmount)
        await updateDebt(selectedDebt.id, { current_balance: newBalance })
        if (newBalance === 0) {
          setDebtPaidOff(true)
        }
      }

      await logCheckin()
      setStep("done")
    } catch {
      // handle error
    } finally {
      setSaving(false)
    }
  }

  const handleSavingsSubmit = async () => {
    setSavingSavings(true)
    try {
      await updateSavingsAccount({
        current_balance: savingsBalance,
        apy: savingsApy / 100,
      })
      await logCheckin()
      setStep("done")
      setLabel("Balance check-in")
      setAmount(String(savingsBalance))
    } catch {
      // handle error
    } finally {
      setSavingSavings(false)
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
    setSelectedDebt(null)
    setDebtPaidOff(false)
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
            variant="outline"
            size="lg"
            className="w-full h-14 justify-start gap-4"
            onClick={() => setStep("savings")}
          >
            <span className="text-success"><PiggyBank className="h-5 w-5" /></span>
            Balance Check-in
          </Button>
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

      {step === "details" && selectedType === "debt_payment" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-primary">
                <CreditCard className="h-5 w-5" />
              </span>
              Debt Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Debt picker */}
            {activeDebts.length > 0 && !selectedDebt && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Which debt?</label>
                <div className="space-y-2">
                  {activeDebts.map(debt => (
                    <button
                      key={debt.id}
                      type="button"
                      onClick={() => handleSelectDebt(debt)}
                      className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-left"
                    >
                      <div>
                        <p className="text-sm font-medium">{debt.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Balance: {formatCurrency(debt.current_balance)}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-primary">
                        {formatCurrency(debt.actual_payment ?? debt.minimum_payment)}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDebt(null)
                      setAmount("")
                      setLabel("")
                    }}
                    className="w-full p-3 rounded-lg border border-dashed border-border hover:border-primary/50 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Other / unlisted debt
                  </button>
                </div>
              </div>
            )}

            {/* Amount + label fields (shown after picking a debt, or if no active debts, or "other") */}
            {(selectedDebt || activeDebts.length === 0) && (
              <>
                {selectedDebt && (
                  <div className="flex items-center justify-between p-2 rounded-md bg-primary/5 border border-primary/20">
                    <span className="text-sm font-medium">{selectedDebt.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDebt(null)
                        setAmount("")
                        setLabel("")
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Change
                    </button>
                  </div>
                )}
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
                    placeholder="e.g., Extra payment — Chase Visa"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                  />
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => {
                    setSelectedDebt(null)
                    setAmount("")
                    setLabel("")
                    setStep("type")
                  }}>
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
              </>
            )}

            {/* Back button when in picker view */}
            {!selectedDebt && activeDebts.length > 0 && (
              <Button variant="outline" className="w-full" onClick={() => setStep("type")}>
                Back
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {step === "details" && selectedType && selectedType !== "debt_payment" && (
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
                    : "e.g., Paycheck, Freelance"
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

      {step === "savings" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-success"><PiggyBank className="h-5 w-5" /></span>
              Balance Check-in
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Savings balance</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={savingsBalance || ""}
                  onChange={(e) => setSavingsBalance(Number(e.target.value))}
                  className="pl-7"
                  placeholder="0"
                  autoFocus
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">APY</label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={savingsApy || ""}
                  onChange={(e) => setSavingsApy(Number(e.target.value))}
                  className="pr-8"
                  placeholder="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
              </div>
            </div>
            {savingsAccount?.last_verified_at && (
              <p className="text-xs text-muted-foreground">
                Last verified {formatDate(savingsAccount.last_verified_at)}
              </p>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep("type")}>
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={handleSavingsSubmit}
                disabled={savingSavings}
              >
                {savingSavings ? "Saving..." : "Submit"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "done" && (
        <Card className="text-center">
          <CardContent className="py-8">
            {debtPaidOff ? (
              <>
                <PartyPopper className="h-12 w-12 text-warning mx-auto mb-3" />
                <h2 className="text-xl font-semibold mb-1">Debt demolished!</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  {formatCurrency(Number(amount))} — {label} is paid off!
                </p>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
                <h2 className="text-xl font-semibold mb-1">Feeding the flame.</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  {amount ? `${formatCurrency(Number(amount))} — ${label}` : "Still burning. Nothing to log today."}
                </p>
              </>
            )}
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
