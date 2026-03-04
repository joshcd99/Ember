import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAppData } from "@/contexts/DataContext"
import { getOccurrencesInRange } from "@/lib/recurrence"
import { getIncomeOccurrencesInRange } from "@/lib/income-recurrence"
import { formatCurrency } from "@/lib/utils"
import { ChevronLeft, ChevronRight, Receipt, DollarSign, CreditCard, X } from "lucide-react"
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, addDays, format, isSameMonth, isSameDay, isToday } from "date-fns"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

interface DayEvent {
  type: "bill" | "income" | "debt"
  name: string
  amount: number
  color?: string
}

export function Calendar() {
  const { bills, billCategories, incomeSources, debts, loading } = useAppData()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

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
      const occurrences = getIncomeOccurrencesInRange(source, rangeStart, rangeEnd)
      for (const date of occurrences) {
        addEvent(date, { type: "income", name: source.name, amount: source.amount })
      }
    }

    // Debt payments (monthly on due_day)
    for (const debt of debts) {
      const dueDay = debt.due_day
      // Check each month that overlaps with calendar range
      for (let m = monthStart.getMonth() - 1; m <= monthStart.getMonth() + 1; m++) {
        const year = monthStart.getFullYear() + Math.floor(m / 12)
        const month = ((m % 12) + 12) % 12
        const maxDay = new Date(year, month + 1, 0).getDate()
        const day = Math.min(dueDay, maxDay)
        const date = new Date(year, month, day)
        if (date >= rangeStart && date < rangeEnd) {
          addEvent(date, { type: "debt", name: debt.name, amount: debt.minimum_payment })
        }
      }
    }

    return map
  }, [bills, billCategories, incomeSources, debts, calendarStart, calendarEnd, monthStart])

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
        <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
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
                const inMonth = isSameMonth(day, currentMonth)
                const today = isToday(day)
                const isSelected = selectedDay && isSameDay(day, selectedDay)

                // Financial pressure coloring
                const billTotal = events.filter(e => e.type === "bill" || e.type === "debt").reduce((s, e) => s + e.amount, 0)
                const incomeTotal = events.filter(e => e.type === "income").reduce((s, e) => s + e.amount, 0)
                let bgTint = ""
                if (events.length > 0) {
                  if (incomeTotal > 0 && billTotal === 0) bgTint = "bg-success/8"
                  else if (billTotal > incomeTotal && incomeTotal > 0) bgTint = "bg-destructive/8"
                  else if (billTotal > 0 && incomeTotal === 0) bgTint = ""
                }

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(events.length > 0 ? day : null)}
                    className={cn(
                      "relative min-h-[80px] p-1.5 border-b border-r border-border text-left transition-colors",
                      !inMonth && "opacity-40",
                      bgTint,
                      isSelected && "ring-2 ring-primary ring-inset",
                      events.length > 0 && "cursor-pointer hover:bg-muted/50",
                      events.length === 0 && "cursor-default",
                    )}
                  >
                    <span className={cn(
                      "text-xs font-medium",
                      today && "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center",
                    )}>
                      {format(day, "d")}
                    </span>
                    {/* Event dots (max 3 visible) */}
                    <div className="mt-0.5 space-y-0.5">
                      {events.slice(0, 3).map((event, ei) => (
                        <div key={ei} className="flex items-center gap-1 truncate">
                          <span className={cn(
                            "h-1.5 w-1.5 rounded-full flex-shrink-0",
                            event.type === "income" ? "bg-success" : event.type === "debt" ? "bg-warning" : "",
                          )} style={event.type === "bill" ? { backgroundColor: event.color ?? "#8C8578" } : {}} />
                          <span className="text-[10px] truncate text-muted-foreground">{event.name}</span>
                        </div>
                      ))}
                      {events.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{events.length - 3} more</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Day detail popover */}
      {selectedDay && selectedEvents.length > 0 && (
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
                    event.type === "income" ? "text-success" : ""
                  )}>
                    {event.type === "income" ? "+" : "-"}{formatCurrency(event.amount)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
