import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/contexts/AuthContext"
import { useAppData } from "@/contexts/DataContext"
import { supabase } from "@/lib/supabase"
import { formatCurrencyExact, formatDate, cn } from "@/lib/utils"
import { detectRecurringCharges, CADENCE_LABELS, type Cadence, type RecurringCandidate } from "@/lib/recurring-detector"
import type { RawBankTxn } from "@/lib/recurring-detector"
import type { Bill, Frequency, RecurrenceType, RecurrenceUnit } from "@/types/database"
import { Radar } from "lucide-react"

function cadenceToBillFields(c: RecurringCandidate): Pick<Bill, "frequency" | "recurrence_type" | "recurrence_interval" | "recurrence_unit" | "recurrence_days_of_week" | "recurrence_days_of_month" | "recurrence_end_type"> {
  const map: Record<Cadence, { frequency: Frequency; type: RecurrenceType; interval: number; unit: RecurrenceUnit }> = {
    weekly: { frequency: "weekly", type: "weekly", interval: 1, unit: "week" },
    biweekly: { frequency: "biweekly", type: "biweekly", interval: 2, unit: "week" },
    monthly: { frequency: "monthly", type: "monthly", interval: 1, unit: "month" },
    quarterly: { frequency: "monthly", type: "custom", interval: 3, unit: "month" },
    yearly: { frequency: "monthly", type: "yearly", interval: 1, unit: "year" },
  }
  const m = map[c.cadence]
  return {
    frequency: m.frequency,
    recurrence_type: m.type,
    recurrence_interval: m.interval,
    recurrence_unit: m.unit,
    recurrence_days_of_week: [],
    recurrence_days_of_month: c.cadence === "monthly" && c.dayOfMonth ? [c.dayOfMonth] : [],
    recurrence_end_type: "never",
  }
}

