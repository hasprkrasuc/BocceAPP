import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import type { UserProfile, AuthContextValue } from '../types'

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
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

  return (
    <AuthContext.Provider value={{
      user, profile, loading, isAdmin, isSuperAdmin,
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
