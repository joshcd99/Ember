import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import type { Household, HouseholdMember } from "@/types/database"

export function useHousehold() {
  const { householdId, useMockMode } = useAuth()
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [loading, setLoading] = useState(true)

  const fetchHousehold = useCallback(async () => {
    if (useMockMode || !householdId) {
      setLoading(false)
      return
    }

    const [hRes, mRes] = await Promise.all([
      supabase.from("households").select("*").eq("id", householdId).single(),
      supabase.from("household_members").select("*").eq("household_id", householdId).order("joined_at"),
    ])

    if (hRes.error) console.error("useHousehold: failed to fetch household", hRes.error)
    if (mRes.error) console.error("useHousehold: failed to fetch members", mRes.error)

    setHousehold((hRes.data as Household) ?? null)
    setMembers((mRes.data as HouseholdMember[]) ?? [])
    setLoading(false)
  }, [householdId, useMockMode])

  useEffect(() => {
    fetchHousehold()
  }, [fetchHousehold])

  const updateHouseholdName = async (name: string) => {
    if (useMockMode || !householdId) return
    const { error } = await supabase
      .from("households")
      .update({ name })
      .eq("id", householdId)
    if (error) throw error
    await fetchHousehold()
  }

  const inviteMember = async (email: string) => {
    if (useMockMode || !householdId) return
    const { error } = await supabase.from("household_members").insert({
      household_id: householdId,
      invited_email: email,
      status: "pending",
      user_id: null,
    })
    if (error) throw error
    await fetchHousehold()
  }

  const cancelInvite = async (memberId: string) => {
    if (useMockMode) return
    const { error } = await supabase
      .from("household_members")
      .delete()
      .eq("id", memberId)
    if (error) throw error
    await fetchHousehold()
  }

  return { household, members, loading, updateHouseholdName, inviteMember, cancelInvite }
}
