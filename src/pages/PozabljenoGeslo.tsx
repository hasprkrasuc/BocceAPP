import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { opozoriloOGenericnemNaslovu, SPOROCILO_POSLANO } from '../lib/ponastavitevGesla'

/**
 * Zahteva za ponastavitev gesla.
 *
 * Povezava pripelje na /novo-geslo. Naslov mora biti v Supabase → Authentication
 * → URL Configuration med dovoljenimi (glej SETUP.md); sicer Supabase pošte ne
 * pošlje in človek nikoli ne izve, zakaj.
 *
 * Izid je namenoma enak ne glede na to, ali račun obstaja. Drugačno besedilo bi
 * naredilo iz obrazca seznam uporabnikov za vsakogar, ki zna ugibati naslove.
 */
export default function PozabljenoGeslo() {
  const [email, setEmail] = useState('')
  const [poslano, setPoslano] = useState(false)
  const [napaka, setNapaka] = useState('')
  const [loading, setLoading] = useState(false)

  const opozorilo = opozoriloOGenericnemNaslovu(email)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setNapaka('')
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/novo-geslo`,
    })
    // Napake ne požremo: brez nje bi ob nedelujoči pošti pisalo "poslano",
    // človek pa bi čakal na sporočilo, ki ne bo nikoli prišlo.
    if (error) setNapaka(error.message)
    else setPoslano(true)
    setLoading(false)
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">{poslano ? '📧' : '🔑'}</span>
          <h1 className="text-2xl font-bold text-gray-800 mt-2">
            {poslano ? 'Preveri pošto' : 'Pozabljeno geslo'}
          </h1>
          {!poslano && (
            <p className="text-gray-500 text-sm mt-1">Vpiši e-naslov, s katerim se prijavljaš.</p>
          )}
        </div>

        {poslano ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <p className="text-sm text-gray-700">{SPOROCILO_POSLANO}</p>
            <Link to="/prijava" className="block text-center text-sm text-bocce-green font-medium hover:underline">
              Nazaj na prijavo
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-naslov</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
                placeholder="ime@email.com" autoComplete="username" />
            </div>

            {opozorilo && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-3 py-2 rounded-lg">
                ⚠ {opozorilo}
              </div>
            )}
            {napaka && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{napaka}</div>
            )}

            <button type="submit" disabled={loading || !!opozorilo}
              className="w-full bg-bocce-green text-white py-2.5 rounded-lg font-semibold hover:bg-bocce-green-light transition-colors disabled:opacity-50">
              {loading ? 'Pošiljam...' : 'Pošlji povezavo za ponastavitev'}
            </button>

            <Link to="/prijava" className="block text-center text-sm text-gray-500 hover:text-gray-700">
              Nazaj na prijavo
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
