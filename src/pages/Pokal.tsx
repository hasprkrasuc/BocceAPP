import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import KlubskiGrb from '../components/KlubskiGrb'
import {
  pokalniPajek, POKAL_VELIKOST, pokalniDomacin, rangLige, RANG_NEZNAN,
  type PokalEkipa, type PokalIzid,
} from '../engines/pokal'
import type { MatchStage } from '../types'

/**
 * POKAL BZS — izločilno tekmovanje klubskih ekip.
 *
 * Pajek se ne bere iz baze, ampak izračuna: `league_teams.draw_number` je
 * žrebana številka in hkrati mesto v pajku, `league_fixtures` pa povedo, kdo
 * je katero tekmo dobil. Glej `src/engines/pokal.ts`.
 */

const KROGI: Array<{ stage: MatchStage; naslov: string }> = [
  { stage: 'r64', naslov: '1. krog' },
  { stage: 'r32', naslov: '2. krog' },
  { stage: 'r16', naslov: 'Osmina finala' },
  { stage: 'qf', naslov: 'Četrtfinale' },
  { stage: 'sf', naslov: 'Polfinale' },
  { stage: 'final', naslov: 'Finale' },
]

interface Ekipa {
  id: string
  club_name: string
  draw_number: number | null
  club_id: string | null
  club: { logo_url: string | null } | null
}

interface Tekma {
  id: string
  round_number: number
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
  status: string
  scheduled_date: string | null
}

