import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAppData } from "@/contexts/DataContext"
import { formatCurrencyExact, formatDate } from "@/lib/utils"
import { OWNER_OPTIONS } from "@/lib/owners"
import { Landmark, Pencil } from "lucide-react"
import type { SavingsAccount } from "@/types/database"

function AccountRow({ account }: { account: SavingsAccount }) {
  const { updateCashAccount } = useAppData()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(account.name)
  const [editingOwner, setEditingOwner] = useState(false)

  const saveOwner = async (value: string) => {
    setEditingOwner(false)
    if (value === (account.owner ?? "")) return
    try {
      await updateCashAccount(account.id, { owner: value || null })
    } catch (err) {
      console.error("CashAccountsCard: owner update failed", err)
    }
  }

  const save = async () => {
    setEditing(false)
    const trimmed = draft.trim()
    if (!trimmed || trimmed === account.name) {
      setDraft(account.name)
      return
    }
    try {
      await updateCashAccount(account.id, { name: trimmed })
    } catch (err) {
      console.error("CashAccountsCard: rename failed", err)
      setDraft(account.name)
    }
  }

  return (
    <div className="flex items-center justify-between gap-2">
      {editing ? (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
            if (e.key === "Escape") {
              setDraft(account.name)
              setEditing(false)
            }
          }}
          className="h-7 text-sm max-w-[220px]"
          autoFocus
        />
      ) : (
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => {
              setDraft(account.name)
              setEditing(true)
            }}
            className="group flex items-center gap-1.5 text-sm text-left min-w-0"
            title="Rename account"
          >
            <span className="truncate">{account.name}</span>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </button>
          {editingOwner ? (
            <select
              value={account.owner ?? ""}
              onChange={(e) => saveOwner(e.target.value)}
              onBlur={() => setEditingOwner(false)}
              className="h-6 rounded-lg border border-input bg-card px-1 text-xs text-foreground shrink-0"
              autoFocus
            >
              <option value="">No owner</option>
              {OWNER_OPTIONS.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => setEditingOwner(true)}
              className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                account.owner
                  ? "bg-muted text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground/50 hover:text-muted-foreground border border-dashed border-border"
              }`}
              title="Set owner"
            >
              {account.owner || "+ owner"}
            </button>
          )}
        </div>
      )}
      <div className="text-right shrink-0">
        <p className="text-sm font-medium">{formatCurrencyExact(account.current_balance)}</p>
        {account.last_verified_at && (
          <p className="text-[10px] text-muted-foreground">
            as of {formatDate(account.last_verified_at)}
          </p>
        )}
      </div>
    </div>
  )
}

export function CashAccountsCard() {
  const { cashAccounts } = useAppData()

  if (cashAccounts.length === 0) return null

  const checking = cashAccounts.filter(a => a.kind === "checking")
  const savings = cashAccounts.filter(a => a.kind === "savings")
  const total = cashAccounts.reduce((sum, a) => sum + a.current_balance, 0)

  const section = (label: string, accounts: SavingsAccount[]) => {
    if (accounts.length === 0) return null
    const subtotal = accounts.reduce((sum, a) => sum + a.current_balance, 0)
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium uppercase tracking-wide">{label}</span>
          {accounts.length > 1 && <span>{formatCurrencyExact(subtotal)}</span>}
        </div>
        <div className="space-y-2">
          {accounts.map(a => <AccountRow key={a.id} account={a} />)}
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-muted-foreground" />
            Cash Accounts
          </span>
          <span className="font-display">{formatCurrencyExact(total)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {section("Checking", checking)}
        {section("Savings", savings)}
      </CardContent>
    </Card>
  )
}
