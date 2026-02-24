import { useState, type ReactNode } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useTheme } from "@/hooks/useTheme"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sun, Moon } from "lucide-react"

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading, householdLoading, signIn, useMockMode, setUseMockMode } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  if (loading || (user && householdLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!user && !useMockMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 relative">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <div className="w-full max-w-sm space-y-8">
          <div className="text-center">
            <h1 className="font-display text-4xl text-primary mb-2">Ember</h1>
            <p className="text-muted-foreground">
              Stop burning your money.
            </p>
          </div>

          {sent ? (
            <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
              <div className="text-4xl">✉️</div>
              <h2 className="text-lg font-semibold">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                We sent a sign-in link to <strong>{email}</strong>. Click it to continue.
              </p>
              <button
                onClick={() => setSent(false)}
                className="text-sm text-primary hover:underline cursor-pointer"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                setError("")
                setSubmitting(true)
                const { error } = await signIn(email)
                setSubmitting(false)
                if (error) {
                  setError(error.message)
                } else {
                  setSent(true)
                }
              }}
              className="rounded-xl border border-border bg-card p-6 space-y-4"
            >
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email address
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Sending..." : "Sign in with email"}
              </Button>
            </form>
          )}

          <div className="text-center">
            <button
              onClick={() => setUseMockMode(true)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Try with demo data instead
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
