import type { DebtType } from "@/types/database"

export interface DebtTypeMeta {
  label: string
  pluralLabel: string
  emoji: string
  color: string
  bgColor: string
}

export const DEBT_TYPE_META: Record<DebtType, DebtTypeMeta> = {
  credit_card: { label: "Credit Card", pluralLabel: "Credit Cards", emoji: "💳", color: "var(--debt-cc)", bgColor: "var(--debt-cc-bg)" },
  personal_loan: { label: "Personal Loan", pluralLabel: "Personal Loans", emoji: "💰", color: "var(--debt-pl)", bgColor: "var(--debt-pl-bg)" },
  auto_loan: { label: "Auto Loan", pluralLabel: "Auto Loans", emoji: "🚗", color: "var(--debt-auto)", bgColor: "var(--debt-auto-bg)" },
  student_loan: { label: "Student Loan", pluralLabel: "Student Loans", emoji: "🎓", color: "var(--debt-student)", bgColor: "var(--debt-student-bg)" },
  other: { label: "Other", pluralLabel: "Other", emoji: "📋", color: "var(--debt-other)", bgColor: "var(--debt-other-bg)" },
}

/** Raw hex colors for use in charts (CSS vars don't work in SVG/Recharts) */
export const DEBT_TYPE_CHART_COLORS: Record<DebtType, string> = {
  credit_card: "#e8845a",
  personal_loan: "#c9975a",
  auto_loan: "#7a9eb8",
  student_loan: "#7eb897",
  other: "#9e9080",
}

/** Stacking order from bottom to top: student, auto, personal, credit card */
export const DEBT_TYPE_STACK_ORDER: DebtType[] = [
  "student_loan",
  "auto_loan",
  "personal_loan",
  "credit_card",
  "other",
]

export function getDebtTypeColor(debtType: DebtType): string {
  return DEBT_TYPE_META[debtType]?.color ?? DEBT_TYPE_META.other.color
}

export function getDebtTypeBgColor(debtType: DebtType): string {
  return DEBT_TYPE_META[debtType]?.bgColor ?? DEBT_TYPE_META.other.bgColor
}
