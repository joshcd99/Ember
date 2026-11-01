import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/contexts/AuthContext"
import { useAppData } from "@/contexts/DataContext"
import { supabase } from "@/lib/supabase"
import { formatCurrencyExact, cn } from "@/lib/utils"
import type { Transaction, TransactionType } from "@/types/database"
import { History, ArrowDownLeft, ArrowUpRight, CreditCard, Landmark } from "lucide-react"
import { RecurringScanner } from "@/components/RecurringScanner"

const PAGE_SIZE = 50

type TypeFilter = "all" | TransactionType
type SourceFilter = "all" | "manual" | "simplefin"

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expenses" },
  { value: "debt_payment", label: "Debt payments" },
]

export function Transactions() {
  const { useMockMode } = useAuth()
  const { debts, transactions: mockTransactions, loading: appLoading } = useAppData()

  const [rows, setRows] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all")
  const [debtFilter, setDebtFilter] = useState<string>("all")

  const fetchPage = useCallback(async (offset: number, replace: boolean) => {
    if (useMockMode) {
      setRows(mockTransactions)
      setHasMore(false)
      setLoading(false)
      return
    }
    setLoading(true)
    let query = supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (typeFilter !== "all") query = query.eq("type", typeFilter)
    if (sourceFilter === "manual") query = query.or("source.eq.manual,source.is.null")
    if (sourceFilter === "simplefin") query = query.eq("source", "simplefin")
    if (debtFilter !== "all") query = query.eq("linked_debt_id", debtFilter)

    const { data, error } = await query
    if (!error) {
      const page = (data as Transaction[]) ?? []
      setRows(prev => replace ? page : [...prev, ...page])
      setHasMore(page.length === PAGE_SIZE)
    }
    setLoading(false)
  }, [useMockMode, mockTransactions, typeFilter, sourceFilter, debtFilter])

  useEffect(() => {
    fetchPage(0, true)
  }, [fetchPage])

  const debtName = (id: string | null) => debts.find(d => d.id === id)?.name

  // Group by date, newest first (rows already ordered)
  const groups: { date: string; items: Transaction[] }[] = []
  for (const tx of rows) {
    const last = groups[groups.length - 1]
    if (last && last.date === tx.date) last.items.push(tx)
    else groups.push({ date: tx.date, items: [tx] })
  }

  const dateLabel = (d: string) =>
    new Date(d + "T00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })

  const typeMeta = (tx: Transaction) => {
    switch (tx.type) {
      case "income":
        return { icon: ArrowDownLeft, color: "text-success", sign: "+" }
      case "debt_payment":
        return { icon: CreditCard, color: "text-primary", sign: "-" }
      default:
        return { icon: ArrowUpRight, color: "text-destructive", sign: "-" }
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="font-display text-3xl flex items-center gap-2">
            <History className="h-7 w-7 text-muted-foreground" />
            Transactions
          </h1>
          <p className="text-muted-foreground mt-1">Everything logged by hand or pulled in from your bank.</p>
        </div>
        <RecurringScanner />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {TYPE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTypeFilter(opt.value)}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs border transition-colors",
              typeFilter === opt.value
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/50"
            )}
          >
            {opt.label}
          </button>
        ))}
        <span className="mx-1 h-4 border-l border-border" />
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
          className="h-7 rounded-full border border-border bg-card px-2 text-xs text-muted-foreground"
        >
          <option value="all">Any source</option>
          <option value="manual">Entered by hand</option>
          <option value="simplefin">Bank sync</option>
        </select>
        <select
          value={debtFilter}
          onChange={(e) => setDebtFilter(e.target.value)}
          className="h-7 rounded-full border border-border bg-card px-2 text-xs text-muted-foreground max-w-[180px]"
        >
          <option value="all">Any debt</option>
          {debts.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {appLoading || (loading && rows.length === 0) ? (
        <div className="animate-pulse text-muted-foreground py-12 text-center">Loading transactions...</div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No transactions match these filters yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.date}>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                {dateLabel(group.date)}
              </p>
              <Card>
                <CardContent className="divide-y divide-border py-1">
                  {group.items.map(tx => {
                    const meta = typeMeta(tx)
                    const Icon = meta.icon
                    const linkedDebt = debtName(tx.linked_debt_id)
                    return (
                      <div key={tx.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon className={cn("h-4 w-4 shrink-0", meta.color)} />
                          <div className="min-w-0">
                            <p className="text-sm truncate">{tx.label}</p>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              {linkedDebt && <span className="truncate">{linkedDebt}</span>}
                              {tx.source === "simplefin" && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                                  <Landmark className="h-2.5 w-2.5" /> Synced
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className={cn("text-sm font-medium shrink-0", meta.color)}>
                          {meta.sign}{formatCurrencyExact(tx.amount)}
                        </span>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </div>
          ))}

          {hasMore && (
            <div className="text-center">
              <Button variant="outline" size="sm" disabled={loading} onClick={() => fetchPage(rows.length, false)}>
                {loading ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
