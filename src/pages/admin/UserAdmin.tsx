import { Fragment, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { UserProfile, UserRole } from '../../types'
import { ROLE_LABELS, ROLE_COLORS, ROLE_ORDER } from '../../lib/roles'
import ImageUpload from '../../components/ImageUpload'
import { isGenericEmail } from '../../lib/genericEmail'

/** Stolpcev v tabeli — za colSpan razširjene vrstice. */
const STOLPCEV = 7

export default function UserAdmin() {
  const { isAdmin, isSuperAdmin } = useAuth()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [klubi, setKlubi] = useState<{ id: string; name: string }[]>([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState('')
  /** Kateri uporabnik ima odprto urejanje (klub + fotografija). */
  const [urejam, setUrejam] = useState<string | null>(null)
  const [vrsticaBusy, setVrsticaBusy] = useState(false)
  const [vrsticaMsg, setVrsticaMsg] = useState<string | null>(null)
  /** Enkrat prikazano geslo po ponastavitvi. Nikjer se ne shrani. */
  const [novoGeslo, setNovoGeslo] = useState<string | null>(null)
  const [novNaslov, setNovNaslov] = useState('')

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!isAdmin) return
    supabase.from('clubs').select('id, name').order('name').then(({ data }) => setKlubi(data ?? []))
  }, [isAdmin])

  async function load() {
    // Ta stran prikazuje in išče po e-pošti, torej po občutljivem stolpcu.
    // users_sensitive adminu vrne vse vrstice, navadnemu uporabniku pa samo
    // njegovo — meja je v pogledu, ne v tej komponenti.
    //
    // PostgREST vrne največ 1000 vrstic na poizvedbo — beremo po straneh, da
    // dobimo VSE uporabnike (sicer se seznam odreže ~pri črki S).
    const pageSize = 1000
    const all: UserProfile[] = []
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase.from('users_sensitive').select('*')
        .order('full_name').range(from, from + pageSize - 1)
      if (error) break
      all.push(...((data ?? []) as UserProfile[]))
      if (!data || data.length < pageSize) break
    }
    setUsers(all)
    setLoading(false)
  }

  async function updateRole(userId: string, role: UserRole) {
    setUpdating(userId)
    setError('')
    // Prek set_user_role, ne z update() na users: RLS dovoljuje pisanje samo
    // po lastni vrstici, zato je neposreden update tujega uporabnika ujel nič
    // vrstic in se TIHO ni zgodil. Funkcija vrne pravo napako.
    const { error: rpcError } = await supabase.rpc('set_user_role', {
      target_id: userId,
      new_role: role,
    })
    if (rpcError) setError(rpcError.message)
    await load()
    setUpdating(null)
  }

  async function zeton(): Promise<string | undefined> {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  }

  /**
   * Klub uporabnika. Ista pot kot pri odjavi članov ob uvozu in na profilu
   * igralca — pisanje po `users` je z RLS omejeno na lastno vrstico, zato gre
   * skozi strežniško funkcijo.
   */
  async function shraniKlub(u: UserProfile, izbrani: string) {
    const toClubId = izbrani || null
    const trenutni = u.club_id ?? null
    if (toClubId === trenutni) return
    const ime = klubi.find(k => k.id === toClubId)?.name
    const kdo = u.full_name ?? 'uporabnika'
    if (!window.confirm(
      toClubId
        ? `Vpisati ${kdo} v klub ${ime}?`
        : `Odvzeti klub uporabniku ${kdo}?\n\nZgodovine članstva baza ne vodi, zato se prejšnji klub izgubi. ` +
          'Rezultati in zapisniki ostanejo nedotaknjeni.'
    )) return
    setVrsticaBusy(true); setVrsticaMsg(null)
    try {
      const res = await fetch('/api/club-membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await zeton()}` },
        body: JSON.stringify({ playerIds: [u.id], toClubId, expectFromClubId: trenutni }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Sprememba ni uspela')
      if (json.changed === 0) throw new Error(json.skipped?.[0]?.reason ?? 'Sprememba ni bila izvedena')
      setUsers(us => us.map(x => (x.id === u.id ? { ...x, club_id: toClubId, club: ime ?? null } : x)))
      setVrsticaMsg(toClubId ? `✓ Vpisan v klub ${ime}` : '✓ Klub odvzet')
    } catch (e) {
      setVrsticaMsg(`❌ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setVrsticaBusy(false)
    }
  }

  /** Fotografija. Datoteka gre v Storage iz brskalnika, naslov pa prek strežnika. */
  async function shraniFotografijo(userId: string, photoUrl: string | null) {
    setVrsticaBusy(true); setVrsticaMsg(null)
    try {
      const res = await fetch('/api/user-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await zeton()}` },
        body: JSON.stringify({ userId, photoUrl }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Shranjevanje ni uspelo')
      setUsers(us => us.map(x => (x.id === userId ? { ...x, photo_url: photoUrl } : x)))
      setVrsticaMsg(photoUrl ? '✓ Fotografija shranjena' : '✓ Fotografija odstranjena')
    } catch (e) {
      setVrsticaMsg(`❌ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setVrsticaBusy(false)
    }
  }

  /**
   * Ponastavitev gesla. Strežnik ustvari naključno geslo, ga vrne ENKRAT in
   * uporabnika označi z must_change_password — tisto, ki ga vidi admin, velja
   * samo do prve prijave. Obstoječega gesla ni mogoče prebrati niti tu.
   */
  async function ponastaviGeslo(u: UserProfile) {
    if (!window.confirm(
      `Ponastaviti geslo za ${u.full_name}?\n\n` +
      'Staro geslo bo takoj neveljavno. Novo se prikaže enkrat — prepiši ga, preden zapreš vrstico.'
    )) return
    setVrsticaBusy(true); setVrsticaMsg(null); setNovoGeslo(null)
    try {
      const res = await fetch('/api/user-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await zeton()}` },
        body: JSON.stringify({ action: 'reset-password', userId: u.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Ponastavitev ni uspela')
      setNovoGeslo(json.password as string)
    } catch (e) {
      setVrsticaMsg(`❌ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setVrsticaBusy(false)
    }
  }

  /** Sprememba prijavnega naslova — pot za tiste, ki imajo pravi poštni predal. */
  async function shraniNaslov(u: UserProfile) {
    const naslov = novNaslov.trim().toLowerCase()
    if (!naslov || naslov === (u.email ?? '').toLowerCase()) return
    if (!window.confirm(`Prijavni naslov za ${u.full_name} spremeniti v ${naslov}?`)) return
    setVrsticaBusy(true); setVrsticaMsg(null)
    try {
      const res = await fetch('/api/user-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await zeton()}` },
        body: JSON.stringify({ action: 'set-email', userId: u.id, email: naslov }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Sprememba ni uspela')
      setUsers(us => us.map(x => (x.id === u.id ? { ...x, email: naslov } : x)))
      setNovNaslov('')
      setVrsticaMsg(`✓ Prijavni naslov je zdaj ${naslov}`)
    } catch (e) {
      setVrsticaMsg(`❌ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setVrsticaBusy(false)
    }
  }

  function preklopiUrejanje(userId: string) {
    setVrsticaMsg(null)
    setNovoGeslo(null)   // geslo ne sme obviseti na zaslonu pri drugem človeku
    setNovNaslov('')
    setUrejam(prej => (prej === userId ? null : userId))
  }

  const filtered = users.filter(u =>
    (roleFilter === 'all' || u.role === roleFilter) &&
    (
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      (u.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      u.club?.toLowerCase().includes(search.toLowerCase())
    )
  )
  const roleCount = (r: UserRole) => users.filter(u => u.role === r).length
  const brezKluba = users.filter(u => u.role === 'judge' && !u.club_id).length

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Upravljanje uporabnikov</h1>
      <p className="text-sm text-gray-500 mb-6">
        {users.length} registriranih uporabnikov
        {brezKluba > 0 && <> · {brezKluba} sodnikov brez kluba</>}
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Vloge ni bilo mogoče spremeniti: {error}
        </div>
      )}

      <div className="mb-4 space-y-3">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-md border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
          placeholder="Išči po imenu, emailu ali klubu..."
        />
        <div className="flex flex-wrap gap-2">
          {([['all', 'Vsi'], ['judge', `Sodniki (${roleCount('judge')})`], ['player', 'Igralci'], ['admin', 'Administratorji'], ['super_admin', 'Super admini']] as const).map(([r, label]) => (
            <button key={r} onClick={() => setRoleFilter(r as UserRole | 'all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${roleFilter === r ? 'bg-bocce-green text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-bocce-green text-white text-xs uppercase tracking-wide">
                <th className="px-2 py-3 w-10"><span className="sr-only">Fotografija</span></th>
                <th className="px-4 py-3 text-left">Ime</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">E-pošta</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Klub</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Licenca</th>
                <th className="px-4 py-3 text-left">Vloga</th>
                <th className="px-2 py-3 w-16"><span className="sr-only">Uredi</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <Fragment key={u.id}>
                  <tr className={`border-b border-gray-100 hover:bg-bocce-green/5 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="px-2 py-2">
                      {u.photo_url ? (
                        <img src={u.photo_url} alt="" className="w-8 h-8 rounded-full object-cover border border-gray-200" />
                      ) : (
                        <span className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300 text-sm">👤</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{u.full_name}</div>
                      <div className="text-xs text-gray-400 sm:hidden">{u.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{u.email}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{u.club ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs hidden md:table-cell">{u.license_number ?? '—'}</td>
                    <td className="px-4 py-3">
                      {isSuperAdmin ? (
                        <select
                          value={u.role}
                          disabled={updating === u.id}
                          onChange={e => updateRole(u.id, e.target.value as UserRole)}
                          className={`text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer ${ROLE_COLORS[u.role]}`}
                        >
                          {/* Možnosti iz ROLE_ORDER, da seznam ne more več zaostati
                              za tipom UserRole — 'judge' je prej manjkal, čeprav ga
                              set_user_role dovoli, zato izbirnik pri sodniku ni imel
                              ujemajoče možnosti. */}
                          {ROLE_ORDER.map(r => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role]}`}>
                          {ROLE_LABELS[u.role]}
                        </span>
                      )}
                      {updating === u.id && <span className="ml-2 text-xs text-gray-400">...</span>}
                    </td>
                    <td className="px-2 py-3 text-right">
                      {isAdmin && (
                        <button onClick={() => preklopiUrejanje(u.id)}
                          className="text-xs text-bocce-green hover:underline whitespace-nowrap">
                          {urejam === u.id ? 'Zapri' : 'Uredi'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {/* Klub in fotografija sta v razširjeni vrstici namesto v stolpcih:
                      seznam ima ~1400 vrstic, izbirnik s 139 klubi v vsaki bi pomenil
                      skoraj 200.000 elementov naenkrat. Odprta je vedno največ ena. */}
                  {urejam === u.id && (
                    <tr className="border-b border-gray-200 bg-bocce-green/5">
                      <td colSpan={STOLPCEV} className="px-4 py-4">
                        <div className="grid sm:grid-cols-2 gap-6">
                          <div>
                            <ImageUpload
                              bucket="media"
                              path={`users/photos/${u.id}`}
                              currentUrl={u.photo_url}
                              onUpload={url => shraniFotografijo(u.id, url)}
                              label="Fotografija"
                              shape="round"
                            />
                            {u.photo_url && (
                              <button onClick={() => shraniFotografijo(u.id, null)} disabled={vrsticaBusy}
                                className="mt-2 text-xs text-red-500 hover:text-red-700 disabled:opacity-50">
                                Odstrani fotografijo
                              </button>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Klub</label>
                            <select
                              value={u.club_id ?? ''}
                              disabled={vrsticaBusy}
                              onChange={e => shraniKlub(u, e.target.value)}
                              className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none disabled:opacity-50">
                              <option value="">– brez kluba –</option>
                              {klubi.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                            </select>
                            <p className="mt-2 text-xs text-gray-500">
                              Sodnik ni nujno član kluba. Klub tu vpiši, kadar je oseba v bazi
                              nastala kot sodnik in bi morala biti tudi član — npr. da se pri
                              uvozu igralcev ne podvoji.
                            </p>
                          </div>
                        </div>
                        {/* Prijava — pot nazaj za tistega, ki je pozabil geslo. */}
                        <div className="mt-6 pt-4 border-t border-bocce-green/20">
                          <h3 className="text-sm font-medium text-gray-700 mb-2">Prijava</h3>
                          <div className="grid sm:grid-cols-2 gap-6">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Prijavni e-naslov</label>
                              <div className="flex gap-2">
                                <input type="email" value={novNaslov} onChange={e => setNovNaslov(e.target.value)}
                                  disabled={vrsticaBusy}
                                  placeholder={u.email ?? 'ime@email.com'}
                                  className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none disabled:opacity-50" />
                                <button onClick={() => shraniNaslov(u)} disabled={vrsticaBusy || !novNaslov.trim()}
                                  className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                  Shrani
                                </button>
                              </div>
                              {isGenericEmail(u.email) && (
                                <p className="mt-1 text-xs text-amber-700">
                                  Sedanji naslov je dodelila aplikacija ob uvozu in ne more prejeti pošte —
                                  ponastavitev gesla po e-pošti pri njem ne deluje.
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Geslo</label>
                              <button onClick={() => ponastaviGeslo(u)} disabled={vrsticaBusy}
                                className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                Ponastavi geslo
                              </button>
                              <p className="mt-1 text-xs text-gray-500">
                                Sedanjega gesla ne vidi nihče — v bazi je le zgoščena vrednost.
                                Novo se prikaže enkrat, uporabnik pa ga ob prvi prijavi zamenja.
                              </p>
                            </div>
                          </div>

                          {novoGeslo && (
                            <div className="mt-3 rounded-lg border border-green-300 bg-green-50 px-4 py-3">
                              <p className="text-xs text-green-800 mb-1">
                                Novo geslo za <strong>{u.full_name}</strong> — prikazano samo zdaj:
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
                        </div>

                        {vrsticaMsg && (
                          <p className={`mt-3 text-sm ${vrsticaMsg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{vrsticaMsg}</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-8 text-gray-400 italic">Ni zadetkov</div>
          )}
        </div>
      )}
    </div>
  )
}
