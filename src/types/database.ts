export type Frequency = "weekly" | "biweekly" | "monthly"
export type TransactionType = "income" | "expense" | "debt_payment"

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

export interface Debt {
  id: string
  household_id: string
  name: string
  current_balance: number
  starting_balance: number
  interest_rate: number
  minimum_payment: number
  due_day: number
  created_at: string
  last_verified_at: string | null
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
  recurrence_end_type?: RecurrenceEndType
  recurrence_end_date?: string | null
  recurrence_end_occurrences?: number | null
}

export interface HouseholdSettings {
  id: string
  household_id: string
  custom_debt_order: string[]
  balance_upper_threshold: number
  balance_lower_threshold: number
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
}

export interface Checkin {
  id: string
  user_id: string
  household_id: string
  date: string
  completed_at: string | null
}

export interface SavingsAccount {
  id: string
  household_id: string
  current_balance: number
  apy: number
  last_verified_at: string | null
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
          current_balance: number
          starting_balance: number
          interest_rate: number
          minimum_payment: number
          due_day: number
          created_at?: string
          last_verified_at?: string | null
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          current_balance?: number
          starting_balance?: number
          interest_rate?: number
          minimum_payment?: number
          due_day?: number
          created_at?: string
          last_verified_at?: string | null
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
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          custom_debt_order?: string[]
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
        }
        Update: {
          id?: string
          household_id?: string
          current_balance?: number
          apy?: number
          last_verified_at?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
