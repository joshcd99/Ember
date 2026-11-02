import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAppData } from "@/contexts/DataContext"
import { getOccurrencesInRange } from "@/lib/recurrence"
import { splitByGroup } from "@/lib/debt-groups"
import { formatCurrency, formatDate, cn } from "@/lib/utils"
import { ChevronDown, ChevronUp, ArrowRight } from "lucide-react"
import { startOfMonth, endOfMonth, addDays } from "date-fns"
import { Link } from "react-router-dom"

interface RegisterRow {
  date: Date
  label: string
  type: "starting" | "income" | "bill" | "debt" | "transaction" | "ending"
  amount: number
  runningBalance: number
}

export function CashFlowRegister() {
  const { bills, incomeSources, debts, transactions, savingsAccount, cashAccounts } = useAppData()
  const [expanded, setExpanded] = useState(false)

  // Checking accounts are the cash anchor when they exist; otherwise fall
  // back to the savings balance (the app's original behavior)
  const checkingAccounts = cashAccounts.filter(a => a.kind === "checking")
  const cashAnchor = checkingAccounts.length > 0
    ? checkingAccounts.reduce((sum, a) => sum + a.current_balance, 0)
    : savingsAccount?.current_balance ?? 0

  const hasSavings = (savingsAccount && savingsAccount.current_balance > 0) || checkingAccounts.length > 0

  const rows = useMemo(() => {
    const now = new Date()
    const monthStart = startOfMonth(now)
    const monthEnd = addDays(endOfMonth(now), 1)

    // Collect all events
    const events: { date: Date; label: string; type: RegisterRow["type"]; amount: number }[] = []

    // Bills this month
    for (const bill of bills) {
      const occurrences = getOccurrencesInRange(bill, monthStart, monthEnd)
      for (const date of occurrences) {
        events.push({ date, label: bill.name, type: "bill", amount: -bill.amount })
      }
    }

    // Income this month
    for (const source of incomeSources) {
      const occurrences = getOccurrencesInRange(source, monthStart, monthEnd)
      for (const date of occurrences) {
        events.push({ date, label: source.name, type: "income", amount: source.amount })
      }
    }

    // Debt payments (on due_day; none while the debt is in deferment).
    // Grouped debts (one servicer payment across several loans) show as
    // a single combined event.
    const { ungrouped, groups } = splitByGroup(debts)
    const maxDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    for (const debt of ungrouped) {
      const day = Math.min(debt.due_day, maxDay)
      const payment = debt.actual_payment ?? debt.minimum_payment
      const date = new Date(now.getFullYear(), now.getMonth(), day)
      if (debt.deferment_end_date && date < new Date(debt.deferment_end_date + "T00:00")) continue
      if (date >= monthStart && date < monthEnd) {
        events.push({ date, label: `${debt.name} (payment)`, type: "debt", amount: -payment })
      }
    }
    for (const group of groups) {
      const day = Math.min(group.dueDay, maxDay)
      const date = new Date(now.getFullYear(), now.getMonth(), day)
      const payment = group.debts.reduce((sum, d) => {
        if (d.deferment_end_date && date < new Date(d.deferment_end_date + "T00:00")) return sum
        return sum + (d.actual_payment ?? d.minimum_payment)
      }, 0)
      if (payment > 0 && date >= monthStart && date < monthEnd) {
        events.push({ date, label: `${group.name} (payment)`, type: "debt", amount: -payment })
      }
    }

    // Logged transactions this month
    for (const tx of transactions) {
      const txDate = new Date(tx.date)
      if (txDate >= monthStart && txDate < monthEnd) {
        const amount = tx.type === "income" ? tx.amount : -tx.amount
        events.push({ date: txDate, label: tx.label, type: "transaction", amount })
      }
    }

    // Sort by date
    events.sort((a, b) => a.date.getTime() - b.date.getTime())

    // Build rows with running balance
    const startingBalance = cashAnchor
    const result: RegisterRow[] = [
      { date: monthStart, label: "Starting balance", type: "starting", amount: startingBalance, runningBalance: startingBalance },
    ]

    let balance = startingBalance
    for (const event of events) {
      balance += event.amount
      result.push({
        date: event.date,
        label: event.label,
        type: event.type,
        amount: event.amount,
        runningBalance: balance,
      })
    }

    // Ending projected balance
    result.push({
      date: endOfMonth(now),
      label: "Projected end of month",
      type: "ending",
      amount: 0,
      runningBalance: balance,
    })

    return result
  }, [bills, incomeSources, debts, transactions, cashAnchor])

  return (
    <Card>
      <CardHeader
        className="cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <CardTitle className="flex items-center justify-between text-base">
          <span>This month's cash flow</span>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent>
          {!hasSavings ? (
            <div className="text-sm text-muted-foreground">
              <Link to="/checkin" className="text-primary hover:underline inline-flex items-center gap-1">
                Add your savings balance <ArrowRight className="h-3 w-3" />
              </Link>
              {" "}to see an accurate cash flow projection.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 font-medium">Date</th>
                    <th className="text-left py-2 font-medium">Event</th>
                    <th className="text-right py-2 font-medium">Amount</th>
                    <th className="text-right py-2 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={i}
                      className={cn(
                        "border-b border-border/50",
                        row.runningBalance < 0 && row.type !== "starting" && "bg-destructive/10",
                        (row.type === "starting" || row.type === "ending") && "font-semibold",
                      )}
                    >
                      <td className="py-1.5 text-muted-foreground">
                        {formatDate(row.date.toISOString().split("T")[0])}
                      </td>
                      <td className="py-1.5">{row.label}</td>
                      <td className={cn(
                        "py-1.5 text-right",
                        row.type === "starting" || row.type === "ending" ? "" :
                        row.amount > 0 ? "text-success" : "text-destructive",
                      )}>
                        {row.type === "starting" || row.type === "ending" ? "" :
                          `${row.amount > 0 ? "+" : ""}${formatCurrency(Math.abs(row.amount))}`}
                      </td>
                      <td className={cn(
                        "py-1.5 text-right font-medium",
                        row.runningBalance < 0 && "text-destructive",
                      )}>
                        {formatCurrency(row.runningBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
