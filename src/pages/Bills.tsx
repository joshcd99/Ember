import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/EmptyState"
import { BillModal } from "@/components/modals/BillModal"
import { Receipt, Plus, Pencil, Download, ChevronRight, CreditCard, Flame, Filter, ArrowUpDown } from "lucide-react"
import { useAppData } from "@/contexts/DataContext"
import { getMonthlyBills, getMonthlyIncome, getMonthlyMinimums } from "@/lib/mock-data"
import { formatRecurrence } from "@/lib/recurrence"
import { cn, formatCurrency, formatCurrencyExact, formatPercent, formatDate } from "@/lib/utils"
import { downloadCSV } from "@/lib/csv"
import { DEBT_TYPE_META, DEBT_TYPE_CHART_COLORS } from "@/lib/debt-types"
import type { Bill, DebtType } from "@/types/database"

export function Bills() {
  const { bills, billCategories, debts, incomeSources, householdSettings, loading } = useAppData()
  const navigate = useNavigate()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingBill, setEditingBill] = useState<Bill | null>(null)
  const [billFilter, setBillFilter] = useState<string>("all")
  const [billSort, setBillSort] = useState<"category" | "name" | "amount" | "due">("category")

  const billsSectionRef = useRef<HTMLDivElement>(null)
  const debtSectionRef = useRef<HTMLDivElement>(null)

  if (loading) {
    return <div className="animate-pulse text-muted-foreground py-12 text-center">Loading...</div>
  }

  const monthlyBillsTotal = getMonthlyBills(bills)
  const monthlyMinimums = getMonthlyMinimums(debts)
  const monthlyIncome = getMonthlyIncome(incomeSources)

  // Extra payment calculation
  const savedExtraType = householdSettings?.extra_payment_type ?? "fixed"
  const savedExtraAmount = householdSettings?.extra_payment_amount ?? 0
  let extraPayment = 0
  if (savedExtraType === "percent_of_free_cash") {
    const freeCash = monthlyIncome - monthlyBillsTotal - monthlyMinimums
    extraPayment = Math.max(0, Math.floor(freeCash * savedExtraAmount / 100))
  } else {
    extraPayment = savedExtraAmount
  }

  const totalMonthlyOut = monthlyBillsTotal + monthlyMinimums + extraPayment

  const getCategoryColor = (categoryName: string) => {
    return billCategories.find(c => c.name === categoryName)?.color
  }

  const openAdd = () => { setEditingBill(null); setModalOpen(true) }
  const openEdit = (b: Bill) => { setEditingBill(b); setModalOpen(true) }

  // Group debts by type for the debt minimums section
  const debtsByType = new Map<DebtType, typeof debts>()
  for (const d of debts) {
    const type = d.debt_type ?? "other"
    const group = debtsByType.get(type) ?? []
    group.push(d)
    debtsByType.set(type, group)
  }
  // Sort each group by minimum_payment descending
  for (const group of debtsByType.values()) {
    group.sort((a, b) => b.minimum_payment - a.minimum_payment)
  }

  const renderBillCard = (bill: Bill, getCatColor: (name: string) => string | undefined, onEdit: (b: Bill) => void) => {
    const catColor = getCatColor(bill.category)
    return (
      <Card
        key={bill.id}
        className="cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => onEdit(bill)}
      >
        <CardContent className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <Receipt className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">{bill.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatRecurrence(bill)} &middot; Due {formatDate(bill.next_due_date)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-semibold">{formatCurrency(bill.amount)}</p>
              <Badge variant="secondary" className="inline-flex items-center gap-1">
                {catColor && (
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
                )}
                {catColor ? bill.category : "Uncategorized"}
              </Badge>
            </div>
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl">Expenses</h1>
          <p className="text-muted-foreground mt-1">Track what goes out.</p>
        </div>
        {bills.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              downloadCSV("bills.csv",
                ["Name", "Amount", "Frequency", "Category", "Next Due Date"],
                bills.map(b => [b.name, b.amount, b.frequency, b.category, b.next_due_date])
              )
            }}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add Bill
            </Button>
          </div>
        )}
      </div>

      {/* Summary card */}
      {(bills.length > 0 || debts.length > 0) && (
        <Card>
          <CardHeader>
            <CardDescription>Total Monthly Out</CardDescription>
            <CardTitle className="text-3xl font-display">{formatCurrency(totalMonthlyOut)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {bills.length > 0 && (
              <button
                className="flex items-center justify-between w-full text-left cursor-pointer hover:bg-muted/50 rounded-md px-2 py-1.5 -mx-2 transition-colors"
                onClick={() => billsSectionRef.current?.scrollIntoView({ behavior: "smooth" })}
              >
                <span className="text-sm text-destructive">Bills</span>
                <span className="text-sm font-medium text-destructive">{formatCurrency(monthlyBillsTotal)}</span>
              </button>
            )}
            {debts.length > 0 && (
              <button
                className="flex items-center justify-between w-full text-left cursor-pointer hover:bg-muted/50 rounded-md px-2 py-1.5 -mx-2 transition-colors"
                onClick={() => debtSectionRef.current?.scrollIntoView({ behavior: "smooth" })}
              >
                <span className="text-sm text-muted-foreground">Debt minimums</span>
                <span className="text-sm font-medium text-muted-foreground">{formatCurrency(monthlyMinimums)}</span>
              </button>
            )}
            {extraPayment > 0 && (
              <div className="flex items-center justify-between px-2 py-1.5 -mx-2">
                <span className="text-sm text-warning flex items-center gap-1.5">
                  <Flame className="h-3.5 w-3.5" /> Extra payments
                </span>
                <span className="text-sm font-medium text-warning">{formatCurrency(extraPayment)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bills section */}
      {bills.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-8 w-8 text-muted-foreground" />}
          title="No expenses yet"
          description="Add rent, utilities, subscriptions — anything you pay regularly. This helps us figure out what's left for debt payoff."
          actionLabel="Add Bill"
          onAction={openAdd}
        />
      ) : (
        <div ref={billsSectionRef} className="space-y-3">
          <div className="flex items-center gap-2">
            <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Bills</span>
            <div className="flex-1 border-t border-border" />
          </div>

          {/* Filter controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Filter:</span>
            <button
              type="button"
              onClick={() => setBillFilter("all")}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs border transition-colors",
                billFilter === "all"
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50"
              )}
            >
              All
            </button>
            {billCategories
              .filter(cat => bills.some(b => b.category === cat.name))
              .map(cat => (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setBillFilter(cat.name)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs border transition-colors inline-flex items-center gap-1",
                    billFilter === cat.name
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/50"
                  )}
                >
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                  {cat.name}
                </button>
              ))}
          </div>

          {/* Sort controls */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Sort:</span>
            {([
              { value: "category", label: "Category" },
              { value: "name", label: "Name" },
              { value: "amount", label: "Amount" },
              { value: "due", label: "Due Date" },
            ] as const).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBillSort(opt.value)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs border transition-colors",
                  billSort === opt.value
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/50"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Bill cards */}
          {(() => {
            const filteredBills = billFilter === "all"
              ? bills
              : bills.filter(b => b.category === billFilter)

            if (billSort === "category") {
              const grouped = billCategories
                .filter(cat => filteredBills.some(b => b.category === cat.name))
                .map(cat => ({
                  name: cat.name,
                  color: cat.color,
                  bills: filteredBills
                    .filter(b => b.category === cat.name)
                    .sort((a, b) => b.amount - a.amount),
                }))

              // Bills with no matching category
              const uncategorized = filteredBills.filter(
                b => !billCategories.some(c => c.name === b.category)
              )
              if (uncategorized.length > 0) {
                grouped.push({ name: "Uncategorized", color: "", bills: uncategorized.sort((a, b) => b.amount - a.amount) })
              }

              return grouped.map((group, gi) => (
                <div key={group.name} className="space-y-2">
                  <div className={cn("flex items-center gap-2", gi > 0 && "pt-1")}>
                    {group.color && (
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: group.color }} />
                    )}
                    <span className="text-[10px] font-medium text-muted-foreground">{group.name}</span>
                    <div className="flex-1 border-t border-border" />
                  </div>
                  {group.bills.map(bill => renderBillCard(bill, getCategoryColor, openEdit))}
                </div>
              ))
            }

            const sorted = [...filteredBills].sort((a, b) => {
              switch (billSort) {
                case "name": return a.name.localeCompare(b.name)
                case "amount": return b.amount - a.amount
                case "due": return a.next_due_date.localeCompare(b.next_due_date)
                default: return 0
              }
            })

            return sorted.map(bill => renderBillCard(bill, getCategoryColor, openEdit))
          })()}
        </div>
      )}

      {/* Debt Minimums section */}
      {debts.length > 0 && (
        <div ref={debtSectionRef} className="space-y-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Debt Minimums</span>
            <div className="flex-1 border-t border-border" />
          </div>
          {Array.from(debtsByType.entries()).map(([type, group]) => {
            const typeColor = DEBT_TYPE_CHART_COLORS[type]
            const typeLabel = DEBT_TYPE_META[type].pluralLabel
            return (
              <div key={type} className="space-y-2">
                <div className="flex items-center gap-2 pt-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: typeColor }} />
                  <span className="text-[10px] font-medium text-muted-foreground">{typeLabel}</span>
                  <div className="flex-1 border-t border-border" />
                </div>
                {group.map(debt => (
                  <Card
                    key={debt.id}
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => navigate("/debts")}
                  >
                    <CardContent className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: typeColor }} />
                        </div>
                        <div>
                          <p className="font-medium">{debt.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {DEBT_TYPE_META[type].label} &middot; {formatPercent(debt.interest_rate)} APR
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="font-semibold">{formatCurrencyExact(debt.minimum_payment)}/mo</p>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          })}
          <div className="flex items-center justify-between px-1 pt-2">
            <span className="text-sm text-muted-foreground">Total minimums</span>
            <span className="text-sm font-medium">{formatCurrencyExact(monthlyMinimums)}/mo</span>
          </div>
        </div>
      )}

      <BillModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        bill={editingBill}
      />
    </div>
  )
}
