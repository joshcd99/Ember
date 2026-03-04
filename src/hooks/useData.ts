import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import type { Debt, IncomeSource, Bill, Transaction, Checkin, SavingsAccount, BillCategory, HouseholdSettings } from "@/types/database"
import {
  mockDebts,
  mockIncomeSources,
  mockBills,
  mockTransactions,
  mockCheckins,
  mockSavingsAccount,
  mockBillCategories,
} from "@/lib/mock-data"
import { DEFAULT_BILL_CATEGORIES } from "@/lib/bill-categories"

interface DataState {
  debts: Debt[]
  incomeSources: IncomeSource[]
  bills: Bill[]
  billCategories: BillCategory[]
  transactions: Transaction[]
  checkins: Checkin[]
  householdSettings: HouseholdSettings | null
  savingsAccount: SavingsAccount | null
  loading: boolean
}

interface DataActions {
  // Debts
  addDebt: (debt: Omit<Debt, "id" | "household_id" | "created_at" | "last_verified_at">) => Promise<void>
  updateDebt: (id: string, updates: Partial<Debt>) => Promise<void>
  deleteDebt: (id: string) => Promise<void>
  // Income Sources
  addIncomeSource: (source: Omit<IncomeSource, "id" | "household_id">) => Promise<void>
  updateIncomeSource: (id: string, updates: Partial<IncomeSource>) => Promise<void>
  deleteIncomeSource: (id: string) => Promise<void>
  // Bills
  addBill: (bill: Omit<Bill, "id" | "household_id">) => Promise<void>
  updateBill: (id: string, updates: Partial<Bill>) => Promise<void>
  deleteBill: (id: string) => Promise<void>
  // Bill Categories
  addBillCategory: (category: Omit<BillCategory, "id" | "household_id" | "created_at">) => Promise<void>
  updateBillCategory: (id: string, updates: Partial<BillCategory>) => Promise<void>
  deleteBillCategory: (id: string) => Promise<void>
  // Household Settings
  updateCustomDebtOrder: (order: string[]) => Promise<void>
  updateBalanceThresholds: (upper: number, lower: number) => Promise<void>
  // Transactions
  addTransaction: (tx: Omit<Transaction, "id" | "user_id" | "household_id">) => Promise<void>
  // Checkins
  logCheckin: (date?: string) => Promise<void>
  // Savings
  updateSavingsAccount: (updates: Partial<Pick<SavingsAccount, "current_balance" | "apy">>) => Promise<void>
  // Refresh
  refresh: () => Promise<void>
}

export type AppData = DataState & DataActions

