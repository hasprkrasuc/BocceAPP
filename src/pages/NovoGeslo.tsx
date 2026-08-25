import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { napakaNovegaGesla, NAJMANJ_ZNAKOV } from '../lib/ponastavitevGesla'

type Stanje = 'preverjam' | 'pripravljen' | 'brez_seje' | 'shranjeno'

/**
 * Nastavitev novega gesla iz povezave v e-pošti.
 *
 * Povezava s sabo prinese žeton v naslovu; supabase-js ga privzeto pobere in
 * vzpostavi sejo (detectSessionInUrl). Zato tu žetona ne beremo sami — samo
 * počakamo, ali seja je. Če je ni, je povezava potekla ali bila že uporabljena.
 *
 * Čakanje na dogodek in ne le getSession(): ob prvem prikazu je odjemalec žeton
 * morda še obdeloval, zato bi takojšnje branje seje pokazalo "povezava ne
 * velja" tudi pri povsem veljavni povezavi.
 */
export default function NovoGeslo() {
  const navigate = useNavigate()
  const [stanje, setStanje] = useState<Stanje>('preverjam')
  const [geslo, setGeslo] = useState('')
  const [ponovitev, setPonovitev] = useState('')
  const [napaka, setNapaka] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let koncano = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_dogodek, session) => {
      if (session) { koncano = true; setStanje('pripravljen') }
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { koncano = true; setStanje('pripravljen') }
    })
    // Kratek rok: če žeton do tedaj ne da seje, povezava ne velja več.
    const rok = setTimeout(() => { if (!koncano) setStanje('brez_seje') }, 3000)
    return () => { subscription.unsubscribe(); clearTimeout(rok) }
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const n = napakaNovegaGesla(geslo, ponovitev)
    if (n) { setNapaka(n); return }
    setNapaka('')
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: geslo })
    if (error) { setNapaka(error.message); setLoading(false); return }
    // Zastavica za prisilno spremembo ob prvi prijavi je s tem izpolnjena;
    // sicer bi človeka takoj po ponastavitvi znova poslali na isti zaslon.
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('users').update({ must_change_password: false }).eq('id', user.id)
    setStanje('shranjeno')
    setLoading(false)
  }

  if (stanje === 'preverjam') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-bocce-green" />
      </div>
    )
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">{stanje === 'shranjeno' ? '✓' : stanje === 'brez_seje' ? '⏳' : '🔐'}</span>
          <h1 className="text-2xl font-bold text-gray-800 mt-2">
            {stanje === 'shranjeno' ? 'Geslo je shranjeno'
              : stanje === 'brez_seje' ? 'Povezava ne velja več'
              : 'Nastavi novo geslo'}
          </h1>
        </div>

        {stanje === 'brez_seje' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <p className="text-sm text-gray-700">
              Povezava za ponastavitev velja eno uro in samo enkrat. Zahtevaj novo.
            </p>
            <Link to="/pozabljeno-geslo"
              className="block text-center bg-bocce-green text-white py-2.5 rounded-lg font-semibold hover:bg-bocce-green-light transition-colors">
              Zahtevaj novo povezavo
            </Link>
          </div>
        )}

        {stanje === 'shranjeno' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <p className="text-sm text-gray-700">Odslej se prijavljaj z novim geslom.</p>
            <button onClick={() => navigate('/')}
              className="w-full bg-bocce-green text-white py-2.5 rounded-lg font-semibold hover:bg-bocce-green-light transition-colors">
              Nadaljuj v aplikacijo
            </button>
          </div>
        )}

        {stanje === 'pripravljen' && (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Novo geslo *</label>
              <input type="password" required value={geslo} onChange={e => setGeslo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
                placeholder={`Vsaj ${NAJMANJ_ZNAKOV} znakov`} autoComplete="new-password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ponovi novo geslo *</label>
              <input type="password" required value={ponovitev} onChange={e => setPonovitev(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
                placeholder="Ponovi geslo" autoComplete="new-password" />
            </div>

            {napaka && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{napaka}</div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-bocce-green text-white py-2.5 rounded-lg font-semibold hover:bg-bocce-green-light transition-colors disabled:opacity-50">
              {loading ? 'Shranjujem...' : 'Shrani geslo'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
