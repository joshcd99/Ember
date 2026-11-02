import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/AuthContext"
import { useAppData } from "@/contexts/DataContext"
import { supabase } from "@/lib/supabase"
import { suggestForTxn, type AccountInfo, type ReviewTxn } from "@/lib/txn-suggest"
import { formatCurrencyExact, formatDate, cn } from "@/lib/utils"
import { CalendarCheck, Check, ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react"

interface TxnReview {
  sf_txn_id: string
  kind: "bill" | "income" | "debt" | "spending" | "transfer" | "ignore"
  bill_id: string | null
  income_source_id: string | null
  debt_id: string | null
  category: string | null
}

interface AccountRow extends AccountInfo {
  label: string
}

const toISO = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

/**
 * The daily transaction check-in: every synced bank transaction for a
 * chosen day gets matched to a planned bill / income / debt payment,
 * marked as a transfer, or categorized as spending.
 */
export function DailyReview() {
  const { useMockMode, householdId } = useAuth()
  const { bills, incomeSources, debts, billCategories } = useAppData()

  const [day, setDay] = useState(() => toISO(new Date()))
  const [monthTxns, setMonthTxns] = useState<ReviewTxn[]>([])
  const [accounts, setAccounts] = useState<Map<string, AccountRow>>(new Map())
  const [reviews, setReviews] = useState<Map<string, TxnReview>>(new Map())
  const [loading, setLoading] = useState(true)
  const [expandedTxn, setExpandedTxn] = useState<string | null>(null)

  const monthKey = day.slice(0, 7)

  useEffect(() => {
    if (useMockMode || !householdId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const monthStart = `${monthKey}-01`
      const end = new Date(monthStart + "T00:00")
      end.setMonth(end.getMonth() + 1)
      const [acctRes, txnRes, revRes] = await Promise.all([
        supabase
          .from("simplefin_accounts")
          .select("id, name, display_name, account_kind, linked_debt_id")
          .eq("household_id", householdId),
        supabase
          .from("simplefin_transactions")
          .select("id, account_id, posted, amount, description")
          .eq("household_id", householdId)
          .eq("pending", false)
          .gte("posted", monthStart)
          .lt("posted", toISO(end))
          .order("posted", { ascending: false })
          .limit(2000),
        supabase
          .from("txn_reviews")
          .select("sf_txn_id, kind, bill_id, income_source_id, debt_id, category")
          .eq("household_id", householdId)
          .limit(5000),
      ])
      if (cancelled) return
      setAccounts(new Map((acctRes.data ?? []).map(a => [a.id, {
        label: a.display_name || a.name,
        kind: a.account_kind,
        linked_debt_id: a.linked_debt_id,
      }])))
      setMonthTxns((txnRes.data ?? []).map(t => ({ ...t, amount: Number(t.amount) })))
      setReviews(new Map(((revRes.data ?? []) as TxnReview[]).map(r => [r.sf_txn_id, r])))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [useMockMode, householdId, monthKey])

  const dayTxns = useMemo(
    () => monthTxns
      .filter(t => t.posted === day)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    [monthTxns, day]
  )

  const reviewedToday = dayTxns.filter(t => reviews.has(t.id)).length
  const monthUnreviewed = monthTxns.filter(t => !reviews.has(t.id)).length

  // Month-to-date spending by category, from categorized reviews
  const spendingByCategory = useMemo(() => {
    const sums = new Map<string, number>()
    for (const t of monthTxns) {
      const r = reviews.get(t.id)
      if (r?.kind === "spending" && r.category) {
        sums.set(r.category, (sums.get(r.category) ?? 0) + Math.abs(t.amount))
      }
    }
    return [...sums.entries()].sort((a, b) => b[1] - a[1])
  }, [monthTxns, reviews])

  const assign = async (txn: ReviewTxn, review: Omit<TxnReview, "sf_txn_id">) => {
    const row: TxnReview = { sf_txn_id: txn.id, ...review }
    setReviews(prev => new Map(prev).set(txn.id, row))
    setExpandedTxn(null)
    const { error } = await supabase
      .from("txn_reviews")
      .upsert({ household_id: householdId!, ...row }, { onConflict: "sf_txn_id" })
    if (error) {
      console.error("DailyReview: save failed", error)
      setReviews(prev => {
        const next = new Map(prev)
        next.delete(txn.id)
        return next
      })
    }
  }

  const clear = async (txn: ReviewTxn) => {
    const prev = reviews.get(txn.id)
    setReviews(m => {
      const next = new Map(m)
      next.delete(txn.id)
      return next
    })
    const { error } = await supabase.from("txn_reviews").delete().eq("sf_txn_id", txn.id)
    if (error && prev) {
      console.error("DailyReview: clear failed", error)
      setReviews(m => new Map(m).set(txn.id, prev))
    }
  }

  const reviewLabel = (r: TxnReview): { label: string; color?: string } => {
    switch (r.kind) {
      case "bill": return { label: bills.find(b => b.id === r.bill_id)?.name ?? "Bill", color: "#5F9EA0" }
      case "income": return { label: incomeSources.find(s => s.id === r.income_source_id)?.name ?? "Income", color: "#6AAF7D" }
      case "debt": return { label: `Payment: ${debts.find(d => d.id === r.debt_id)?.name ?? "debt"}`, color: "#5F9EA0" }
      case "transfer": return { label: "Transfer", color: "#a8a29e" }
      case "ignore": return { label: "Skipped", color: "#a8a29e" }
      case "spending": {
        const cat = billCategories.find(c => c.name === r.category)
        return { label: r.category ?? "Spending", color: cat?.color ?? "#D4A844" }
      }
    }
  }

  const shiftDay = (delta: number) => {
    const d = new Date(day + "T00:00")
    d.setDate(d.getDate() + delta)
    setDay(toISO(d))
  }

  if (useMockMode) return null

  const isToday = day === toISO(new Date())

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="h-5 w-5 text-muted-foreground" />
            Daily Review
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => shiftDay(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <input
              type="date"
              value={day}
              onChange={e => e.target.value && setDay(e.target.value)}
              className="h-8 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
            />
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => shiftDay(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isToday && (
              <Button variant="outline" size="sm" className="h-8" onClick={() => setDay(toISO(new Date()))}>
                Today
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {dayTxns.length === 0
            ? `No bank activity on ${formatDate(day)}.`
            : `${reviewedToday} of ${dayTxns.length} reviewed on ${formatDate(day)}`}
          {monthUnreviewed > 0 && ` · ${monthUnreviewed} unreviewed this month`}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground animate-pulse">Loading bank activity…</p>}

        {!loading && dayTxns.map(txn => {
          const review = reviews.get(txn.id)
          const account = accounts.get(txn.account_id)
          const suggestion = review ? null : suggestForTxn(txn, monthTxns, accounts, bills, incomeSources, debts)
          const expanded = expandedTxn === txn.id

          return (
            <div key={txn.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{txn.description || "(no description)"}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{account?.label}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("text-sm font-semibold tabular-nums", txn.amount > 0 ? "text-success" : "")}>
                    {txn.amount > 0 ? "+" : "−"}{formatCurrencyExact(Math.abs(txn.amount))}
                  </span>
                  {review && (
                    <button type="button" onClick={() => clear(txn)} title="Undo" className="text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {review ? (
                (() => {
                  const { label, color } = reviewLabel(review)
                  return (
                    <div className="flex items-center gap-1.5 text-xs">
                      <Check className="h-3.5 w-3.5 text-success" />
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-muted-foreground">{label}</span>
                    </div>
                  )
                })()
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  {suggestion && (
                    <button
                      type="button"
                      onClick={() => assign(txn, {
                        kind: suggestion.kind,
                        bill_id: suggestion.kind === "bill" ? suggestion.refId ?? null : null,
                        income_source_id: suggestion.kind === "income" ? suggestion.refId ?? null : null,
                        debt_id: suggestion.kind === "debt" ? suggestion.refId ?? null : null,
                        category: null,
                      })}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors"
                    >
                      <Sparkles className="h-3 w-3" /> {suggestion.label}
                    </button>
                  )}
                  {!expanded ? (
                    <button
                      type="button"
                      onClick={() => setExpandedTxn(txn.id)}
                      className="px-2.5 py-1 rounded-full text-xs border border-border text-muted-foreground hover:border-primary/50 transition-colors"
                    >
                      Categorize…
                    </button>
                  ) : (
                    <>
                      {billCategories.map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => assign(txn, { kind: "spending", bill_id: null, income_source_id: null, debt_id: null, category: cat.name })}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border border-border text-muted-foreground hover:border-primary/50 transition-colors"
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                          {cat.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => assign(txn, { kind: "transfer", bill_id: null, income_source_id: null, debt_id: null, category: null })}
                        className="px-2 py-1 rounded-full text-[11px] border border-border text-muted-foreground hover:border-primary/50 transition-colors"
                      >
                        Transfer
                      </button>
                      <button
                        type="button"
                        onClick={() => assign(txn, { kind: "ignore", bill_id: null, income_source_id: null, debt_id: null, category: null })}
                        className="px-2 py-1 rounded-full text-[11px] border border-border text-muted-foreground hover:border-primary/50 transition-colors"
                      >
                        Skip
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {!loading && dayTxns.length > 0 && reviewedToday === dayTxns.length && (
          <p className="text-sm text-success flex items-center gap-1.5">
            <Check className="h-4 w-4" /> All of {formatDate(day)} reviewed. Nice.
          </p>
        )}

        {spendingByCategory.length > 0 && (
          <div className="pt-3 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-2">Spending so far this month</p>
            <div className="flex flex-wrap gap-2">
              {spendingByCategory.map(([name, total]) => {
                const cat = billCategories.find(c => c.name === name)
                return (
                  <span key={name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-muted">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cat?.color ?? "#D4A844" }} />
                    {name}
                    <span className="font-semibold">{formatCurrencyExact(total)}</span>
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
