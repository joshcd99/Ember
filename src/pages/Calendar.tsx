import { useState, useMemo, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAppData } from "@/contexts/DataContext"
import { getOccurrencesInRange } from "@/lib/recurrence"
import { calculatePayoff, type Strategy } from "@/lib/payoff-engine"
import { getMonthlyIncome, getMonthlyBills, getMonthlyMinimums } from "@/lib/mock-data"
import { formatCurrency } from "@/lib/utils"
import { downloadCSV } from "@/lib/csv"
import { ChevronLeft, ChevronRight, Receipt, DollarSign, CreditCard, X, Plus, Download } from "lucide-react"
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, addDays, format, isSameMonth, isSameDay, isToday, eachDayOfInterval, startOfDay } from "date-fns"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"
import { BillModal } from "@/components/modals/BillModal"
import { IncomeSourceModal } from "@/components/modals/IncomeSourceModal"
import { TransactionModal } from "@/components/modals/TransactionModal"

interface DayEvent {
  type: "bill" | "income" | "debt"
  name: string
  amount: number
  color?: string
}

export function Calendar() {
  const { bills, billCategories, incomeSources, debts, savingsAccount, householdSettings, loading } = useAppData()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [quickAddDate, setQuickAddDate] = useState("")
  const [billModalOpen, setBillModalOpen] = useState(false)
  const [incomeModalOpen, setIncomeModalOpen] = useState(false)
  const [transactionModalOpen, setTransactionModalOpen] = useState(false)
  const detailRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selectedDay && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
  }, [selectedDay])

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  // Compute per-debt payoff dates from saved strategy
  const debtPayoffDates = useMemo(() => {
    if (debts.length === 0) return new Map<string, Date>()
    const savedStrategy = (householdSettings?.preferred_strategy ?? "minimums") as Strategy
    const savedExtraType = householdSettings?.extra_payment_type ?? "fixed"
    const savedExtraAmount = householdSettings?.extra_payment_amount ?? 0
    const cashFlow = Math.max(0, getMonthlyIncome(incomeSources) - getMonthlyBills(bills) - getMonthlyMinimums(debts))
    const extra = savedExtraType === "percent_of_free_cash"
      ? Math.max(0, Math.floor(cashFlow * (savedExtraAmount / 100)))
      : savedExtraAmount
    const result = calculatePayoff(debts, savedStrategy, extra, null, householdSettings?.custom_debt_order)
    const map = new Map<string, Date>()
    for (const entry of result.debtPayoffOrder) {
      const d = new Date()
      d.setMonth(d.getMonth() + entry.month)
      map.set(entry.id, d)
    }
    return map
  }, [debts, incomeSources, bills, householdSettings])

  // Build events map: date string -> events[]
  const eventsMap = useMemo(() => {
    const map = new Map<string, DayEvent[]>()
    const rangeStart = calendarStart
    const rangeEnd = addDays(calendarEnd, 1)

    const addEvent = (date: Date, event: DayEvent) => {
      const key = format(date, "yyyy-MM-dd")
      const existing = map.get(key) ?? []
      existing.push(event)
      map.set(key, existing)
    }

    // Bills
    for (const bill of bills) {
      const occurrences = getOccurrencesInRange(bill, rangeStart, rangeEnd)
      const catColor = billCategories.find(c => c.name === bill.category)?.color
      for (const date of occurrences) {
        addEvent(date, { type: "bill", name: bill.name, amount: bill.amount, color: catColor })
      }
    }

    // Income
    for (const source of incomeSources) {
      const occurrences = getOccurrencesInRange(source, rangeStart, rangeEnd)
      for (const date of occurrences) {
        addEvent(date, { type: "income", name: source.name, amount: source.amount })
      }
    }

    // Debt payments (monthly on due_day, stop after projected payoff)
    for (const debt of debts) {
      const dueDay = debt.due_day
      const payoffDate = debtPayoffDates.get(debt.id)
      for (let m = monthStart.getMonth() - 1; m <= monthStart.getMonth() + 1; m++) {
        const year = monthStart.getFullYear() + Math.floor(m / 12)
        const month = ((m % 12) + 12) % 12
        const maxDay = new Date(year, month + 1, 0).getDate()
        const day = Math.min(dueDay, maxDay)
        const date = new Date(year, month, day)
        if (date >= rangeStart && date < rangeEnd) {
          if (payoffDate && date > payoffDate) continue
          addEvent(date, { type: "debt", name: debt.name, amount: debt.minimum_payment })
        }
      }
    }

    return map
  }, [bills, billCategories, incomeSources, debts, calendarStart, calendarEnd, monthStart, debtPayoffDates])

  // Build a full events map from today to the calendar end (for running balance)
  const fullEventsMap = useMemo(() => {
    const today = startOfDay(new Date())
    // If calendar starts after today, we need events in the gap
    if (calendarStart <= today) return eventsMap

    const map = new Map(eventsMap)
    const gapStart = today
    const gapEnd = calendarStart

    for (const bill of bills) {
      const occurrences = getOccurrencesInRange(bill, gapStart, gapEnd)
      const catColor = billCategories.find(c => c.name === bill.category)?.color
      for (const date of occurrences) {
        const key = format(date, "yyyy-MM-dd")
        const existing = map.get(key) ?? []
        existing.push({ type: "bill", name: bill.name, amount: bill.amount, color: catColor })
        map.set(key, existing)
      }
    }
    for (const source of incomeSources) {
      const occurrences = getOccurrencesInRange(source, gapStart, gapEnd)
      for (const date of occurrences) {
        const key = format(date, "yyyy-MM-dd")
        const existing = map.get(key) ?? []
        existing.push({ type: "income", name: source.name, amount: source.amount })
        map.set(key, existing)
      }
    }
    for (const debt of debts) {
      const dueDay = debt.due_day
      const payoffDate = debtPayoffDates.get(debt.id)
      // Cover months in the gap
      let m = gapStart.getMonth() + gapStart.getFullYear() * 12
      const mEnd = gapEnd.getMonth() + gapEnd.getFullYear() * 12
      while (m <= mEnd) {
        const year = Math.floor(m / 12)
        const month = m % 12
        const maxDay = new Date(year, month + 1, 0).getDate()
        const day = Math.min(dueDay, maxDay)
        const date = new Date(year, month, day)
        if (date >= gapStart && date < gapEnd) {
          if (payoffDate && date > payoffDate) { m++; continue }
          const key = format(date, "yyyy-MM-dd")
          const existing = map.get(key) ?? []
          existing.push({ type: "debt", name: debt.name, amount: debt.minimum_payment })
          map.set(key, existing)
        }
        m++
      }
    }
    return map
  }, [eventsMap, calendarStart, bills, billCategories, incomeSources, debts, debtPayoffDates])

  // Build running balance map from today through the visible calendar
  const balanceMap = useMemo(() => {
    const map = new Map<string, number>()
    const startBalance = savingsAccount?.current_balance ?? 0
    const today = startOfDay(new Date())
    const rangeStart = calendarStart <= today ? calendarStart : today
    const days = eachDayOfInterval({ start: rangeStart, end: calendarEnd })
    let running = startBalance

    for (const d of days) {
      const key = format(d, "yyyy-MM-dd")
      const events = fullEventsMap.get(key) ?? []
      for (const event of events) {
        if (event.type === "income") {
          running += event.amount
        } else {
          running -= event.amount
        }
      }
      map.set(key, running)
    }

    return map
  }, [fullEventsMap, calendarStart, calendarEnd, savingsAccount])

  if (loading) {
    return <div className="animate-pulse text-muted-foreground py-12 text-center">Loading...</div>
  }

  // Build calendar grid
  const weeks: Date[][] = []
  let day = calendarStart
  while (day <= calendarEnd) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(day)
      day = addDays(day, 1)
    }
    weeks.push(week)
  }

  const goToday = () => setCurrentMonth(new Date())
  const selectedEvents = selectedDay ? eventsMap.get(format(selectedDay, "yyyy-MM-dd")) ?? [] : []
  const selectedBalance = selectedDay ? balanceMap.get(format(selectedDay, "yyyy-MM-dd")) : undefined

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Calendar</h1>
        <p className="text-muted-foreground mt-1">See what's due and what's coming in.</p>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-[160px] text-center">
            {format(currentMonth, "MMMM yyyy")}
          </h2>
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
            const rows: (string | number)[][] = []
            for (const d of days) {
              const key = format(d, "yyyy-MM-dd")
              const events = eventsMap.get(key) ?? []
              const bal = balanceMap.get(key)
              for (const event of events) {
                rows.push([key, event.type, event.name, event.amount, bal ?? ""])
              }
            }
            downloadCSV(`calendar-${format(currentMonth, "yyyy-MM")}.csv`,
              ["Date", "Type", "Name", "Amount", "Running Balance"],
              rows
            )
          }}>
            <Download className="h-4 w-4" /> Export Month
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
        </div>
      </div>

      {/* Calendar grid */}
      <Card>
        <CardContent className="p-0">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map(day => {
                const key = format(day, "yyyy-MM-dd")
                const events = eventsMap.get(key) ?? []
                const dayBalance = balanceMap.get(key)
                const inMonth = isSameMonth(day, currentMonth)
                const today = isToday(day)
                const isSelected = selectedDay && isSameDay(day, selectedDay)

                // Balance-based coloring
                const upperThreshold = householdSettings?.balance_upper_threshold ?? 10000
                const lowerThreshold = householdSettings?.balance_lower_threshold ?? 2000
                let bgTint = ""
                if (dayBalance !== undefined) {
                  if (dayBalance >= upperThreshold) bgTint = "bg-success/8"
                  else if (dayBalance <= lowerThreshold) bgTint = "bg-destructive/8"
                }

                return (
                  <button
                    key={key}
                    onClick={() => {
                      setSelectedDay(day)
                      setQuickAddDate(key)
                    }}
                    className={cn(
                      "flex flex-col h-[130px] p-1.5 border-b border-r border-border text-left transition-colors cursor-pointer hover:bg-muted/50",
                      !inMonth && "opacity-40",
                      bgTint,
                      isSelected && "ring-2 ring-primary ring-inset",
                    )}
                  >
                    <span className={cn(
                      "text-xs font-medium",
                      today && "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center",
                    )}>
                      {format(day, "d")}
                    </span>
                    {/* Scrollable events container */}
                    <div className="mt-0.5 space-y-0.5 overflow-y-auto flex-1 min-h-0">
                      {events.map((event, ei) => (
                        <div key={ei} className="flex items-center gap-1 truncate">
                          <span className={cn(
                            "h-1.5 w-1.5 rounded-full flex-shrink-0",
                            event.type === "income" ? "bg-success" : event.type === "debt" ? "bg-warning" : "",
                          )} style={event.type === "bill" ? { backgroundColor: event.color ?? "#8C8578" } : {}} />
                          <span className="text-[10px] truncate text-muted-foreground">{event.name}</span>
                          <span className={cn(
                            "text-[10px] ml-auto flex-shrink-0",
                            event.type === "income" ? "text-success" : "text-muted-foreground",
                          )}>
                            {event.type === "income" ? "+" : "-"}${event.amount >= 1000 ? `${(event.amount / 1000).toFixed(1)}k` : event.amount}
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Day-end balance — pinned at bottom */}
                    {events.length > 0 && dayBalance !== undefined && (
                      <div className={cn(
                        "text-right text-[9px] font-medium mt-auto pt-0.5 flex-shrink-0",
                        dayBalance < 0 ? "text-destructive" : "text-muted-foreground/60",
                      )}>
                        {formatCurrency(dayBalance)}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Day detail popover */}
      {selectedDay && (
        <div ref={detailRef}>
        <Card>
          <CardContent>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">{format(selectedDay, "EEEE, MMMM d")}</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              {selectedEvents.map((event, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {event.type === "income" ? (
                      <DollarSign className="h-4 w-4 text-success" />
                    ) : event.type === "debt" ? (
                      <CreditCard className="h-4 w-4 text-warning" />
                    ) : (
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm">
                      {event.type === "bill" ? (
                        <Link to="/bills" className="hover:text-primary hover:underline">{event.name}</Link>
                      ) : event.name}
                    </span>
                    {event.type === "bill" && event.color && (
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: event.color }} />
                    )}
                  </div>
                  <span className={cn(
                    "text-sm font-medium",
                    event.type === "income" ? "text-success" : "text-destructive"
                  )}>
                    {event.type === "income" ? "+" : "-"}{formatCurrency(event.amount)}
                  </span>
                </div>
              ))}
              {/* Day net + running balance */}
              {selectedEvents.length > 0 && (
                <div className="border-t border-border pt-2 mt-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Balance after today</span>
                  <span className={cn(
                    "text-sm font-semibold",
                    selectedBalance !== undefined && selectedBalance < 0 ? "text-destructive" : "text-foreground",
                  )}>
                    {selectedBalance !== undefined ? formatCurrency(selectedBalance) : "—"}
                  </span>
                </div>
              )}

              {/* Quick-add buttons */}
              <div className={cn("flex gap-2", selectedEvents.length > 0 && "border-t border-border pt-2 mt-2")}>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setBillModalOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Bill
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setIncomeModalOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Income
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setTransactionModalOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  One-Time
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      )}

      {/* Quick-add modals */}
      <BillModal open={billModalOpen} onClose={() => setBillModalOpen(false)} initialDate={quickAddDate} />
      <IncomeSourceModal open={incomeModalOpen} onClose={() => setIncomeModalOpen(false)} initialDate={quickAddDate} />
      <TransactionModal open={transactionModalOpen} onClose={() => setTransactionModalOpen(false)} initialDate={quickAddDate} />
    </div>
  )
}
