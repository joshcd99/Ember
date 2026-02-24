import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/AuthContext"
import { useTheme } from "@/hooks/useTheme"
import { useHousehold } from "@/hooks/useHousehold"
import { User, Bell, Shield, Trash2, Sun, Moon, Home, Mail, X, Check } from "lucide-react"

export function Settings() {
  const { user, signOut, useMockMode } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { household, members, updateHouseholdName, inviteMember, cancelInvite } = useHousehold()

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState("")
  const [savingName, setSavingName] = useState(false)

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviting, setInviting] = useState(false)

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
