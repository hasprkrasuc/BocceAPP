import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabase'

/**
 * Zaslon za prisilno spremembo gesla ob prvi prijavi (must_change_password).
 * Zaenkrat samo geslo (sprememba e-pošte pride kasneje — strežniško, brez
 * potrjevanja). Po uspehu počisti zastavico must_change_password, kar sprosti
 * dostop do aplikacije.
 */
export default function ChangePassword() {
  const { profile, signOut, refreshProfile } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Novo geslo mora imeti vsaj 8 znakov'); return }
    if (password !== confirm) { setError('Gesli se ne ujemata'); return }
    setLoading(true)
    try {
      const { error: pErr } = await supabase.auth.updateUser({ password })
      if (pErr) throw pErr
      await supabase.from('users').update({ must_change_password: false }).eq('id', profile!.id)
      await refreshProfile() // must_change_password = false → dostop se sprosti
    } catch (err) {
      setError((err as Error).message ?? 'Napaka pri shranjevanju')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <span className="text-4xl">🔐</span>
          <h1 className="text-2xl font-bold text-gray-800 mt-2">Nastavi novo geslo</h1>
          <p className="text-gray-500 text-sm mt-1">
            Prvič si prijavljen z začetnim geslom. Pred nadaljevanjem nastavi svoje geslo.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Novo geslo *</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
              placeholder="Vsaj 8 znakov" autoComplete="new-password" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ponovi novo geslo *</label>
            <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
              placeholder="Ponovi geslo" autoComplete="new-password" />
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}

          <button type="submit" disabled={loading}
            className="w-full bg-bocce-green text-white py-2.5 rounded-lg font-semibold hover:bg-bocce-green-light transition-colors disabled:opacity-50">
            {loading ? 'Shranjujem...' : 'Shrani in nadaljuj'}
          </button>
        </form>

        <p className="text-center text-[11px] text-gray-400 mt-3">Sprememba e-pošte bo na voljo kasneje.</p>
        <button onClick={() => signOut()} className="w-full text-center text-sm text-gray-500 mt-3 hover:text-gray-700">
          Odjava
        </button>
      </div>
    </div>
  )
}
