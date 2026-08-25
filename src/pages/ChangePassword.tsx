import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabase'
import AccountLoginSection from '../components/AccountLoginSection'
import { napakaNovegaGesla, NAJMANJ_ZNAKOV } from '../lib/ponastavitevGesla'

/**
 * Zaslon za prisilno spremembo gesla ob prvi prijavi (must_change_password).
 * Po uspehu zastavice NE počistimo takoj, ampak najprej ponudimo zamenjavo
 * prijavnega naslova. Ker se ta zaslon po sprostitvi ne prikaže več, je
 * ponudba naravno enkratna in ne potrebuje svojega stolpca v bazi.
 */
export default function ChangePassword() {
  const { profile, signOut, refreshProfile } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ponudba, setPonudba] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    // Deljeno s ponastavitvijo prek povezave, da se pravili ne razideta.
    const n = napakaNovegaGesla(password, confirm)
    if (n) { setError(n); return }
    setLoading(true)
    try {
      const { error: pErr } = await supabase.auth.updateUser({ password })
      if (pErr) throw pErr
      setPonudba(true)
      setLoading(false)
    } catch (err) {
      setError((err as Error).message ?? 'Napaka pri shranjevanju')
      setLoading(false)
    }
  }

  async function zakljuci() {
    await supabase.from('users').update({ must_change_password: false }).eq('id', profile!.id)
    await refreshProfile() // must_change_password = false → dostop se sprosti
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <span className="text-4xl">{ponudba ? '✓' : '🔐'}</span>
          <h1 className="text-2xl font-bold text-gray-800 mt-2">
            {ponudba ? 'Geslo je shranjeno' : 'Nastavi novo geslo'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {ponudba
              ? 'Še ena stvar, preden nadaljuješ.'
              : 'Prvič si prijavljen z začetnim geslom. Pred nadaljevanjem nastavi svoje geslo.'}
          </p>
        </div>

        {ponudba ? (
          <AccountLoginSection onSkip={zakljuci} />
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Novo geslo *</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
                placeholder={`Vsaj ${NAJMANJ_ZNAKOV} znakov`} autoComplete="new-password" />
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
        )}

        <button onClick={() => signOut()} className="w-full text-center text-sm text-gray-500 mt-3 hover:text-gray-700">
          Odjava
        </button>
      </div>
    </div>
  )
}
