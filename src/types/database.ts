export type Frequency = "weekly" | "biweekly" | "monthly"
export type TransactionType = "income" | "expense" | "debt_payment"
export type DebtType = "credit_card" | "personal_loan" | "auto_loan" | "student_loan" | "bnpl" | "other"

// Recurrence types for bills
export type RecurrenceType = "weekly" | "biweekly" | "monthly" | "yearly" | "custom"
export type RecurrenceUnit = "day" | "week" | "month" | "year"
export type RecurrenceEndType = "never" | "on_date" | "after_occurrences"

export interface Household {
  id: string
  name: string
  created_at: string
}

export interface HouseholdMember {
  id: string
  household_id: string
  user_id: string | null
  invited_email: string | null
  status: "active" | "pending"
  joined_at: string | null
}

export type PromoType = "deferred_interest" | "true_zero"

// One promotional balance window on a debt (a card can hold several at once,
// each from a different purchase with its own terms)
export interface DebtPromo {
  id: string
  household_id: string
  debt_id: string
  label: string
  promo_type: PromoType
  promo_apr: number
  promo_end_date: string
  promo_balance: number
  deferred_interest_accrued: number | null
  created_at: string
}

export interface Debt {
  id: string
  household_id: string
  name: string
  debt_type: DebtType
  current_balance: number
  starting_balance: number
  interest_rate: number
  minimum_payment: number
  due_day: number
  created_at: string
  last_verified_at: string | null
  // Promotional balances, loaded via join from debt_promos
  promos?: DebtPromo[]
  // Per-debt actual payment
  actual_payment?: number | null
  // User-entered deferred interest already accrued (from statement)
  deferred_interest_accrued?: number | null
  // Deferment (e.g. student loans): no payments until this date;
  // interest accrues (unsubsidized) or is paused (subsidized)
  deferment_end_date?: string | null
  deferment_interest_accrues?: boolean | null
  // Free-text owner label (member name or "Joint"); null = unspecified
  owner?: string | null
}

export interface IncomeSource {
  id: string
  household_id: string
  name: string
  amount: number
  frequency: Frequency
  next_expected_date: string
  is_variable: boolean
  // Recurrence fields (optional for backward compat)
  recurrence_type?: RecurrenceType
  recurrence_interval?: number
  recurrence_unit?: RecurrenceUnit
  recurrence_days_of_week?: number[]
  recurrence_days_of_month?: number[]
  recurrence_end_type?: RecurrenceEndType
  recurrence_end_date?: string | null
  recurrence_end_occurrences?: number | null
}

export interface BillCategory {
  id: string
  household_id: string
  name: string
  color: string
  is_default: boolean
  created_at: string
}

export interface Bill {
  id: string
  household_id: string
  name: string
  amount: number
  frequency: Frequency
  next_due_date: string
  category: string
  // Recurrence fields (optional for backward compat)
  recurrence_type?: RecurrenceType
  recurrence_interval?: number
  recurrence_unit?: RecurrenceUnit
  recurrence_days_of_week?: number[]
  recurrence_days_of_month?: number[]
  recurrence_end_type?: RecurrenceEndType
  recurrence_end_date?: string | null
  recurrence_end_occurrences?: number | null
}

export type ExtraPaymentType = "fixed" | "percent_of_free_cash"

export interface HouseholdSettings {
  id: string
  household_id: string
  custom_debt_order: string[]
  balance_upper_threshold: number
  balance_lower_threshold: number
  preferred_strategy?: string
  extra_payment_amount?: number
  extra_payment_type?: ExtraPaymentType
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  user_id: string
  household_id: string
  type: TransactionType
  amount: number
  label: string
  date: string
  linked_income_source_id: string | null
  linked_debt_id: string | null
  is_projected: boolean
  simplefin_txn_id?: string | null
  source?: "manual" | "simplefin"
}

// access_url is intentionally absent: it holds the Bridge credentials and is
// only ever read by the simplefin-sync edge function, never the client.
export interface SimpleFinConnection {
  id: string
  household_id: string
  created_by: string | null
  created_at: string
  last_synced_at: string | null
  last_sync_status: "ok" | "error" | null
  last_sync_error: string | null
}

export type SimpleFinAccountKind = "checking" | "savings" | "credit_card" | "loan" | "other"

export interface SimpleFinAccount {
  id: string
  household_id: string
  connection_id: string
  simplefin_id: string
  name: string
  org_name: string
  currency: string
  balance: number | null
  available_balance: number | null
  balance_date: string | null
  linked_debt_id: string | null
  linked_savings_account_id: string | null
  display_name: string | null
  account_kind: SimpleFinAccountKind | null
  sync_enabled: boolean
  created_at: string
}

export interface Checkin {
  id: string
  user_id: string
  household_id: string
  date: string
  completed_at: string | null
}

export type CashAccountKind = "checking" | "savings"

export interface SavingsAccount {
  id: string
  household_id: string
  current_balance: number
  apy: number
  last_verified_at: string | null
  name: string
  kind: CashAccountKind
  created_at: string
  owner?: string | null
}