export default function Pokal() {
  const { isAdmin } = useAuth()
  const [sezona, setSezona] = useState<{ id: string; name: string; status: string } | null>(null)
  const [ekipe, setEkipe] = useState<Ekipa[]>([])
  const [tekme, setTekme] = useState<Tekma[]>([])
  /** Rang kluba (club_id → 1..4) iz članskih lig tekoče sezone. */
  const [rangKluba, setRangKluba] = useState<Map<string, number>>(new Map())
  const [nalagam, setNalagam] = useState(true)
  const [napaka, setNapaka] = useState('')
  const [delam, setDelam] = useState('')

  useEffect(() => { nalozi() }, [])

  async function nalozi() {
    setNalagam(true); setNapaka('')
    try {
      const { data: s, error: sErr } = await supabase
        .from('league_seasons').select('id, name, status')
        .eq('format', 'pokal').order('year', { ascending: false }).limit(1).maybeSingle()
      if (sErr) throw sErr
      if (!s) { setSezona(null); return }
      setSezona(s)

      const [{ data: e, error: eErr }, { data: t, error: tErr }, { data: cl, error: clErr }] = await Promise.all([
        supabase.from('league_teams')
          .select('id, club_name, draw_number, club_id, club:clubs(logo_url)')
          .eq('season_id', s.id).order('draw_number'),
        supabase.from('league_fixtures')
          .select('id, round_number, home_team_id, away_team_id, home_score, away_score, status, scheduled_date')
          .eq('season_id', s.id).order('round_number'),
        // Vsa članstva klubov v nezaključenih sezonah — iz njih se izpelje rang
        // (Super liga 1 … OBZ 4) za pravilo, da je nižje rangirani domačin.
        supabase.from('league_teams')
          .select('club_id, season:league_seasons(tier, category, status, format)')
          .not('club_id', 'is', null),
      ])
      // Napake ne požiramo: prazen pajek je videti kot "tekmovanja ni".
      if (eErr) throw eErr
      if (tErr) throw tErr
      if (clErr) throw clErr
      setEkipe((e ?? []) as unknown as Ekipa[])
      setTekme((t ?? []) as Tekma[])

      const rang = new Map<string, number>()
      for (const row of (cl ?? []) as unknown as Array<{ club_id: string; season: { tier: string | null; category: string | null; status: string; format: string | null } | null }>) {
        const sez = row.season
        if (!sez || sez.status === 'completed' || sez.format === 'pokal') continue
        const r = rangLige(sez.tier, sez.category)
        if (r === null) continue
        // Klub z več ekipami šteje po svoji najvišji ligi.
        const obstojeci = rang.get(row.club_id)
        if (obstojeci === undefined || r < obstojeci) rang.set(row.club_id, r)
      }
      setRangKluba(rang)
    } catch (err) {
      setNapaka(err instanceof Error ? err.message : String(err))
    } finally {
      setNalagam(false)
    }
  }

  const poId = new Map(ekipe.map(e => [e.id, e]))

  const vhod: PokalEkipa[] = ekipe
    .filter(e => e.draw_number !== null)
    .map(e => ({ teamId: e.id, drawNumber: e.draw_number! }))

  const izidi: PokalIzid[] = tekme.map(t => ({
    homeTeamId: t.home_team_id,
    awayTeamId: t.away_team_id,
    // Pokal neodločenega ne pozna — dokler ni izida, ne napreduje nihče.
    winnerTeamId: t.status !== 'completed' || t.home_score === null || t.away_score === null
      ? null
      : t.home_score > t.away_score ? t.home_team_id
        : t.away_score > t.home_score ? t.away_team_id : null,
  }))

  let pajek: ReturnType<typeof pokalniPajek> = []
  let napakaPajka = ''
  try {
    if (vhod.length) pajek = pokalniPajek(vhod, izidi, POKAL_VELIKOST)
  } catch (err) {
    napakaPajka = err instanceof Error ? err.message : String(err)
  }

  /** Odigrana ali razporejena tekma med tema ekipama, če obstaja. */
  function najdiTekmo(a: string | null, b: string | null): Tekma | undefined {
    if (!a || !b) return undefined
    return tekme.find(t =>
      (t.home_team_id === a && t.away_team_id === b) ||
      (t.home_team_id === b && t.away_team_id === a))
  }

  /** Rang pokalne ekipe (prek njenega kluba); brez lige šteje kot najnižji. */
  function rangEkipe(teamId: string): number {
    const clubId = poId.get(teamId)?.club_id
    return (clubId && rangKluba.get(clubId)) || RANG_NEZNAN
  }

  async function ustvariZapisnik(krog: number, a: string, b: string) {
    if (!sezona) return
    setDelam(`${a}|${b}`)
    // Pravilo BZS: nižje rangirana ekipa (nižja liga) je vedno domačin.
    const rang = new Map([[a, rangEkipe(a)], [b, rangEkipe(b)]])
    const [home, away] = pokalniDomacin(a, b, rang)
    const { error } = await supabase.from('league_fixtures').insert({
      season_id: sezona.id, round_number: krog,
      home_team_id: home, away_team_id: away,
    })
    if (error) setNapaka(`Zapisnika ni bilo mogoče ustvariti: ${error.message}`)
    else await nalozi()
    setDelam('')
  }

  /**
   * Ročna zamenjava domačina — za pare iz istega ranga, kjer pravilo pravi
   * »nižje uvrščeni iz lanske sezone«, tega pa baza ne pozna. Ne dovolimo je,
   * ko ima tekma izid ali zapisnik: strani zapisnika bi se obrnili.
   */
  async function zamenjajDomacina(t: Tekma) {
    if (t.status === 'completed' || t.home_score !== null || t.away_score !== null) {
      setNapaka('Tekma ima izid — domačina ni več mogoče zamenjati.'); return
    }
    const { count } = await supabase.from('league_match_results')
      .select('id', { count: 'exact', head: true }).eq('fixture_id', t.id)
    if ((count ?? 0) > 0) {
      setNapaka('Tekma ima zapisnik — najprej ga izbriši, sicer bi se strani obrnile.'); return
    }
    const doma = poId.get(t.home_team_id)?.club_name ?? 'domači'
    const gost = poId.get(t.away_team_id)?.club_name ?? 'gost'
    if (!window.confirm(`Odslej igra doma ${gost} (namesto ${doma}). Zamenjam?`)) return
    setDelam(t.id)
    const { error } = await supabase.from('league_fixtures')
      .update({ home_team_id: t.away_team_id, away_team_id: t.home_team_id })
      .eq('id', t.id)
    if (error) setNapaka(`Zamenjava ni uspela: ${error.message}`)
    else await nalozi()
    setDelam('')
  }

  if (nalagam) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-bocce-green" />
      </div>
    )
  }

  if (!sezona) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Pokal BZS</h1>
        <p className="text-gray-400">Pokalno tekmovanje še ni odprto.</p>
      </div>
    )
  }

  const prosti = pajek.filter(m => m.stage === 'r64' && m.isBye)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h1 className="text-2xl font-bold text-gray-800">Pokal BZS</h1>
        <span className="text-sm text-gray-500">{sezona.name}</span>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        {ekipe.length} prijavljenih ekip · izločilni sistem s {POKAL_VELIKOST} mesti ·{' '}
        {prosti.length} prostih mest v 1. krogu ·{' '}
        <span title="Pri enakem rangu odloči lanska uvrstitev — domačina po potrebi zamenja admin (⇄).">
          nižje rangirana ekipa je domačin (D)
        </span>
      </p>

      {napaka && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-6">
          ⚠ {napaka}
        </div>
      )}
      {napakaPajka && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-6">
          ⚠ Pajka ni bilo mogoče sestaviti: {napakaPajka}
        </div>
      )}

      <div className="space-y-8">
        {KROGI.map(({ stage, naslov }) => {
          const tekmeKroga = pajek.filter(m => m.stage === stage && !m.isBye)
          if (!tekmeKroga.length) return null
          const krogIndex = KROGI.findIndex(k => k.stage === stage) + 1
          const znane = tekmeKroga.filter(m => m.teamA && m.teamB)
          if (!znane.length) return null

          return (
            <section key={stage}>
              <h2 className="text-lg font-bold text-gray-800 mb-3">
                {naslov} <span className="text-sm font-normal text-gray-400">· {znane.length} tekem</span>
              </h2>
              <div className="grid md:grid-cols-2 gap-3">
                {znane.map(m => {
                  const a = poId.get(m.teamA!)
                  const b = poId.get(m.teamB!)
                  const tekma = najdiTekmo(m.teamA, m.teamB)
                  const kljuc = `${m.teamA}|${m.teamB}`
                  return (
                    <div key={`${stage}-${m.matchNumber}`}
                      className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex-1 min-w-0 space-y-1.5">
                          {[a, b].map((e, i) => {
                            const zmagal = m.winner === (i === 0 ? m.teamA : m.teamB)
                            const izid = tekma
                              ? (tekma.home_team_id === e?.id ? tekma.home_score : tekma.away_score)
                              : null
                            const jeDomacin = tekma?.home_team_id === e?.id
                            return (
                              <div key={e?.id ?? i} className="flex items-center gap-2">
                                <KlubskiGrb ime={e?.club_name} logoUrl={e?.club?.logo_url} velikost="sm" />
                                <span className={`flex-1 text-sm truncate ${zmagal ? 'font-semibold text-bocce-green' : 'text-gray-700'}`}>
                                  {e?.club_name ?? '—'}
                                  {jeDomacin && (
                                    <span title="Domačin — nižje rangirana ekipa gosti"
                                      className="ml-1.5 text-[10px] font-semibold text-bocce-green bg-bocce-green/10 px-1 py-0.5 rounded align-middle">D</span>
                                  )}
                                </span>
                                <span className="text-[11px] font-mono text-gray-400 shrink-0">
                                  #{e?.draw_number}
                                </span>
                                {izid !== null && (
                                  <span className="text-sm font-mono font-semibold text-gray-700 w-6 text-right shrink-0">
                                    {izid}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          {tekma ? (
                            <>
                              {isAdmin && tekma.status !== 'completed' && (
                                <button onClick={() => zamenjajDomacina(tekma)}
                                  disabled={delam === tekma.id}
                                  title="Zamenjaj domačina (za para iz istega ranga)"
                                  className="text-xs border border-gray-300 text-gray-500 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                                  ⇄
                                </button>
                              )}
                              <Link to={`/liga/tekma/${tekma.id}`}
                                className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                                {tekma.status === 'completed' ? 'Zapisnik' : 'Uredi zapisnik'}
                              </Link>
                            </>
                          ) : isAdmin ? (
                            <button
                              onClick={() => ustvariZapisnik(krogIndex, m.teamA!, m.teamB!)}
                              disabled={delam === kljuc}
                              className="text-xs bg-bocce-green text-white px-3 py-1.5 rounded-lg hover:bg-bocce-green-light transition-colors disabled:opacity-50">
                              {delam === kljuc ? '…' : '+ Zapisnik'}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">ni razporejena</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {prosti.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-gray-800 mb-1">Prosti v 1. krogu</h2>
          <p className="text-sm text-gray-500 mb-3">
            Ekipe brez nasprotnika napredujejo v 2. krog brez tekme.
          </p>
          <div className="flex flex-wrap gap-2">
            {prosti.map(m => {
              const e = poId.get(m.teamA!)
              return (
                <span key={m.matchNumber}
                  className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full pl-1.5 pr-3 py-1">
                  <KlubskiGrb ime={e?.club_name} logoUrl={e?.club?.logo_url} velikost="sm" />
                  <span className="text-sm text-gray-700">{e?.club_name ?? '—'}</span>
                  <span className="text-[11px] font-mono text-gray-400">#{e?.draw_number}</span>
                </span>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