export function useData(): AppData {
  const { user, useMockMode, householdId } = useAuth()
  const [state, setState] = useState<DataState>({
    debts: [],
    incomeSources: [],
    bills: [],
    billCategories: [],
    householdSettings: null,
    transactions: [],
    checkins: [],
    savingsAccount: null,
    loading: true,
  })

  const fetchAll = useCallback(async () => {
    if (useMockMode) {
      setState({
        debts: mockDebts,
        incomeSources: mockIncomeSources,
        bills: mockBills,
        billCategories: mockBillCategories,
        householdSettings: { id: "mock-settings", household_id: "mock-household", custom_debt_order: [], balance_upper_threshold: 10000, balance_lower_threshold: 2000, created_at: "", updated_at: "" },
        transactions: mockTransactions,
        checkins: mockCheckins,
        savingsAccount: mockSavingsAccount,
        loading: false,
      })
      return
    }

    if (!user || !householdId) {
      setState(s => ({ ...s, loading: false }))
      return
    }

    setState(s => ({ ...s, loading: true }))

    const [debtsRes, incomeRes, billsRes, categoriesRes, settingsRes, txRes, checkinsRes, savingsRes] = await Promise.all([
      supabase.from("debts").select("*").order("created_at", { ascending: true }),
      supabase.from("income_sources").select("*").order("name"),
      supabase.from("bills").select("*").order("next_due_date"),
      supabase.from("bill_categories").select("*").order("name"),
      supabase.from("household_settings").select("*").eq("household_id", householdId).maybeSingle(),
      supabase.from("transactions").select("*").order("date", { ascending: false }).limit(100),
      supabase.from("checkins").select("*").order("date", { ascending: false }).limit(60),
      supabase.from("savings_accounts").select("*").eq("household_id", householdId).maybeSingle(),
    ])

    // Auto-create savings account if none exists
    let savingsAccount = savingsRes.data as SavingsAccount | null
    if (!savingsAccount) {
      const { data: created } = await supabase
        .from("savings_accounts")
        .upsert({ household_id: householdId!, current_balance: 0, apy: 0 }, { onConflict: "household_id" })
        .select()
        .single()
      savingsAccount = (created as SavingsAccount) ?? null
    }

    // Auto-seed default bill categories if none exist
    let billCategories = (categoriesRes.data as BillCategory[]) ?? []
    if (billCategories.length === 0) {
      const seedRows = DEFAULT_BILL_CATEGORIES.map(c => ({
        household_id: householdId!,
        name: c.name,
        color: c.color,
        is_default: true,
      }))
      await supabase.from("bill_categories").insert(seedRows)
      const { data: seeded } = await supabase.from("bill_categories").select("*").order("name")
      billCategories = (seeded as BillCategory[]) ?? []
    }

    setState({
      debts: (debtsRes.data as Debt[]) ?? [],
      incomeSources: (incomeRes.data as IncomeSource[]) ?? [],
      bills: (billsRes.data as Bill[]) ?? [],
      billCategories,
      householdSettings: (settingsRes.data as HouseholdSettings) ?? null,
      transactions: (txRes.data as Transaction[]) ?? [],
      checkins: (checkinsRes.data as Checkin[]) ?? [],
      savingsAccount,
      loading: false,
    })
  }, [user, useMockMode, householdId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // --- Mock helpers ---
  let mockIdCounter = 100
  const mockId = () => `mock-${++mockIdCounter}`

  // --- Debt CRUD ---
  const addDebt = async (debt: Omit<Debt, "id" | "household_id" | "created_at" | "last_verified_at">) => {
    if (useMockMode) {
      setState(s => ({ ...s, debts: [...s.debts, { ...debt, id: mockId(), household_id: "mock-household", created_at: new Date().toISOString(), last_verified_at: null }] }))
      return
    }
    const { error } = await supabase.from("debts").insert({
      ...debt,
      household_id: householdId!,
      last_verified_at: null,
    })
    if (error) throw error
    await fetchAll()
  }

  const updateDebt = async (id: string, updates: Partial<Debt>) => {
    if (useMockMode) {
      setState(s => ({ ...s, debts: s.debts.map(d => d.id === id ? { ...d, ...updates } : d) }))
      return
    }
    const { error } = await supabase.from("debts").update(updates).eq("id", id)
    if (error) throw error
    await fetchAll()
  }

  const deleteDebt = async (id: string) => {
    if (useMockMode) {
      setState(s => ({ ...s, debts: s.debts.filter(d => d.id !== id) }))
      return
    }
    const { error } = await supabase.from("debts").delete().eq("id", id)
    if (error) throw error
    await fetchAll()
  }

  // --- Income Source CRUD ---
  const addIncomeSource = async (source: Omit<IncomeSource, "id" | "household_id">) => {
    if (useMockMode) {
      setState(s => ({ ...s, incomeSources: [...s.incomeSources, { ...source, id: mockId(), household_id: "mock-household" }] }))
      return
    }
    const { error } = await supabase.from("income_sources").insert({
      ...source,
      household_id: householdId!,
    })
    if (error) throw error
    await fetchAll()
  }

  const updateIncomeSource = async (id: string, updates: Partial<IncomeSource>) => {
    if (useMockMode) {
      setState(s => ({ ...s, incomeSources: s.incomeSources.map(i => i.id === id ? { ...i, ...updates } : i) }))
      return
    }
    const { error } = await supabase.from("income_sources").update(updates).eq("id", id)
    if (error) throw error
    await fetchAll()
  }

  const deleteIncomeSource = async (id: string) => {
    if (useMockMode) {
      setState(s => ({ ...s, incomeSources: s.incomeSources.filter(i => i.id !== id) }))
      return
    }
    const { error } = await supabase.from("income_sources").delete().eq("id", id)
    if (error) throw error
    await fetchAll()
  }

  // --- Bill CRUD ---
  const addBill = async (bill: Omit<Bill, "id" | "household_id">) => {
    if (useMockMode) {
      setState(s => ({ ...s, bills: [...s.bills, { ...bill, id: mockId(), household_id: "mock-household" }] }))
      return
    }
    const { error } = await supabase.from("bills").insert({
      ...bill,
      household_id: householdId!,
    })
    if (error) throw error
    await fetchAll()
  }

  const updateBill = async (id: string, updates: Partial<Bill>) => {
    if (useMockMode) {
      setState(s => ({ ...s, bills: s.bills.map(b => b.id === id ? { ...b, ...updates } : b) }))
      return
    }
    const { error } = await supabase.from("bills").update(updates).eq("id", id)
    if (error) throw error
    await fetchAll()
  }

  const deleteBill = async (id: string) => {
    if (useMockMode) {
      setState(s => ({ ...s, bills: s.bills.filter(b => b.id !== id) }))
      return
    }
    const { error } = await supabase.from("bills").delete().eq("id", id)
    if (error) throw error
    await fetchAll()
  }

  // --- Household Settings ---
  const updateCustomDebtOrder = async (order: string[]) => {
    if (useMockMode) {
      setState(s => ({
        ...s,
        householdSettings: s.householdSettings
          ? { ...s.householdSettings, custom_debt_order: order, updated_at: new Date().toISOString() }
          : { id: mockId(), household_id: "mock-household", custom_debt_order: order, balance_upper_threshold: 10000, balance_lower_threshold: 2000, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      }))
      return
    }
    const { error } = await supabase.from("household_settings").upsert(
      { household_id: householdId!, custom_debt_order: order, updated_at: new Date().toISOString() },
      { onConflict: "household_id" }
    )
    if (error) throw error
    await fetchAll()
  }

  const updateBalanceThresholds = async (upper: number, lower: number) => {
    if (useMockMode) {
      setState(s => ({
        ...s,
        householdSettings: s.householdSettings
          ? { ...s.householdSettings, balance_upper_threshold: upper, balance_lower_threshold: lower, updated_at: new Date().toISOString() }
          : { id: mockId(), household_id: "mock-household", custom_debt_order: [], balance_upper_threshold: upper, balance_lower_threshold: lower, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      }))
      return
    }
    const { error } = await supabase.from("household_settings").upsert(
      { household_id: householdId!, balance_upper_threshold: upper, balance_lower_threshold: lower, updated_at: new Date().toISOString() },
      { onConflict: "household_id" }
    )
    if (error) throw error
    await fetchAll()
  }

  // --- Bill Category CRUD ---
  const addBillCategory = async (category: Omit<BillCategory, "id" | "household_id" | "created_at">) => {
    if (useMockMode) {
      setState(s => ({ ...s, billCategories: [...s.billCategories, { ...category, id: mockId(), household_id: "mock-household", created_at: new Date().toISOString() }] }))
      return
    }
    const { error } = await supabase.from("bill_categories").insert({
      ...category,
      household_id: householdId!,
    })
    if (error) throw error
    await fetchAll()
  }

  const updateBillCategory = async (id: string, updates: Partial<BillCategory>) => {
    if (useMockMode) {
      setState(s => ({ ...s, billCategories: s.billCategories.map(c => c.id === id ? { ...c, ...updates } : c) }))
      return
    }
    const { error } = await supabase.from("bill_categories").update(updates).eq("id", id)
    if (error) throw error
    await fetchAll()
  }

  const deleteBillCategory = async (id: string) => {
    if (useMockMode) {
      setState(s => ({ ...s, billCategories: s.billCategories.filter(c => c.id !== id) }))
      return
    }
    const { error } = await supabase.from("bill_categories").delete().eq("id", id)
    if (error) throw error
    await fetchAll()
  }

  // --- Transaction ---
  const addTransaction = async (tx: Omit<Transaction, "id" | "user_id" | "household_id">) => {
    if (useMockMode) {
      setState(s => ({ ...s, transactions: [{ ...tx, id: mockId(), user_id: "mock", household_id: "mock-household" }, ...s.transactions] }))
      return
    }
    const { error } = await supabase.from("transactions").insert({
      ...tx,
      user_id: user!.id,
      household_id: householdId!,
    })
    if (error) throw error
    await fetchAll()
  }

  // --- Savings ---
  const updateSavingsAccount = async (updates: Partial<Pick<SavingsAccount, "current_balance" | "apy">>) => {
    if (useMockMode) {
      setState(s => ({
        ...s,
        savingsAccount: s.savingsAccount
          ? { ...s.savingsAccount, ...updates, last_verified_at: new Date().toISOString() }
          : null,
      }))
      return
    }
    const { error } = await supabase
      .from("savings_accounts")
      .update({ ...updates, last_verified_at: new Date().toISOString() })
      .eq("household_id", householdId!)
    if (error) throw error
    await fetchAll()
  }

  // --- Checkin ---
  const logCheckin = async (date?: string) => {
    if (useMockMode) {
      const today = date ?? new Date().toISOString().split("T")[0]
      const exists = state.checkins.some(c => c.date === today)
      if (!exists) {
        setState(s => ({
          ...s,
          checkins: [{ id: mockId(), user_id: "mock", household_id: "mock-household", date: today, completed_at: new Date().toISOString() }, ...s.checkins],
        }))
      }
      return
    }
    const today = date ?? new Date().toISOString().split("T")[0]
    const { error } = await supabase.from("checkins").upsert(
      {
        user_id: user!.id,
        household_id: householdId!,
        date: today,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "household_id,user_id,date" }
    )
    if (error) throw error
    await fetchAll()
  }

  return {
    ...state,
    addDebt,
    updateDebt,
    deleteDebt,
    addIncomeSource,
    updateIncomeSource,
    deleteIncomeSource,
    addBill,
    updateBill,
    deleteBill,
    updateCustomDebtOrder,
    updateBalanceThresholds,
    addBillCategory,
    updateBillCategory,
    deleteBillCategory,
    addTransaction,
    logCheckin,
    updateSavingsAccount,
    refresh: fetchAll,
  }
}
