import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { isGenericEmail } from '../lib/genericEmail'
import { isGoogleEnabled } from '../lib/authProviders'

/**
 * Prikaz prijavnega naslova in obe poti do zamenjave.
 *
 * Vgrajena je na dveh mestih in o njiju ne ve nič:
 *  - na profilu kot trajni dom (brez onSkip),
 *  - po prisilni menjavi gesla kot enkratna ponudba (z onSkip).
 */
export default function AccountLoginSection({ onSkip }: { onSkip?: () => void }) {
  const { user, refreshProfile } = useAuth()
  const [googleNaVoljo, setGoogleNaVoljo] = useState(false)
  const [novNaslov, setNovNaslov] = useState('')
  const [rocnoOdprto, setRocnoOdprto] = useState(false)
  const [stanje, setStanje] = useState<'mirno' | 'delam' | 'caka'>('mirno')
  const [napaka, setNapaka] = useState('')

  const naslov = user?.email ?? ''
  const genericen = isGenericEmail(naslov)

  useEffect(() => { isGoogleEnabled().then(setGoogleNaVoljo) }, [])

  async function poveziGoogle() {
    setNapaka('')
    setStanje('delam')
    const { error } = await supabase.auth.linkIdentity({ provider: 'google' })
    // Ob uspehu odjemalec odide na Google; koda pod tem se izvede le ob napaki.
    if (error) {
      setStanje('mirno')
      setNapaka(
        /manual linking/i.test(error.message)
          ? 'Povezovanje računov v Supabase še ni vklopljeno. Obrni se na administratorja.'
          : error.message,
      )
    }
  }

  async function zamenjajRocno(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setNapaka('')
    setStanje('delam')
    const { error } = await supabase.auth.updateUser({ email: novNaslov.trim() })
    if (error) {
      setStanje('mirno')
      setNapaka(error.message)
      return
    }
    setStanje('caka')
    await refreshProfile()
  }

  if (!genericen) {
    return (
      <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm text-gray-500">Prijavni naslov</p>
        <p className="text-sm font-medium text-gray-800">{naslov}</p>
      </div>
    )
  }

  return (
    <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <h2 className="text-base font-bold text-gray-800">Prijava</h2>
        <p className="text-sm text-gray-500 mt-1">
          Prijavljaš se z naslovom <span className="font-mono text-xs">{naslov}</span>, ki ga je
          ustvaril uvoz igralcev — pošta nanj ne pride. Zamenjaj ga za svojega, da boš lahko
          ponastavil geslo in prejemal obvestila.
        </p>
      </div>

      {stanje === 'caka' ? (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2 rounded-lg">
          Na <strong>{novNaslov}</strong> smo poslali potrditveno povezavo. Naslov se zamenja šele,
          ko jo odpreš. Če pismo ne pride v nekaj minutah, preveri vsiljeno pošto in poskusi znova.
        </div>
      ) : (
        <>
          {googleNaVoljo && (
            <button type="button" onClick={poveziGoogle} disabled={stanje === 'delam'}
              className="w-full bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50">
              Poveži z Google računom
            </button>
          )}

          {!rocnoOdprto ? (
            <button type="button" onClick={() => setRocnoOdprto(true)}
              className="w-full text-sm text-bocce-green hover:underline">
              Ali vpiši e-naslov ročno
            </button>
          ) : (
            <form onSubmit={zamenjajRocno} className="space-y-2">
              <input type="email" required value={novNaslov} onChange={e => setNovNaslov(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
                placeholder="tvoj@naslov.si" autoComplete="email" />
              <button type="submit" disabled={stanje === 'delam'}
                className="w-full bg-bocce-green text-white py-2.5 rounded-lg font-semibold hover:bg-bocce-green-light transition-colors disabled:opacity-50">
                {stanje === 'delam' ? 'Pošiljam...' : 'Pošlji potrditev'}
              </button>
            </form>
          )}
        </>
      )}

      {napaka && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{napaka}</div>
      )}

      {onSkip && (
        <button type="button" onClick={onSkip} className="w-full text-center text-sm text-gray-500 hover:text-gray-700">
          {stanje === 'caka' ? 'Nadaljuj' : 'Preskoči'}
        </button>
      )}
    </div>
  )
}
