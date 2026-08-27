import { Fragment, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../contexts/AuthContext'
import { ROLE_LABELS, ROLE_COLORS } from '../../lib/roles'
import { isGenericEmail } from '../../lib/genericEmail'
import ImageUpload from '../../components/ImageUpload'
import type { UserRole } from '../../types'

/**
 * MOJ KLUB — zaslon klubskega skrbnika.
 *
 * Namen je en sam in ozek: klubski tajnik svojim članom vpiše prave e-naslove,
 * da se sploh morejo prijaviti. Od 1446 uporabnikov jih ima 1413 naslov, ki ga
 * je dodelila aplikacija in ne prejema pošte; prijavilo se je 15 ljudi.
 *
 * Kar ta zaslon NAMENOMA ne zna: vlog, EMŠO, datuma rojstva, licence in
 * članstva v klubu. Tega ne omejuje samo vmesnik — pogled `club_members` teh
 * stolpcev sploh ne vrne, api/club-member.ts pa jih ne zapiše.
 */

interface Clan {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  photo_url: string | null
  role: UserRole
  birth_year: number | null
  club_id: string
  club: string | null
}

export default function MojKlub() {
  const { isAdmin, managedClubIds } = useAuth()
  const [clani, setClani] = useState<Clan[]>([])
  const [klubi, setKlubi] = useState<{ id: string; name: string }[]>([])
  const [izbraniKlub, setIzbraniKlub] = useState<string>('')
  const [iskanje, setIskanje] = useState('')
  const [loading, setLoading] = useState(true)
  const [urejam, setUrejam] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [novoGeslo, setNovoGeslo] = useState<string | null>(null)
  const [novNaslov, setNovNaslov] = useState('')
  const [novTelefon, setNovTelefon] = useState('')

  useEffect(() => { nalozi() }, [])

  async function nalozi() {
    // club_members vrne SAMO člane klubov, ki jih uporabnik ureja (ali vse pri
    // globalnem adminu). Meja je v pogledu, ne v tej komponenti.
    const { data } = await supabase.from('club_members').select('*').order('full_name')
    const vsi = (data ?? []) as Clan[]
    setClani(vsi)
    const imena = new Map<string, string>()
    for (const c of vsi) if (c.club_id) imena.set(c.club_id, c.club ?? 'Klub')
    const seznam = [...imena].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'sl'))
    setKlubi(seznam)
    if (seznam.length === 1) setIzbraniKlub(seznam[0].id)
    setLoading(false)
  }

  async function zeton(): Promise<string | undefined> {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  }

  async function poslji(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/club-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await zeton()}` },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Dejanje ni uspelo')
      return json
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function shraniNaslov(c: Clan) {
    const naslov = novNaslov.trim().toLowerCase()
    if (!naslov || naslov === (c.email ?? '').toLowerCase()) return
    if (!window.confirm(`Prijavni e-naslov za ${c.full_name} spremeniti v ${naslov}?`)) return
    const json = await poslji({ action: 'set-email', userId: c.id, email: naslov })
    if (!json) return
    setClani(v => v.map(x => (x.id === c.id ? { ...x, email: naslov } : x)))
    setNovNaslov('')
    setMsg(`✓ Prijavni naslov je zdaj ${naslov}`)
  }

  async function ponastaviGeslo(c: Clan) {
    if (!window.confirm(
      `Ponastaviti geslo za ${c.full_name}?\n\n` +
      'Staro geslo bo takoj neveljavno. Novo se prikaže enkrat — prepiši ga, preden zapreš vrstico.'
    )) return
    setNovoGeslo(null)
    const json = await poslji({ action: 'reset-password', userId: c.id })
    if (json) setNovoGeslo(json.password as string)
  }

  async function shraniTelefon(c: Clan) {
    const tel = novTelefon.trim()
    if (tel === (c.phone ?? '')) return
    const json = await poslji({ action: 'set-phone', userId: c.id, phone: tel })
    if (!json) return
    setClani(v => v.map(x => (x.id === c.id ? { ...x, phone: tel || null } : x)))
    setNovTelefon('')
    setMsg(tel ? '✓ Telefon shranjen' : '✓ Telefon odstranjen')
  }

  async function shraniFotografijo(c: Clan, photoUrl: string | null) {
    const json = await poslji({ action: 'set-photo', userId: c.id, photoUrl })
    if (!json) return
    setClani(v => v.map(x => (x.id === c.id ? { ...x, photo_url: photoUrl } : x)))
    setMsg(photoUrl ? '✓ Fotografija shranjena' : '✓ Fotografija odstranjena')
  }

  function preklopi(id: string, c: Clan) {
    setMsg(null)
    setNovoGeslo(null)   // geslo ne sme obviseti na zaslonu pri drugem članu
    setNovNaslov('')
    setNovTelefon(c.phone ?? '')
    setUrejam(prej => (prej === id ? null : id))
  }

  const vidni = clani.filter(c =>
    (!izbraniKlub || c.club_id === izbraniKlub) &&
    (!iskanje.trim() || (c.full_name ?? '').toLowerCase().includes(iskanje.trim().toLowerCase())))

  const brezPravega = vidni.filter(c => isGenericEmail(c.email)).length

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      </div>
    )
  }

  if (clani.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Moj klub</h1>
        <p className="text-gray-500">
          Nisi skrbnik nobenega kluba, ali pa klub še nima vpisanih članov.
          Skrbništvo dodeli administrator zveze.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Moj klub</h1>
      <p className="text-sm text-gray-500 mb-6">
        {vidni.length} članov
        {brezPravega > 0 && (
          <> · <span className="text-amber-700">{brezPravega} brez pravega e-naslova</span></>
        )}
      </p>

      <div className="mb-4 rounded-lg border border-bocce-green/30 bg-bocce-green/5 px-4 py-3 text-sm text-gray-700">
        <strong>Zakaj je to pomembno.</strong> Naslov, ki se konča na <code>@balinar.app</code>,
        je dodelila aplikacija in ne prejema pošte — član se z njim ne more prijaviti
        niti si ponastaviti gesla. Vpiši mu pravega in mu izroči začetno geslo;
        ob prvi prijavi si ga bo nastavil sam.
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        {(klubi.length > 1 || isAdmin) && (
          <select value={izbraniKlub} onChange={e => setIzbraniKlub(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
            <option value="">– vsi klubi –</option>
            {klubi.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        )}
        <input type="search" value={iskanje} onChange={e => setIskanje(e.target.value)}
          placeholder="Išči po imenu..."
          className="flex-1 min-w-[12rem] max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-bocce-green text-white text-xs uppercase tracking-wide">
              <th className="px-2 py-3 w-10"><span className="sr-only">Fotografija</span></th>
              <th className="px-4 py-3 text-left">Ime</th>
              <th className="px-4 py-3 text-left hidden sm:table-cell">E-naslov</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">Vloga</th>
              <th className="px-2 py-3 w-16"><span className="sr-only">Uredi</span></th>
            </tr>
          </thead>
          <tbody>
            {vidni.map((c, i) => (
              <Fragment key={c.id}>
                <tr className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                  <td className="px-2 py-2">
                    {c.photo_url ? (
                      <img src={c.photo_url} alt="" className="w-8 h-8 rounded-full object-cover border border-gray-200" />
                    ) : (
                      <span className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300 text-sm">👤</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{c.full_name}</div>
                    {c.birth_year && <div className="text-xs text-gray-400">r. {c.birth_year}</div>}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={isGenericEmail(c.email) ? 'text-amber-700' : 'text-gray-500'}>
                      {c.email ?? '—'}
                    </span>
                    {isGenericEmail(c.email) && (
                      <span className="block text-xs text-amber-600">ne prejema pošte</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[c.role]}`}>
                      {ROLE_LABELS[c.role]}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <button onClick={() => preklopi(c.id, c)}
                      className="text-xs text-bocce-green hover:underline whitespace-nowrap">
                      {urejam === c.id ? 'Zapri' : 'Uredi'}
                    </button>
                  </td>
                </tr>

                {urejam === c.id && (
                  <tr className="border-b border-gray-200 bg-bocce-green/5">
                    <td colSpan={5} className="px-4 py-4">
                      <div className="grid sm:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Prijavni e-naslov</label>
                          <div className="flex gap-2">
                            <input type="email" value={novNaslov} onChange={e => setNovNaslov(e.target.value)}
                              disabled={busy} placeholder={c.email ?? 'ime@email.com'}
                              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none disabled:opacity-50" />
                            <button onClick={() => shraniNaslov(c)} disabled={busy || !novNaslov.trim()}
                              className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                              Shrani
                            </button>
                          </div>

                          <label className="block text-xs text-gray-600 mt-4 mb-1">Telefon</label>
                          <div className="flex gap-2">
                            <input type="tel" value={novTelefon} onChange={e => setNovTelefon(e.target.value)}
                              disabled={busy} placeholder="041 123 456"
                              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none disabled:opacity-50" />
                            <button onClick={() => shraniTelefon(c)} disabled={busy}
                              className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                              Shrani
                            </button>
                          </div>

                          <label className="block text-xs text-gray-600 mt-4 mb-1">Geslo</label>
                          <button onClick={() => ponastaviGeslo(c)} disabled={busy}
                            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                            Ponastavi geslo
                          </button>
                          <p className="mt-1 text-xs text-gray-500">
                            Sedanjega gesla ne vidi nihče. Novo se prikaže enkrat,
                            član pa ga ob prvi prijavi zamenja.
                          </p>
                        </div>

                        <div>
                          <ImageUpload
                            bucket="media"
                            path={`users/photos/${c.id}`}
                            currentUrl={c.photo_url}
                            onUpload={url => shraniFotografijo(c, url)}
                            label="Fotografija"
                            shape="round"
                          />
                          {c.photo_url && (
                            <button onClick={() => shraniFotografijo(c, null)} disabled={busy}
                              className="mt-2 text-xs text-red-500 hover:text-red-700 disabled:opacity-50">
                              Odstrani fotografijo
                            </button>
                          )}
                        </div>
                      </div>

                      {novoGeslo && (
                        <div className="mt-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3">
                          <p className="text-xs text-green-800 mb-1">
                            Novo geslo za <strong>{c.full_name}</strong> — prikazano samo zdaj:
                          </p>
                          <div className="flex items-center gap-3 flex-wrap">
                            <code className="font-mono text-lg tracking-wide text-gray-900 select-all">{novoGeslo}</code>
                            <button onClick={() => navigator.clipboard?.writeText(novoGeslo)}
                              className="text-xs text-bocce-green hover:underline">kopiraj</button>
                          </div>
                          <p className="text-xs text-green-800 mt-1">
                            Staro geslo je neveljavno. Ob prvi prijavi ga bo moral zamenjati.
                          </p>
                        </div>
                      )}

                      <p className="mt-4 text-xs text-gray-500">
                        Vloge, EMŠO, datuma rojstva, licence in članstva v klubu s tega
                        zaslona ni mogoče spreminjati — za to se obrni na zvezo.
                      </p>

                      {msg && (
                        <p className={`mt-3 text-sm ${msg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{msg}</p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {vidni.length === 0 && (
          <div className="text-center py-8 text-gray-400 italic">Ni zadetkov</div>
        )}
      </div>
    </div>
  )
}