export function RecurringScanner() {
  const { useMockMode } = useAuth()
  const { bills, billCategories, addBill } = useAppData()

  const [open, setOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<RecurringCandidate[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [scanMeta, setScanMeta] = useState<{ count: number; since: string } | null>(null)
  const [enriched, setEnriched] = useState<Map<string, { name: string; category?: string }>>(new Map())
  const [enriching, setEnriching] = useState(false)

  // Claude-powered cleanup: canonical brand names + category suggestions,
  // applied asynchronously so detection results show immediately
  const enrich = async (cands: RecurringCandidate[]) => {
    setEnriching(true)
    try {
      const { data } = await supabase.functions.invoke("simplefin-sync", {
        body: {
          action: "enrich",
          merchants: cands.map(c => ({
            key: c.key,
            sample: c.sampleDescription,
            amount: c.amount,
            cadence: c.cadence,
          })),
          categories: billCategories.map(c => c.name),
        },
      })
      const rows = (data?.enriched ?? []) as { key: string; name: string; category?: string }[]
      if (rows.length > 0) setEnriched(new Map(rows.map(e => [e.key, e])))
    } catch (err) {
      console.warn("RecurringScanner: enrichment unavailable", err)
    } finally {
      setEnriching(false)
    }
  }

  const scan = async () => {
    setScanning(true)
    setError(null)
    setCandidates(null)
    setSelected(new Set())
    setEnriched(new Map())
    try {
      // Pull 6 months of history into the raw feed first (idempotent)
      const { error: fnError } = await supabase.functions.invoke("simplefin-sync", {
        body: { action: "sync", lookback_days: 180 },
      })
      if (fnError) console.warn("RecurringScanner: deep sync failed, using stored history", fnError)

      const since = new Date()
      since.setDate(since.getDate() - 365)
      const [txRes, acctRes] = await Promise.all([
        supabase
          .from("simplefin_transactions")
          .select("id, account_id, posted, amount, description")
          .gte("posted", since.toISOString().slice(0, 10))
          .order("posted", { ascending: true })
          .limit(5000),
        supabase.from("simplefin_accounts").select("id, account_kind"),
      ])
      if (txRes.error) throw txRes.error

      const txns = (txRes.data as RawBankTxn[]) ?? []
      // Account types matter: charge sign conventions differ between
      // checking and credit card / loan accounts
      const kinds = new Map<string, string | null>(
        ((acctRes.data as { id: string; account_kind: string | null }[]) ?? []).map(a => [a.id, a.account_kind])
      )
      setScanMeta(txns.length > 0 ? { count: txns.length, since: txns[0].posted } : null)
      const detected = detectRecurringCharges(txns, bills, kinds)
      setCandidates(detected)
      if (detected.length > 0) enrich(detected)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed.")
    } finally {
      setScanning(false)
    }
  }

  const openAndScan = () => {
    setOpen(true)
    scan()
  }

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const addSelected = async () => {
    if (!candidates) return
    setAdding(true)
    setError(null)
    try {
      const fallbackCategory = billCategories.find(c => /subscri|stream/i.test(c.name))?.name
        ?? billCategories.find(c => c.name === "Other")?.name
        ?? "Other"
      for (const c of candidates.filter(c => selected.has(c.key))) {
        const e = enriched.get(c.key)
        const category = e?.category && billCategories.some(bc => bc.name === e.category)
          ? e.category
          : fallbackCategory
        await addBill({
          name: e?.name || c.name,
          amount: c.amount,
          next_due_date: c.nextExpected,
          category,
          notes: `Detected from bank history — ${c.occurrences} charges, ${CADENCE_LABELS[c.cadence].toLowerCase()} (last: ${c.sampleDescription.slice(0, 80)})`,
          ...cadenceToBillFields(c),
        })
      }
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the selected expenses.")
    } finally {
      setAdding(false)
    }
  }

  if (useMockMode) return null

  return (
    <>
      <Button variant="outline" size="sm" onClick={openAndScan}>
        <Radar className="h-4 w-4" /> Find recurring
      </Button>

      <Dialog open={open} onOpenChange={(v) => !v && !adding && setOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Recurring charges</DialogTitle>
            <DialogDescription>
              Found by scanning your synced accounts for charges that repeat at a steady
              interval and amount. Select the ones to track as expenses.
            </DialogDescription>
          </DialogHeader>

          {scanning ? (
            <div className="animate-pulse text-muted-foreground py-8 text-center text-sm">
              Scanning 6 months of bank history...
            </div>
          ) : candidates && candidates.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No recurring charges detected yet. Detection needs a few repeat charges of
              history — try again after a couple more sync cycles.
            </p>
          ) : candidates ? (
            <div className="max-h-[50vh] overflow-y-auto space-y-1 -mx-1 px-1">
              {candidates.map(c => (
                <label
                  key={c.key}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer transition-colors",
                    selected.has(c.key) ? "border-primary bg-primary/5" : "border-border",
                    c.alreadyTracked && "opacity-50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.key)}
                    onChange={() => toggle(c.key)}
                    className="h-4 w-4 accent-[#5F9EA0] shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {enriched.get(c.key)?.name || c.name}
                      {c.alreadyTracked && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">Already tracked</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {CADENCE_LABELS[c.cadence]} · {c.occurrences}× · last {formatDate(c.lastDate)}
                      {c.amountVaries && " · amount varies"}
                      {enriched.get(c.key)?.category && ` · ${enriched.get(c.key)!.category}`}
                    </p>
                  </div>
                  <span className="text-sm font-semibold shrink-0">
                    {c.amountVaries ? "~" : ""}{formatCurrencyExact(c.amount)}
                  </span>
                </label>
              ))}
            </div>
          ) : null}

          {!scanning && scanMeta && (
            <p className="text-xs text-muted-foreground">
              {enriching && "Cleaning up names… · "}
              Scanned {scanMeta.count.toLocaleString()} bank transactions since {formatDate(scanMeta.since)}.
              {new Date(scanMeta.since) > new Date(Date.now() - 100 * 86400e3) &&
                " Your bank only provided recent history — more patterns will surface as syncs accumulate."}
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={adding}>
              Close
            </Button>
            <Button onClick={addSelected} disabled={adding || selected.size === 0}>
              {adding ? "Adding..." : `Add ${selected.size || ""} as expense${selected.size === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
