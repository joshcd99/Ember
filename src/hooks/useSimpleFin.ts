import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import type { SimpleFinAccount, SimpleFinAccountKind, SimpleFinConnection } from "@/types/database"

// Columns only — access_url (the Bridge credential) must never reach the client
const CONNECTION_COLUMNS = "id, household_id, created_by, created_at, last_synced_at, last_sync_status, last_sync_error"

async function invokeSync(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("simplefin-sync", { body })
  if (error) {
    // FunctionsHttpError carries the response; surface the function's message
    let message = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) {
        const parsed = await ctx.json()
        if (parsed?.error) message = parsed.error
      }
    } catch {
      // fall back to the generic message
    }
    throw new Error(message)
  }
  return data
}

export function useSimpleFin() {
  const { useMockMode, householdId } = useAuth()
  const [connections, setConnections] = useState<SimpleFinConnection[]>([])
  const [accounts, setAccounts] = useState<SimpleFinAccount[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (useMockMode || !householdId) {
      setLoading(false)
      return
    }
    const [connRes, acctRes] = await Promise.all([
      supabase.from("simplefin_connections").select(CONNECTION_COLUMNS).order("created_at"),
      supabase.from("simplefin_accounts").select("*").order("org_name").order("name"),
    ])
    setConnections((connRes.data as SimpleFinConnection[]) ?? [])
    setAccounts((acctRes.data as SimpleFinAccount[]) ?? [])
    setLoading(false)
  }, [useMockMode, householdId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const connect = async (setupToken: string) => {
    await invokeSync({ action: "claim", setup_token: setupToken })
    await fetchAll()
  }

  const syncNow = async () => {
    await invokeSync({ action: "sync" })
    await fetchAll()
  }

  const linkAccount = async (
    accountId: string,
    link: { debtId: string | null; savingsAccountId: string | null }
  ) => {
    const { error } = await supabase
      .from("simplefin_accounts")
      .update({ linked_debt_id: link.debtId, linked_savings_account_id: link.savingsAccountId })
      .eq("id", accountId)
    if (error) throw error
    await fetchAll()
  }

  const updateAccountMeta = async (
    accountId: string,
    meta: { display_name?: string | null; account_kind?: SimpleFinAccountKind | null }
  ) => {
    const { error } = await supabase.from("simplefin_accounts").update(meta).eq("id", accountId)
    if (error) throw error
    await fetchAll()
  }

  // "Skipped" in the UI: the sync still records the balance but the account
  // is excluded from linking and tucked away
  const setAccountSkipped = async (accountId: string, skipped: boolean) => {
    const { error } = await supabase
      .from("simplefin_accounts")
      .update({ sync_enabled: !skipped })
      .eq("id", accountId)
    if (error) throw error
    await fetchAll()
  }

  const disconnect = async (connectionId: string) => {
    const { error } = await supabase.from("simplefin_connections").delete().eq("id", connectionId)
    if (error) throw error
    await fetchAll()
  }

  return { connections, accounts, loading, connect, syncNow, linkAccount, updateAccountMeta, setAccountSkipped, disconnect, refresh: fetchAll }
}
