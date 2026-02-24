import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import type { Debt, IncomeSource, Bill, Transaction, Checkin } from "@/types/database"
import {
  mockDebts,
  mockIncomeSources,
  mockBills,
  mockTransactions,
  mockCheckins,
} from "@/lib/mock-data"

interface DataState {
  debts: Debt[]
  incomeSources: IncomeSource[]
  bills: Bill[]
  transactions: Transaction[]
  checkins: Checkin[]
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
  // Transactions
  addTransaction: (tx: Omit<Transaction, "id" | "user_id" | "household_id">) => Promise<void>
  // Checkins
  logCheckin: (date?: string) => Promise<void>
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
    transactions: [],
    checkins: [],
    loading: true,
  })

  const fetchAll = useCallback(async () => {
    if (useMockMode) {
      setState({
        debts: mockDebts,
        incomeSources: mockIncomeSources,
        bills: mockBills,
        transactions: mockTransactions,
        checkins: mockCheckins,
        loading: false,
      })
      return
    }

    if (!user || !householdId) {
      setState(s => ({ ...s, loading: false }))
      return
    }

    setState(s => ({ ...s, loading: true }))

    const [debtsRes, incomeRes, billsRes, txRes, checkinsRes] = await Promise.all([
      supabase.from("debts").select("*").order("created_at", { ascending: true }),
      supabase.from("income_sources").select("*").order("name"),
      supabase.from("bills").select("*").order("next_due_date"),
      supabase.from("transactions").select("*").order("date", { ascending: false }).limit(100),
      supabase.from("checkins").select("*").order("date", { ascending: false }).limit(60),
    ])

    setState({
      debts: (debtsRes.data as Debt[]) ?? [],
      incomeSources: (incomeRes.data as IncomeSource[]) ?? [],
      bills: (billsRes.data as Bill[]) ?? [],
      transactions: (txRes.data as Transaction[]) ?? [],
      checkins: (checkinsRes.data as Checkin[]) ?? [],
      loading: false,
    })
  }, [user, useMockMode, householdId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // --- Debt CRUD ---
  const addDebt = async (debt: Omit<Debt, "id" | "household_id" | "created_at" | "last_verified_at">) => {
    if (useMockMode) return
    const { error } = await supabase.from("debts").insert({
      ...debt,
      household_id: householdId!,
      last_verified_at: null,
    })
    if (error) throw error
    await fetchAll()
  }

  const updateDebt = async (id: string, updates: Partial<Debt>) => {
    if (useMockMode) return
    const { error } = await supabase.from("debts").update(updates).eq("id", id)
    if (error) throw error
    await fetchAll()
  }

  const deleteDebt = async (id: string) => {
    if (useMockMode) return
    const { error } = await supabase.from("debts").delete().eq("id", id)
    if (error) throw error
    await fetchAll()
  }

  // --- Income Source CRUD ---
  const addIncomeSource = async (source: Omit<IncomeSource, "id" | "household_id">) => {
    if (useMockMode) return
    const { error } = await supabase.from("income_sources").insert({
      ...source,
      household_id: householdId!,
    })
    if (error) throw error
    await fetchAll()
  }

  const updateIncomeSource = async (id: string, updates: Partial<IncomeSource>) => {
    if (useMockMode) return
    const { error } = await supabase.from("income_sources").update(updates).eq("id", id)
    if (error) throw error
    await fetchAll()
  }

  const deleteIncomeSource = async (id: string) => {
    if (useMockMode) return
    const { error } = await supabase.from("income_sources").delete().eq("id", id)
    if (error) throw error
    await fetchAll()
  }

  // --- Bill CRUD ---
  const addBill = async (bill: Omit<Bill, "id" | "household_id">) => {
    if (useMockMode) return
    const { error } = await supabase.from("bills").insert({
      ...bill,
      household_id: householdId!,
    })
    if (error) throw error
    await fetchAll()
  }

  const updateBill = async (id: string, updates: Partial<Bill>) => {
    if (useMockMode) return
    const { error } = await supabase.from("bills").update(updates).eq("id", id)
    if (error) throw error
    await fetchAll()
  }

  const deleteBill = async (id: string) => {
    if (useMockMode) return
    const { error } = await supabase.from("bills").delete().eq("id", id)
    if (error) throw error
    await fetchAll()
  }

  // --- Transaction ---
  const addTransaction = async (tx: Omit<Transaction, "id" | "user_id" | "household_id">) => {
    if (useMockMode) return
    const { error } = await supabase.from("transactions").insert({
      ...tx,
      user_id: user!.id,
      household_id: householdId!,
    })
    if (error) throw error
    await fetchAll()
  }

  // --- Checkin ---
  const logCheckin = async (date?: string) => {
    if (useMockMode) return
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
    addTransaction,
    logCheckin,
    refresh: fetchAll,
  }
}
