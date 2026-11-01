import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface SimpleFinTransaction {
  id: string
  posted: number
  amount: string
  description: string
  pending?: boolean
}

interface SimpleFinAccount {
  id: string
  name: string
  currency: string
  balance: string
  "available-balance"?: string
  "balance-date": number
  transactions: SimpleFinTransaction[]
  org?: { name?: string; domain?: string }
}

interface ConnectionRow {
  id: string
  household_id: string
  access_url: string
  created_by: string | null
  last_synced_at: string | null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

// Deno's fetch rejects URLs with embedded credentials, so split the SimpleFIN
// access URL into a bare URL plus a Basic auth header.
function parseAccessUrl(accessUrl: string): { base: string; authHeader: string } {
  const u = new URL(accessUrl)
  const user = decodeURIComponent(u.username)
  const pass = decodeURIComponent(u.password)
  u.username = ""
  u.password = ""
  const base = u.toString().replace(/\/$/, "")
  return { base, authHeader: `Basic ${btoa(`${user}:${pass}`)}` }
}

async function fetchAccounts(accessUrl: string, startEpoch: number): Promise<SimpleFinAccount[]> {
  const { base, authHeader } = parseAccessUrl(accessUrl)
  const res = await fetch(`${base}/accounts?start-date=${startEpoch}`, {
    headers: { Authorization: authHeader },
  })
  if (!res.ok) {
    throw new Error(`SimpleFIN responded ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const data = await res.json()
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    // Non-fatal per protocol (e.g. one bank needs reauth), but worth surfacing
    console.warn("simplefin-sync: SimpleFIN reported errors", data.errors)
  }
  return (data.accounts ?? []) as SimpleFinAccount[]
}

function guessAccountKind(name: string): string {
  const n = name.toLowerCase()
  if (/check|chequing/.test(n)) return "checking"
  if (/sav|money market|\bmma\b/.test(n)) return "savings"
  if (/credit|card|visa|mastercard|amex|discover/.test(n)) return "credit_card"
  if (/loan|mortgage|auto|student|financ/.test(n)) return "loan"
  return "other"
}

async function syncConnection(admin: SupabaseClient, conn: ConnectionRow, lookbackDays?: number): Promise<{ accounts: number; payments: number }> {
  const now = Math.floor(Date.now() / 1000)
  // Overlap window so late-posting transactions aren't missed; dedupe handles
  // repeats. An explicit lookback (e.g. recurring-charge scans) reaches back further.
  const startEpoch = lookbackDays
    ? now - Math.min(lookbackDays, 365) * 86400
    : conn.last_synced_at
      ? Math.floor(new Date(conn.last_synced_at).getTime() / 1000) - 7 * 86400
      : now - 30 * 86400

  const accounts = await fetchAccounts(conn.access_url, startEpoch)

  const { data: existingRows, error: existingErr } = await admin
    .from("simplefin_accounts")
    .select("*")
    .eq("connection_id", conn.id)
  if (existingErr) throw existingErr
  const existingById = new Map((existingRows ?? []).map((r) => [r.simplefin_id as string, r]))

  // user_id for imported transactions: whoever connected, else any active member
  let txnUserId = conn.created_by
  if (!txnUserId) {
    const { data: member } = await admin
      .from("household_members")
      .select("user_id")
      .eq("household_id", conn.household_id)
      .eq("status", "active")
      .not("user_id", "is", null)
      .limit(1)
      .maybeSingle()
    txnUserId = member?.user_id ?? null
  }

  let paymentsInserted = 0

  for (const account of accounts) {
    const balance = parseFloat(account.balance)
    const availableRaw = account["available-balance"]
    const balanceDate = account["balance-date"]
      ? new Date(account["balance-date"] * 1000).toISOString()
      : null

    const existing = existingById.get(account.id)

    // display_name and account_kind are user-editable: only seed a guessed
    // kind on first sight, and never include them in updates
    const payload: Record<string, unknown> = {
      household_id: conn.household_id,
      connection_id: conn.id,
      simplefin_id: account.id,
      name: account.name ?? "",
      org_name: account.org?.name ?? account.org?.domain ?? "",
      currency: account.currency ?? "USD",
      balance: Number.isFinite(balance) ? balance : null,
      available_balance: availableRaw != null ? parseFloat(availableRaw) : null,
      balance_date: balanceDate,
    }
    if (!existing) payload.account_kind = guessAccountKind(account.name ?? "")

    const { data: acctRow, error: upsertErr } = await admin
      .from("simplefin_accounts")
      .upsert(payload, { onConflict: "connection_id,simplefin_id" })
      .select("id, sync_enabled")
      .single()
    if (upsertErr) throw upsertErr

    // Raw feed for every synced account — powers recurring-charge detection
    if (acctRow && acctRow.sync_enabled !== false) {
      const rawRows = (account.transactions ?? [])
        .filter((t) => !t.pending)
        .map((t) => ({
          household_id: conn.household_id,
          account_id: acctRow.id,
          sf_txn_id: t.id,
          posted: new Date(t.posted * 1000).toISOString().slice(0, 10),
          amount: parseFloat(t.amount),
          description: (t.description ?? "").slice(0, 300),
          pending: false,
        }))
        .filter((r) => Number.isFinite(r.amount))
      if (rawRows.length > 0) {
        const { error: rawErr } = await admin
          .from("simplefin_transactions")
          .upsert(rawRows, { onConflict: "account_id,sf_txn_id", ignoreDuplicates: true })
        if (rawErr) throw rawErr
      }
    }

    if (!existing || existing.sync_enabled === false) continue

    if (existing.linked_debt_id) {
      // The bank's balance is authoritative for a linked debt
      if (Number.isFinite(balance)) {
        const { error: debtErr } = await admin
          .from("debts")
          .update({
            current_balance: Math.abs(balance),
            last_verified_at: balanceDate ?? new Date().toISOString(),
          })
          .eq("id", existing.linked_debt_id)
        if (debtErr) throw debtErr
      }

      // Record inbound amounts (payments) so the register and payoff history stay real.
      // Balances are set from the bank above, so these rows are history only —
      // the app's manual-entry decrement logic is not applied here.
      if (txnUserId) {
        const paymentRows = (account.transactions ?? [])
          .filter((t) => !t.pending && parseFloat(t.amount) > 0)
          .map((t) => ({
            user_id: txnUserId,
            household_id: conn.household_id,
            type: "debt_payment",
            amount: parseFloat(t.amount),
            label: t.description?.slice(0, 200) || "Payment",
            date: new Date(t.posted * 1000).toISOString().slice(0, 10),
            linked_debt_id: existing.linked_debt_id,
            simplefin_txn_id: `${account.id}:${t.id}`,
            source: "simplefin",
          }))
        if (paymentRows.length > 0) {
          const { error: txErr, data: inserted } = await admin
            .from("transactions")
            .upsert(paymentRows, {
              onConflict: "household_id,simplefin_txn_id",
              ignoreDuplicates: true,
            })
            .select("id")
          if (txErr) throw txErr
          paymentsInserted += inserted?.length ?? 0
        }
      }
    } else if (existing.linked_savings_account_id && Number.isFinite(balance)) {
      const { error: savErr } = await admin
        .from("savings_accounts")
        .update({
          current_balance: balance,
          last_verified_at: balanceDate ?? new Date().toISOString(),
        })
        .eq("id", existing.linked_savings_account_id)
      if (savErr) throw savErr
    }
  }

  return { accounts: accounts.length, payments: paymentsInserted }
}

async function syncAndRecord(admin: SupabaseClient, conn: ConnectionRow, lookbackDays?: number) {
  try {
    const result = await syncConnection(admin, conn, lookbackDays)
    await admin
      .from("simplefin_connections")
      .update({ last_synced_at: new Date().toISOString(), last_sync_status: "ok", last_sync_error: null })
      .eq("id", conn.id)
    return { connection_id: conn.id, ok: true, ...result }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`simplefin-sync: connection ${conn.id} failed`, message)
    await admin
      .from("simplefin_connections")
      .update({ last_sync_status: "error", last_sync_error: message.slice(0, 500) })
      .eq("id", conn.id)
    return { connection_id: conn.id, ok: false, error: message }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const body = await req.json().catch(() => ({}))
    const action = body.action as string | undefined

    // Cron path: shared secret, syncs every household's connections
    const syncSecret = Deno.env.get("SYNC_SECRET")
    if (syncSecret && req.headers.get("x-sync-secret") === syncSecret) {
      if (action !== "sync-all") return json({ error: "Invalid action for cron" }, 400)
      const { data: conns, error } = await admin.from("simplefin_connections").select("*")
      if (error) throw error
      const results = []
      for (const conn of (conns ?? []) as ConnectionRow[]) {
        results.push(await syncAndRecord(admin, conn))
      }
      return json({ results })
    }

    // User path: verify JWT and resolve household membership
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "Missing authorization" }, 401)
    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return json({ error: "Unauthorized" }, 401)

    const { data: memberships, error: memberErr } = await admin
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .eq("status", "active")
    if (memberErr) throw memberErr
    const householdIds = (memberships ?? []).map((m) => m.household_id as string)
    if (householdIds.length === 0) return json({ error: "No household" }, 403)

    if (action === "claim") {
      const setupToken = (body.setup_token as string | undefined)?.trim()
      if (!setupToken) return json({ error: "setup_token is required" }, 400)

      let claimUrl: string
      try {
        claimUrl = atob(setupToken).trim()
      } catch {
        return json({ error: "That doesn't look like a valid setup token" }, 400)
      }
      if (!claimUrl.startsWith("https://")) {
        return json({ error: "Setup token did not decode to a secure URL" }, 400)
      }

      const claimRes = await fetch(claimUrl, { method: "POST", headers: { "Content-Length": "0" } })
      if (!claimRes.ok) {
        return json({ error: `Could not claim token (${claimRes.status}). Setup tokens are single-use — generate a new one.` }, 400)
      }
      const accessUrl = (await claimRes.text()).trim()
      if (!accessUrl.startsWith("https://")) {
        return json({ error: "SimpleFIN returned an unexpected access URL" }, 502)
      }

      const { data: conn, error: insertErr } = await admin
        .from("simplefin_connections")
        .insert({ household_id: householdIds[0], access_url: accessUrl, created_by: user.id })
        .select("*")
        .single()
      if (insertErr) throw insertErr

      // Initial sync pulls accounts and balances; nothing is linked yet so no
      // transactions are imported until the user maps accounts.
      const result = await syncAndRecord(admin, conn as ConnectionRow)
      return json({ success: true, ...result })
    }

    if (action === "sync") {
      const lookbackDays = typeof body.lookback_days === "number" && body.lookback_days > 0
        ? Math.min(body.lookback_days, 365)
        : undefined
      let query = admin.from("simplefin_connections").select("*").in("household_id", householdIds)
      if (body.connection_id) query = query.eq("id", body.connection_id)
      const { data: conns, error } = await query
      if (error) throw error
      const results = []
      for (const conn of (conns ?? []) as ConnectionRow[]) {
        results.push(await syncAndRecord(admin, conn, lookbackDays))
      }
      return json({ results })
    }

    return json({ error: "Unknown action" }, 400)
  } catch (err) {
    console.error("simplefin-sync: unexpected error", err)
    return json({ error: "Internal server error" }, 500)
  }
})
