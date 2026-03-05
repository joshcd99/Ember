import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  addDays,
  format,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns"
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react"

interface DatePickerProps {
  value: string // "YYYY-MM-DD" or ""
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}

export function DatePicker({ value, onChange, className, placeholder = "Select date" }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() =>
    value ? new Date(value + "T00:00") : new Date()
  )
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  // Sync view month when value changes externally
  useEffect(() => {
    if (value) setViewMonth(new Date(value + "T00:00"))
  }, [value])

  const selected = value ? new Date(value + "T00:00") : null

  const monthStart = startOfMonth(viewMonth)
  const monthEnd = endOfMonth(viewMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  // Build weeks
  const weeks: Date[][] = []
  let day = calStart
  while (day <= calEnd) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(day)
      day = addDays(day, 1)
    }
    weeks.push(week)
  }

  const handleSelect = (d: Date) => {
    onChange(format(d, "yyyy-MM-dd"))
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={cn(className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-10 w-full items-center rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          !value && "text-muted-foreground",
        )}
      >
        <Calendar className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
        {selected ? format(selected, "MMM d, yyyy") : placeholder}
      </button>

      {/* Inline calendar — renders below trigger within normal flow */}
      {open && (
        <div className="mt-1 rounded-lg border border-border bg-card p-3 shadow-lg">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewMonth(m => subMonths(m, 1))}
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium">{format(viewMonth, "MMMM yyyy")}</span>
            <button
              type="button"
              onClick={() => setViewMonth(m => addMonths(m, 1))}
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
              <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map(d => {
                const inMonth = isSameMonth(d, viewMonth)
                const isSelected = selected && isSameDay(d, selected)
                const today = isToday(d)

                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    onClick={() => handleSelect(d)}
                    className={cn(
                      "h-8 w-full rounded-md text-xs transition-colors",
                      inMonth ? "text-foreground" : "text-muted-foreground/40",
                      isSelected && "bg-primary text-primary-foreground",
                      !isSelected && today && "bg-muted font-semibold",
                      !isSelected && inMonth && "hover:bg-muted",
                      !isSelected && !inMonth && "hover:bg-muted/50",
                    )}
                  >
                    {format(d, "d")}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
