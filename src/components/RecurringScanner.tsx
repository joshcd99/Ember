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
import { Radar, X, Link2, Undo2 } from "lucide-react"

interface RecurringLink {
  id: string
  merchant_key: string
  kind: "dismissed" | "bill" | "debt"
  bill_id: string | null
  debt_id: string | null
}

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
  const { useMockMode, householdId } = useAuth()
  const { bills, billCategories, debts, addBill } = useAppData()

  const [open, setOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<RecurringCandidate[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [scanMeta, setScanMeta] = useState<{ count: number; since: string } | null>(null)
  const [enriched, setEnriched] = useState<Map<string, { name: string; category?: string }>>(new Map())
  const [enriching, setEnriching] = useState(false)
  const [links, setLinks] = useState<RecurringLink[]>([])
  const [showDismissed, setShowDismissed] = useState(false)
  const [linkingKey, setLinkingKey] = useState<string | null>(null)
  const [linkDraft, setLinkDraft] = useState<Set<string>>(new Set()) // "bill:<id>" | "debt:<id>"

  const linksFor = (key: string) => links.filter(l => l.merchant_key === key && l.kind !== "dismissed")
  const isDismissed = (key: string) => links.some(l => l.merchant_key === key && l.kind === "dismissed")

  const refreshLinks = async () => {
    const { data } = await supabase
      .from("recurring_links")
      .select("id, merchant_key, kind, bill_id, debt_id")
    setLinks((data as RecurringLink[]) ?? [])
  }

  const dismiss = async (key: string) => {
    const { error: e } = await supabase
      .from("recurring_links")
      .insert({ household_id: householdId!, merchant_key: key, kind: "dismissed" })
    if (!e) {
      setSelected(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      await refreshLinks()
    }
  }

  const restore = async (key: string) => {
    const { error: e } = await supabase
      .from("recurring_links")
      .delete()
      .eq("merchant_key", key)
      .eq("kind", "dismissed")
    if (!e) await refreshLinks()
  }

  const openLinkPanel = (key: string) => {
    setLinkingKey(key)
    setLinkDraft(new Set(
      linksFor(key).map(l => l.kind === "bill" ? `bill:${l.bill_id}` : `debt:${l.debt_id}`)
    ))
  }

  const saveLinks = async () => {
    if (!linkingKey) return
    // Replace this merchant's link rows with the draft selection
    const { error: delErr } = await supabase
      .from("recurring_links")
      .delete()
      .eq("merchant_key", linkingKey)
      .in("kind", ["bill", "debt"])
    if (delErr) return
    const rows = [...linkDraft].map(v => {
      const [kind, id] = v.split(":")
      return {
        household_id: householdId!,
        merchant_key: linkingKey,
        kind,
        bill_id: kind === "bill" ? id : null,
        debt_id: kind === "debt" ? id : null,
      }
    })
    if (rows.length > 0) await supabase.from("recurring_links").insert(rows)
    setLinkingKey(null)
    setSelected(prev => {
      const next = new Set(prev)
      next.delete(linkingKey)
      return next
    })
    await refreshLinks()
  }

  const linkLabel = (key: string) => {
    const names = linksFor(key).map(l =>
      l.kind === "bill"
        ? bills.find(b => b.id === l.bill_id)?.name
        : debts.find(d => d.id === l.debt_id)?.name
    ).filter(Boolean)
    return names.join(", ")
  }

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
      await refreshLinks()
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
              {candidates.filter(c => !isDismissed(c.key)).map(c => {
                const linked = linksFor(c.key).length > 0
                const linkOpen = linkingKey === c.key
                return (
                  <div
                    key={c.key}
                    className={cn(
                      "rounded-lg border transition-colors",
                      selected.has(c.key) ? "border-primary bg-primary/5" : "border-border",
                      (c.alreadyTracked || linked) && !linkOpen && "opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-3 p-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(c.key)}
                        onChange={() => toggle(c.key)}
                        disabled={linked}
                        className="h-4 w-4 accent-[#5F9EA0] shrink-0"
                        title={linked ? "Linked — unlink to add as a new expense" : "Add as a new expense"}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {enriched.get(c.key)?.name || c.name}
                          {linked ? (
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                              Linked: {linkLabel(c.key)}
                            </Badge>
                          ) : c.alreadyTracked ? (
                            <Badge variant="secondary" className="ml-2 text-[10px]">Already tracked</Badge>
                          ) : null}
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
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0 shrink-0"
                        title="Link to existing debts or expenses"
                        onClick={() => linkOpen ? setLinkingKey(null) : openLinkPanel(c.key)}
                      >
                        <Link2 className={cn("h-3.5 w-3.5", linked && "text-primary")} />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0 shrink-0"
                        title="Dismiss — hide from future scans"
                        onClick={() => dismiss(c.key)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {linkOpen && (
                      <div className="border-t border-border p-2.5 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          This charge covers (select any that apply — one payment can cover several):
                        </p>
                        <div className="max-h-36 overflow-y-auto space-y-1">
                          {debts.map(d => {
                            const v = `debt:${d.id}`
                            return (
                              <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={linkDraft.has(v)}
                                  onChange={() => setLinkDraft(prev => {
                                    const next = new Set(prev)
                                    if (next.has(v)) next.delete(v)
                                    else next.add(v)
                                    return next
                                  })}
                                  className="h-3.5 w-3.5 accent-[#5F9EA0]"
                                />
                                <span className="truncate">{d.name}</span>
                                <span className="text-[10px] text-muted-foreground">debt</span>
                              </label>
                            )
                          })}
                          {bills.map(b => {
                            const v = `bill:${b.id}`
                            return (
                              <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={linkDraft.has(v)}
                                  onChange={() => setLinkDraft(prev => {
                                    const next = new Set(prev)
                                    if (next.has(v)) next.delete(v)
                                    else next.add(v)
                                    return next
                                  })}
                                  className="h-3.5 w-3.5 accent-[#5F9EA0]"
                                />
                                <span className="truncate">{b.name}</span>
                                <span className="text-[10px] text-muted-foreground">expense</span>
                              </label>
                            )
                          })}
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setLinkingKey(null)}>
                            Cancel
                          </Button>
                          <Button size="sm" className="h-7 text-xs" onClick={saveLinks}>
                            {linkDraft.size === 0 ? "Unlink" : `Link to ${linkDraft.size}`}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {candidates.some(c => isDismissed(c.key)) && (
                <div className="pt-1">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setShowDismissed(s => !s)}
                  >
                    {showDismissed ? "Hide" : "Show"} {candidates.filter(c => isDismissed(c.key)).length} dismissed
                  </button>
                  {showDismissed && candidates.filter(c => isDismissed(c.key)).map(c => (
                    <div key={c.key} className="flex items-center gap-3 rounded-lg border border-border p-2.5 mt-1 opacity-50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{enriched.get(c.key)?.name || c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {CADENCE_LABELS[c.cadence]} · {c.amountVaries ? "~" : ""}{formatCurrencyExact(c.amount)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs shrink-0"
                        onClick={() => restore(c.key)}
                      >
                        <Undo2 className="h-3 w-3" /> Restore
                      </Button>
                    </div>
                  ))}
                </div>
              )}
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
