import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase"

export function useSupabase() {
  const [supabase] = useState(() => createClient())

  return supabase
}

export function useSupabaseAuth() {
  const supabase = useSupabase()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  return {
    user,
    loading,
    supabase,
  }
}