export interface Database {
  public: {
    Tables: {
      households: {
        Row: Household
        Insert: {
          id?: string
          name?: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
        }
        Relationships: []
      }
      household_members: {
        Row: HouseholdMember
        Insert: {
          id?: string
          household_id: string
          user_id?: string | null
          invited_email?: string | null
          status?: string
          joined_at?: string | null
        }
        Update: {
          id?: string
          household_id?: string
          user_id?: string | null
          invited_email?: string | null
          status?: string
          joined_at?: string | null
        }
        Relationships: []
      }
      debts: {
        Row: Debt
        Insert: {
          id?: string
          household_id: string
          name: string
          debt_type?: string
          current_balance: number
          starting_balance: number
          interest_rate: number
          minimum_payment: number
          due_day: number
          created_at?: string
          last_verified_at?: string | null
          actual_payment?: number | null
          deferred_interest_accrued?: number | null
          deferment_end_date?: string | null
          deferment_interest_accrues?: boolean | null
          owner?: string | null
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          debt_type?: string
          current_balance?: number
          starting_balance?: number
          interest_rate?: number
          minimum_payment?: number
          due_day?: number
          created_at?: string
          last_verified_at?: string | null
          actual_payment?: number | null
          deferred_interest_accrued?: number | null
          deferment_end_date?: string | null
          deferment_interest_accrues?: boolean | null
          owner?: string | null
        }
        Relationships: []
      }
      income_sources: {
        Row: IncomeSource
        Insert: {
          id?: string
          household_id: string
          name: string
          amount: number
          frequency: string
          next_expected_date: string
          is_variable?: boolean
          recurrence_type?: string
          recurrence_interval?: number
          recurrence_unit?: string
          recurrence_days_of_week?: number[]
          recurrence_days_of_month?: number[]
          recurrence_end_type?: string
          recurrence_end_date?: string | null
          recurrence_end_occurrences?: number | null
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          amount?: number
          frequency?: string
          next_expected_date?: string
          is_variable?: boolean
          recurrence_type?: string
          recurrence_interval?: number
          recurrence_unit?: string
          recurrence_days_of_week?: number[]
          recurrence_days_of_month?: number[]
          recurrence_end_type?: string
          recurrence_end_date?: string | null
          recurrence_end_occurrences?: number | null
        }
        Relationships: []
      }
      bill_categories: {
        Row: BillCategory
        Insert: {
          id?: string
          household_id: string
          name: string
          color: string
          is_default?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          color?: string
          is_default?: boolean
          created_at?: string
        }
        Relationships: []
      }
      bills: {
        Row: Bill
        Insert: {
          id?: string
          household_id: string
          name: string
          amount: number
          frequency: string
          next_due_date: string
          category?: string
          recurrence_type?: string
          recurrence_interval?: number
          recurrence_unit?: string
          recurrence_days_of_week?: number[]
          recurrence_days_of_month?: number[]
          recurrence_end_type?: string
          recurrence_end_date?: string | null
          recurrence_end_occurrences?: number | null
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          amount?: number
          frequency?: string
          next_due_date?: string
          category?: string
          recurrence_type?: string
          recurrence_interval?: number
          recurrence_unit?: string
          recurrence_days_of_week?: number[]
          recurrence_days_of_month?: number[]
          recurrence_end_type?: string
          recurrence_end_date?: string | null
          recurrence_end_occurrences?: number | null
        }
        Relationships: []
      }
      transactions: {
        Row: Transaction
        Insert: {
          id?: string
          user_id: string
          household_id: string
          type: string
          amount: number
          label: string
          date?: string
          linked_income_source_id?: string | null
          linked_debt_id?: string | null
          is_projected?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          household_id?: string
          type?: string
          amount?: number
          label?: string
          date?: string
          linked_income_source_id?: string | null
          linked_debt_id?: string | null
          is_projected?: boolean
        }
        Relationships: []
      }
      household_settings: {
        Row: HouseholdSettings
        Insert: {
          id?: string
          household_id: string
          custom_debt_order?: string[]
          preferred_strategy?: string
          extra_payment_amount?: number
          extra_payment_type?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          custom_debt_order?: string[]
          preferred_strategy?: string
          extra_payment_amount?: number
          extra_payment_type?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      checkins: {
        Row: Checkin
        Insert: {
          id?: string
          user_id: string
          household_id: string
          date?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          household_id?: string
          date?: string
          completed_at?: string | null
        }
        Relationships: []
      }
      savings_accounts: {
        Row: SavingsAccount
        Insert: {
          id?: string
          household_id: string
          current_balance?: number
          apy?: number
          last_verified_at?: string | null
          name?: string
          kind?: string
          created_at?: string
          owner?: string | null
        }
        Update: {
          id?: string
          household_id?: string
          current_balance?: number
          apy?: number
          last_verified_at?: string | null
          name?: string
          kind?: string
          created_at?: string
          owner?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
