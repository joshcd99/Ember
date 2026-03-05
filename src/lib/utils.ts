import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatCurrencyExact(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`
}

export function formatDate(date: Date | string): string {
  // Append T00:00 to date-only strings so they parse as local time, not UTC
  const d = typeof date === "string"
    ? new Date(date.includes("T") ? date : date + "T00:00")
    : date
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function monthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
}

export function formatCountdown(days: number): string | null {
  if (days <= 0) return null
  // Under 30 days: days only (precision matters here)
  if (days < 30) return `${days} days`
  // 1-11 months: months + days
  if (days < 365) {
    const m = Math.floor(days / 30.44)
    const d = Math.round(days % 30.44)
    return d > 0 ? `${m}mo ${d}d` : `${m}mo`
  }
  // 1+ years: years + months (days are false precision at this horizon)
  const y = Math.floor(days / 365.25)
  const remaining = days - y * 365.25
  const m = Math.round(remaining / 30.44)
  return m > 0 ? `${y}y ${m}mo` : `${y}y`
}
