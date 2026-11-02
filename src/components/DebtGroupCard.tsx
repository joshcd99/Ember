import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { useAppData } from "@/contexts/DataContext"
import { splitGroupPayment, type DebtGroup } from "@/lib/debt-groups"
import { isInDeferment } from "@/lib/payoff-engine"
import { formatCurrency, formatCurrencyExact, formatPercent, cn } from "@/lib/utils"
import type { Debt } from "@/types/database"
import { CheckCircle2, ChevronDown, Flame, Layers, Pencil } from "lucide-react"

/** 3-tier APR badge, matching the single-debt cards */
function aprBadgeVariant(rate: number): "destructive" | "default" | "success" {
  if (rate > 0.15) return "destructive"
  if (rate >= 0.07) return "default"
  return "success"
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

/**
 * One card for a set of debts billed together (e.g. federal student loans:
 * the servicer takes one payment and splits it across every loan). Shows
 * the combined balance/payment; expands to the individual loans.
 */
export function DebtGroupCard({ group, onEditDebt }: { group: DebtGroup; onEditDebt: (d: Debt) => void }) {
  const { updateDebtsBulk } = useAppData()
  const [expanded, setExpanded] = useState(false)
  const [editingPayment, setEditingPayment] = useState(false)
  const [paymentInput, setPaymentInput] = useState("")
  const [saving, setSaving] = useState(false)

  const paid = group.totalStarting - group.totalBalance
  const pct = group.totalStarting > 0 ? (paid / group.totalStarting) * 100 : 0
  const grown = paid < -0.005
  const accrued = -paid
  const deferredCount = group.debts.filter(d => isInDeferment(d)).length

  const startEditPayment = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPaymentInput(group.totalPayment > 0 ? group.totalPayment.toFixed(2) : "")
    setEditingPayment(true)
  }

  const saveGroupPayment = async () => {
    const total = Number(paymentInput)
    if (!(total >= 0)) return
    setSaving(true)
    try {
      // The combined payment is what the servicer requires; split it across
      // the loans proportionally by balance (clearing any per-loan override)
      const shares = splitGroupPayment(group.debts, total)
      await updateDebtsBulk(group.debts.map(d => ({
        id: d.id,
        updates: { minimum_payment: shares.get(d.id) ?? 0, actual_payment: null },
      })))
      setEditingPayment(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={cn("md:row-span-2", group.paidOff && "border-success/30 bg-success/5")}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {group.paidOff ? (
              <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
            ) : (
              <Layers className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            )}
            <CardTitle className={cn("text-base truncate", group.paidOff && "line-through text-muted-foreground")}>
              {group.name}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {group.paidOff && <Badge variant="success">Paid off!</Badge>}
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
              {group.debts.length} loans
            </span>
            {!group.paidOff && group.owner && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                {group.owner}
              </span>
            )}
            {!group.paidOff && (
              <Badge variant={aprBadgeVariant(group.weightedApr)}>
                {formatPercent(group.weightedApr)} avg
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {group.paidOff ? (
          <>
            <div className="flex items-center justify-center gap-2 py-2 text-success">
              <Flame className="h-5 w-5" />
              <span className="text-sm font-semibold">
                All {group.debts.length} loans demolished! {formatCurrency(group.totalStarting)} burned down.
              </span>
            </div>
            <Progress value={100} />
          </>
        ) : (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Combined balance</span>
              <span className="font-semibold">{formatCurrency(group.totalBalance)}</span>
            </div>
            {grown ? (
              <>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-muted-foreground/25"
                    style={{ width: `${(group.totalStarting / group.totalBalance) * 100}%` }}
                  />
                  <div
                    className="h-full bg-destructive/70"
                    style={{ width: `${(accrued / group.totalBalance) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-destructive font-medium">
                  +{formatCurrency(accrued)} accrued over {formatCurrency(group.totalStarting)} original
                </p>
              </>
            ) : (
              <>
                <Progress value={pct} />
                <p className="text-xs text-muted-foreground">{formatCurrency(paid)} paid</p>
              </>
            )}

            {/* The one combined payment */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
              {editingPayment ? (
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      type="number"
                      autoFocus
                      value={paymentInput}
                      onChange={e => setPaymentInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveGroupPayment() }}
                      className="h-8 pl-7 text-sm"
                      placeholder="45.88"
                    />
                  </div>
                  <Button size="sm" className="h-8" onClick={saveGroupPayment} disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setEditingPayment(false)} disabled={saving}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">
                    One payment: <span className="font-semibold">{formatCurrencyExact(group.totalPayment)}/mo</span>
                    <span className="text-muted-foreground"> · due the {ordinal(group.dueDay)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={startEditPayment}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Edit combined payment"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground leading-snug">
                Billed as a single payment, split across {group.debts.length} loans by balance.
              </p>
            </div>

            {group.debts.every(d => d.payment_plan === "rap") && (
              <p className="text-[11px] text-muted-foreground leading-snug">
                On RAP: unpaid interest is waived (the balance can't grow), principal
                drops at least min($50, payment)/mo, and anything left after 30 years
                of payments is forgiven. Projections factor this in.
              </p>
            )}

            {deferredCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {deferredCount} of {group.debts.length} loans still in deferment.
              </p>
            )}
          </>
        )}

        {/* Member loans */}
        <button
          type="button"
          onClick={() => setExpanded(o => !o)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !expanded && "-rotate-90")} />
          {expanded ? "Hide" : "Show"} the {group.debts.length} loans
        </button>
        {expanded && (
          <div className="space-y-1">
            {group.debts.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => onEditDebt(d)}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left hover:border-primary/50 transition-colors"
              >
                <span className="flex-1 text-xs font-medium truncate">{d.name}</span>
                <Badge variant={aprBadgeVariant(d.interest_rate)} className="text-[10px] px-1.5 py-0">
                  {formatPercent(d.interest_rate)}
                </Badge>
                <span className="text-xs tabular-nums w-20 text-right">{formatCurrency(d.current_balance)}</span>
                <Pencil className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
