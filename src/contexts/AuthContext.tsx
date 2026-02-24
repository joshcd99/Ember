import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { User, Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  householdId: string | null
  householdLoading: boolean
  signIn: (email: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  useMockMode: boolean
  setUseMockMode: (v: boolean) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [useMockMode, setUseMockMode] = useState(false)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [householdLoading, setHouseholdLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Resolve household after auth
  useEffect(() => {
    if (useMockMode) {
      setHouseholdId("mock-household")
      setHouseholdLoading(false)
      return
    }

    if (!user) {
      setHouseholdId(null)
      setHouseholdLoading(false)
      return
    }

    let cancelled = false
    setHouseholdLoading(true)

    async function resolveHousehold() {
      try {
        // 1. Check for active membership via RPC helper (bypasses RLS)
        const { data: hIds } = await supabase.rpc("user_household_ids")

        if (cancelled) return

        if (hIds && hIds.length > 0) {
          setHouseholdId(hIds[0] as string)
          return
        }

        // 2. Check for pending invite by email, accept via RPC
        const email = user!.email
        if (email) {
          const { data: acceptedId } = await supabase.rpc("accept_household_invite", {
            invite_email: email,
          })

          if (cancelled) return

          if (acceptedId) {
            setHouseholdId(acceptedId as string)
            return
          }
        }

        // 3. Create new household + membership via RPC
        const { data: newId, error: createErr } = await supabase.rpc("create_household_for_user", {
          household_name: "My Household",
        })

        if (createErr) {
          console.error("household: failed to create household", createErr)
        }

        if (cancelled || !newId) return
        setHouseholdId(newId as string)
      } finally {
        if (!cancelled) setHouseholdLoading(false)
      }
    }

    resolveHousehold()

    return () => { cancelled = true }
  }, [user, useMockMode])

  const signIn = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email })
    return { error: error as Error | null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, householdId, householdLoading, signIn, signOut, useMockMode, setUseMockMode }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
