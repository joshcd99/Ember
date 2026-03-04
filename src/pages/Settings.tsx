import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/AuthContext"
import { useAppData } from "@/contexts/DataContext"
import { useTheme } from "@/hooks/useTheme"
import { useHousehold } from "@/hooks/useHousehold"
import { CATEGORY_COLORS } from "@/lib/bill-categories"
import { User, Bell, Shield, Trash2, Sun, Moon, Home, Mail, X, Check, Tag, Plus, CalendarDays } from "lucide-react"

export function Settings() {
  const { user, signOut, useMockMode } = useAuth()
  const { billCategories, addBillCategory, deleteBillCategory, householdSettings, updateBalanceThresholds } = useAppData()
  const { theme, toggleTheme } = useTheme()
  const { household, members, updateHouseholdName, inviteMember, cancelInvite } = useHousehold()

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState("")
  const [savingName, setSavingName] = useState(false)

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviting, setInviting] = useState(false)

  // Bill category management
  const [newCatName, setNewCatName] = useState("")
  const [newCatColor, setNewCatColor] = useState<string>(CATEGORY_COLORS[0])
  const [confirmDeleteCatId, setConfirmDeleteCatId] = useState<string | null>(null)

  // Balance threshold settings
  const [upperThreshold, setUpperThreshold] = useState(String(householdSettings?.balance_upper_threshold ?? 10000))
  const [lowerThreshold, setLowerThreshold] = useState(String(householdSettings?.balance_lower_threshold ?? 2000))
  const [thresholdsDirty, setThresholdsDirty] = useState(false)

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
                  <div key={m.id} className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{m.invited_email ?? (m.user_id === user?.id ? user.email : m.user_id)}</span>
                    {m.joined_at && (
                      <span className="text-muted-foreground text-xs">
                        joined {new Date(m.joined_at).toLocaleDateString()}
                      </span>
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
                        onClick={() => cancelInvite(m.id)}
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
          <Button variant="destructive" size="sm" disabled>
            <Trash2 className="h-4 w-4" />
            Delete all my data
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
