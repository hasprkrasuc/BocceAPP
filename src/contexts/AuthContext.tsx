import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import type { UserProfile, AuthContextValue } from '../types'

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  /** Sezone, katerih admin je prijavljeni uporabnik (prazno pri globalnem adminu). */
  const [managedSeasonIds, setManagedSeasonIds] = useState<string[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) { fetchProfile(session.user.id); fetchManagedSeasons(session.user.id) }
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) { fetchProfile(session.user.id); fetchManagedSeasons(session.user.id) }
      else { setProfile(null); setManagedSeasonIds([]); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    // Lasten profil vključuje občutljive stolpce (telefon), zato gre skozi
    // users_sensitive — na public.users jih vloga authenticated ne sme brati.
    // Pogled vrstice omeji na lasten profil (ali na vse, če je uporabnik admin),
    // zato je filter po id tu nujen.
    const { data } = await supabase.from('users_sensitive').select('*').eq('id', userId).single()
    setProfile(data)
    setLoading(false)
  }

  /**
   * Sezone, ki jih uporabnik ureja kot ligaški admin. Politika na
   * league_season_admins vrne samo lastne vrstice, zato filter po uporabniku
   * ni varnostni ukrep, ampak le manj prenesenih vrstic.
   */
  async function fetchManagedSeasons(userId: string) {
    const { data } = await supabase.from('league_season_admins').select('season_id').eq('user_id', userId)
    setManagedSeasonIds((data ?? []).map(r => r.season_id as string))
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signUp(email: string, password: string, fullName: string, club: string) {
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, club } },
    })
    if (error) throw error
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  async function updateProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    // Brez .select(): RETURNING bi zahteval bralno pravico na vseh vrnjenih
    // stolpcih, teh pa authenticated na public.users nima. Osvežen profil
    // preberemo iz pogleda.
    const { error } = await supabase.from('users').update(updates).eq('id', user!.id)
    if (error) throw error
    const { data, error: readError } = await supabase
      .from('users_sensitive').select('*').eq('id', user!.id).single()
    if (readError) throw readError
    setProfile(data)
    return data
  }

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
  const isSuperAdmin = profile?.role === 'super_admin'
  /** Ureja vsaj eno ligo, ni pa nujno globalni admin. */
  const isLeagueAdmin = managedSeasonIds.length > 0

  return (
    <AuthContext.Provider value={{
      user, profile, loading, isAdmin, isSuperAdmin, isLeagueAdmin, managedSeasonIds,
      signIn, signUp, signOut, updateProfile,
      refreshProfile: () => { if (user) fetchProfile(user.id) },
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
