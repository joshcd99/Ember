import { useState } from "react"
import { version } from "../../package.json"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/AuthContext"
import { useAppData } from "@/contexts/DataContext"
import { supabase } from "@/lib/supabase"
import { useTheme } from "@/hooks/useTheme"
import { useHousehold } from "@/hooks/useHousehold"
import { useSimpleFin } from "@/hooks/useSimpleFin"
import { CATEGORY_COLORS } from "@/lib/bill-categories"
import { formatCurrencyExact } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { User, Bell, Shield, Trash2, Sun, Moon, Home, Mail, X, Check, Tag, Plus, CalendarDays, Landmark, RefreshCw } from "lucide-react"

export function Settings() {
  const { user, signOut, useMockMode } = useAuth()
  const { billCategories, addBillCategory, deleteBillCategory, householdSettings, updateBalanceThresholds, debts, refresh } = useAppData()
  const { theme, toggleTheme } = useTheme()
  const { household, members, updateHouseholdName, inviteMember, removeMember } = useHousehold()
  const simplefin = useSimpleFin()

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState("")
  const [savingName, setSavingName] = useState(false)

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviting, setInviting] = useState(false)

  // Bank sync (SimpleFIN)
  const [setupToken, setSetupToken] = useState("")
  const [connecting, setConnecting] = useState(false)
  const [bankSyncError, setBankSyncError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [confirmDisconnectId, setConfirmDisconnectId] = useState<string | null>(null)

  // Bill category management
  const [newCatName, setNewCatName] = useState("")
  const [newCatColor, setNewCatColor] = useState<string>(CATEGORY_COLORS[0])
  const [confirmDeleteCatId, setConfirmDeleteCatId] = useState<string | null>(null)
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState<string | null>(null)

  // Balance threshold settings
  const [upperThreshold, setUpperThreshold] = useState(String(householdSettings?.balance_upper_threshold ?? 10000))
  const [lowerThreshold, setLowerThreshold] = useState(String(householdSettings?.balance_lower_threshold ?? 2000))
  const [thresholdsDirty, setThresholdsDirty] = useState(false)

  // Delete all data
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const activeMembers = members.filter(m => m.status === "active")
  const pendingMembers = members.filter(m => m.status === "pending")

  const handleSaveName = async () => {
    if (!nameValue.trim()) return
    setSavingName(true)
    try {
      await updateHouseholdName(nameValue.trim())
      setEditingName(false)
    } finally {
      setSavingName(false)
    }
  }

  const handleDeleteAllData = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      const { error } = await supabase.rpc("delete_household_for_user")
      if (error) throw error
      // AuthContext re-resolves on reload and creates a fresh empty household
      window.location.reload()
    } catch (e) {
      console.error("Settings: failed to delete household data", e)
      setDeleteError("Something went wrong deleting your data. Please try again.")
      setDeleting(false)
    }
  }

  const handleConnectBank = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!setupToken.trim()) return
    setConnecting(true)
    setBankSyncError(null)
    try {
      await simplefin.connect(setupToken.trim())
      setSetupToken("")
    } catch (err) {
      setBankSyncError(err instanceof Error ? err.message : "Something went wrong connecting.")
    } finally {
      setConnecting(false)
    }
  }

  const handleSyncNow = async () => {
    setSyncing(true)
    setBankSyncError(null)
    try {
      await simplefin.syncNow()
      await refresh()
    } catch (err) {
      setBankSyncError(err instanceof Error ? err.message : "Sync failed.")
    } finally {
      setSyncing(false)
    }
  }

  const handleLinkChange = async (accountId: string, value: string) => {
    setBankSyncError(null)
    try {
      if (value === "savings") {
        await simplefin.linkAccount(accountId, { debtId: null, savings: true })
      } else if (value.startsWith("debt:")) {
        await simplefin.linkAccount(accountId, { debtId: value.slice(5), savings: false })
      } else {
        await simplefin.linkAccount(accountId, { debtId: null, savings: false })
      }
    } catch (err) {
      setBankSyncError(err instanceof Error ? err.message : "Could not update the link.")
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      await inviteMember(inviteEmail.trim())
      setInviteEmail("")
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-3xl">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and preferences.</p>
      </div>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Email</p>
              <p className="text-sm text-muted-foreground">
                {useMockMode ? "demo@ember.app" : user?.email ?? "Not signed in"}
              </p>
            </div>
            {useMockMode && <Badge variant="warning">Demo Mode</Badge>}
          </div>
          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </CardContent>
      </Card>

      {/* Household — hidden in mock mode */}
      {!useMockMode && household && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5 text-muted-foreground" />
              Household
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Household name */}
            <div>
              <p className="text-sm font-medium mb-2">Household name</p>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    className="max-w-xs"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                  />
                  <Button size="sm" onClick={handleSaveName} disabled={savingName}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingName(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{household.name}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setNameValue(household.name); setEditingName(true) }}
                  >
                    Edit
                  </Button>
                </div>
              )}
            </div>

            {/* Active members */}
            <div>
              <p className="text-sm font-medium mb-2">Members</p>
              <div className="space-y-2">
                {activeMembers.map(m => (
                  <div key={m.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{m.invited_email ?? (m.user_id === user?.id ? user.email : m.user_id)}</span>
                      {m.joined_at && (
                        <span className="text-muted-foreground text-xs">
                          joined {new Date(m.joined_at).toLocaleDateString()}
                        </span>
                      )}
                      {m.user_id === user?.id && <Badge variant="secondary">You</Badge>}
                    </div>
                    {m.user_id !== user?.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmRemoveMemberId(m.id)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Pending invites */}
            {pendingMembers.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Pending invites</p>
                <div className="space-y-2">
                  {pendingMembers.map(m => (
                    <div key={m.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{m.invited_email}</span>
                        <Badge variant="secondary">Pending</Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeMember(m.id)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invite form */}
            <div>
              <p className="text-sm font-medium mb-2">Invite a member</p>
              <form onSubmit={handleInvite} className="flex items-center gap-2">
                <Input
                  type="email"
                  placeholder="partner@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="max-w-xs"
                  required
                />
                <Button type="submit" size="sm" disabled={inviting}>
                  {inviting ? "Inviting..." : "Invite"}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bank Sync — hidden in mock mode */}
      {!useMockMode && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-muted-foreground" />
              Bank Sync
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Ember can pull real balances and payments automatically through{" "}
              <a
                href="https://bridge.simplefin.org"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-2"
              >
                SimpleFIN Bridge
              </a>
              . Connect your banks there, generate a setup token, and paste it below.
              Access is read-only and refreshes about once a day.
            </p>

            {simplefin.connections.map(conn => {
              const connAccounts = simplefin.accounts.filter(a => a.connection_id === conn.id)
              return (
                <div key={conn.id} className="rounded-lg border border-input p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      {conn.last_synced_at
                        ? `Last synced ${new Date(conn.last_synced_at).toLocaleString()}`
                        : "Not synced yet"}
                      {conn.last_sync_status === "error" && (
                        <Badge variant="destructive" className="ml-2">Sync error</Badge>
                      )}
                    </div>
                    {confirmDisconnectId === conn.id ? (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 text-xs"
                          onClick={async () => {
                            await simplefin.disconnect(conn.id)
                            setConfirmDisconnectId(null)
                          }}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setConfirmDisconnectId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setConfirmDisconnectId(conn.id)}
                      >
                        Disconnect
                      </Button>
                    )}
                  </div>
                  {conn.last_sync_status === "error" && conn.last_sync_error && (
                    <p className="text-xs text-destructive">{conn.last_sync_error}</p>
                  )}
                  <div className="space-y-2">
                    {connAccounts.map(acct => (
                      <div
                        key={acct.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm truncate">
                            {acct.name}
                            {acct.org_name && (
                              <span className="text-muted-foreground"> · {acct.org_name}</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {acct.balance != null ? formatCurrencyExact(acct.balance) : "—"}
                          </p>
                        </div>
                        <select
                          value={
                            acct.linked_debt_id
                              ? `debt:${acct.linked_debt_id}`
                              : acct.linked_savings
                                ? "savings"
                                : ""
                          }
                          onChange={(e) => handleLinkChange(acct.id, e.target.value)}
                          className="h-8 rounded-lg border border-input bg-card px-2 text-sm text-foreground sm:max-w-[220px]"
                        >
                          <option value="">Not linked</option>
                          {debts.map(d => (
                            <option key={d.id} value={`debt:${d.id}`}>
                              Debt: {d.name}
                            </option>
                          ))}
                          <option value="savings">Savings account</option>
                        </select>
                      </div>
                    ))}
                    {connAccounts.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No accounts yet — try syncing.
                      </p>
                    )}
                  </div>
                </div>
              )
            })}

            {simplefin.connections.length > 0 && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleSyncNow} disabled={syncing}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Syncing..." : "Sync now"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Linked accounts update debt and savings balances; card payments are logged automatically.
                </p>
              </div>
            )}

            <form onSubmit={handleConnectBank} className="flex items-center gap-2">
              <Input
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                placeholder="Paste SimpleFIN setup token"
                className="max-w-xs"
                required
              />
              <Button type="submit" size="sm" disabled={connecting}>
                {connecting ? "Connecting..." : "Connect"}
              </Button>
            </form>
            {bankSyncError && <p className="text-sm text-destructive">{bankSyncError}</p>}
          </CardContent>
        </Card>
      )}

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-sm text-muted-foreground">
                Switch between dark and light mode
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={toggleTheme}>
              {theme === "dark" ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Balance verification reminders</p>
              <p className="text-sm text-muted-foreground">
                Prompt to verify real balances every 90 days
              </p>
            </div>
            <Badge variant="success">On</Badge>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Check-in reminders</p>
              <p className="text-sm text-muted-foreground">
                Daily notification to log your activity
              </p>
            </div>
            <Badge variant="secondary">Coming soon</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Calendar Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            Calendar Balance Thresholds
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Days are tinted green when your balance is above the upper threshold, and red when below the lower threshold.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Upper (green)</label>
              <Input
                type="number"
                value={upperThreshold}
                onChange={(e) => { setUpperThreshold(e.target.value); setThresholdsDirty(true) }}
                min={0}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Lower (red)</label>
              <Input
                type="number"
                value={lowerThreshold}
                onChange={(e) => { setLowerThreshold(e.target.value); setThresholdsDirty(true) }}
                min={0}
                className="mt-1"
              />
            </div>
          </div>
          {thresholdsDirty && (
            <Button
              size="sm"
              onClick={async () => {
                await updateBalanceThresholds(Number(upperThreshold) || 10000, Number(lowerThreshold) || 2000)
                setThresholdsDirty(false)
              }}
            >
              Save thresholds
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Bill Categories */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-muted-foreground" />
            Bill Categories
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Category list */}
          <div className="space-y-2">
            {billCategories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-sm">{cat.name}</span>
                  {cat.is_default && <Badge variant="secondary" className="text-xs">Default</Badge>}
                </div>
                {confirmDeleteCatId === cat.id ? (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      onClick={async () => { await deleteBillCategory(cat.id); setConfirmDeleteCatId(null) }}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setConfirmDeleteCatId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => setConfirmDeleteCatId(cat.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Add new category */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Add new</p>
            <div className="flex items-center gap-2">
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Category name"
                className="max-w-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newCatName.trim()) {
                    addBillCategory({ name: newCatName.trim(), color: newCatColor, is_default: false })
                    setNewCatName("")
                    setNewCatColor(CATEGORY_COLORS[0])
                  }
                }}
              />
              <Button
                size="sm"
                disabled={!newCatName.trim()}
                onClick={() => {
                  if (newCatName.trim()) {
                    addBillCategory({ name: newCatName.trim(), color: newCatColor, is_default: false })
                    setNewCatName("")
                    setNewCatColor(CATEGORY_COLORS[0])
                  }
                }}
              >
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORY_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewCatColor(color)}
                  className={`h-5 w-5 rounded-full transition-all ${newCatColor === color ? "ring-2 ring-primary ring-offset-2" : ""}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Privacy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            Privacy & Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your data is stored securely in your own Supabase database. Row-level security
            ensures only your household members can access your shared records.
          </p>
          <Button
            variant="destructive"
            size="sm"
            disabled={useMockMode}
            onClick={() => {
              setDeleteConfirmText("")
              setDeleteError(null)
              setDeleteDialogOpen(true)
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete all my data
          </Button>
          {useMockMode && (
            <p className="text-xs text-muted-foreground">Not available in demo mode.</p>
          )}
        </CardContent>
      </Card>

      {/* Version */}
      <p className="text-xs text-muted-foreground text-center">Ember v{version}</p>

      {/* Delete all data confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => !open && !deleting && setDeleteDialogOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete all my data</DialogTitle>
            <DialogDescription>
              This permanently deletes all debts, income sources, expenses, transactions,
              check-ins, savings, and settings for your household
              {activeMembers.length > 1 && " — for every member, not just you"}.
              Your account stays, but this can't be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">
              Type <span className="font-semibold">delete</span> to confirm:
            </p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="delete"
              autoFocus
            />
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmText.trim().toLowerCase() !== "delete" || deleting}
              onClick={handleDeleteAllData}
            >
              {deleting ? "Deleting..." : "Delete everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove member confirmation dialog */}
      <Dialog open={!!confirmRemoveMemberId} onOpenChange={(open) => !open && setConfirmRemoveMemberId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this person from your household? They'll lose access to all shared data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemoveMemberId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmRemoveMemberId) removeMember(confirmRemoveMemberId)
                setConfirmRemoveMemberId(null)
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
