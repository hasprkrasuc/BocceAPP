/**
 * ŽREB V ŽIVO — javna izvedba žreba skupin z jakostnimi bobni.
 *
 * Stran je namenjena projekciji pred občinstvom. Pari pridejo na vrsto po
 * bobnih (napolnjenih po rang lestvici — načrt pripravi engines/zivZreb.ts),
 * vsakemu pa se v dveh korakih izžreba NAJPREJ SKUPINA in nato MESTO v njej
 * (mesto določa razpored tekem v skupini). Ko so vsi pari razdeljeni, se
 * skupine shranijo v ISTI obliki kot pri takojšnjem žrebu v administraciji
 * (tournament_groups + group_teams + tekme iz GROUP_TEMPLATES), zato naprej
 * vse deluje enako.
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../supabase'
import { GROUP_TEMPLATES, teamDisplayName, suggestGroupDistribution } from '../../engines/tournament'
import {
  nacrtZivegaZreba, prosteSkupine, prostaMesta, type ZrebDodelitev,
} from '../../engines/zivZreb'
import { computeRangLestvica, type RangCategory } from '../../lib/rangLestvica'
import { PRIJAVA_SELECT } from '../../lib/tournamentPlayers'
import type { Tournament, TournamentRegistration } from '../../types'

function toRangCat(cat: string): RangCategory | null {
  return cat === 'men' || cat === 'women' || cat === 'u18' ? cat : null
}

const crkaSkupine = (i: number) => String.fromCharCode(65 + i)
const nakljucni = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]

export default function ZivZreb() {
  const { id } = useParams<{ id: string }>()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [prijave, setPrijave] = useState<TournamentRegistration[]>([])
  const [rangByPlayer, setRangByPlayer] = useState<Record<string, number> | null>(null)
  const [obstojeceSkupine, setObstojeceSkupine] = useState(0)
  const [nalagam, setNalagam] = useState(true)
  const [napaka, setNapaka] = useState('')
  const [sporocilo, setSporocilo] = useState('')

  /** Opravljene dodelitve v vrstnem redu žreba. */
  const [dodelitve, setDodelitve] = useState<ZrebDodelitev[]>([])
  /** Vmesno stanje: paru je skupina že izžrebana, mesto še ne. */
  const [vTeku, setVTeku] = useState<{ id: string; boben: number; skupina: number } | null>(null)
  const [shranjujem, setShranjujem] = useState(false)
  const [shranjeno, setShranjeno] = useState(false)

  useEffect(() => { nalozi() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function nalozi() {
    setNalagam(true)
    try {
      const [{ data: t, error: tErr }, { data: r, error: rErr }, { count }] = await Promise.all([
        supabase.from('tournaments').select('*').eq('id', id).single(),
        supabase.from('tournament_registrations')
          .select(PRIJAVA_SELECT)
          .eq('tournament_id', id).eq('status', 'confirmed').order('registered_at'),
        supabase.from('tournament_groups')
          .select('id', { count: 'exact', head: true }).eq('tournament_id', id),
      ])
      if (tErr) throw tErr
      if (rErr) throw rErr
      setTournament(t as Tournament)
      setPrijave((r ?? []) as unknown as TournamentRegistration[])
      setObstojeceSkupine(count ?? 0)

      const rang = await computeRangLestvica()
      const cat = t ? toRangCat((t as Tournament).category) : null
      const rp: Record<string, number> = {}
      if (cat) for (const row of rang.byCategory[cat]) rp[row.playerId] = row.rang
      setRangByPlayer(rp)
    } catch (err) {
      setNapaka(err instanceof Error ? err.message : String(err))
    } finally {
      setNalagam(false)
    }
  }

  /** Nosilna vrednost para: ročni seed_points, sicer vsota rang točk igralcev. */
  function nosilnaVrednost(r: TournamentRegistration): number {
    if (r.seed_points != null) return r.seed_points
    const rp = rangByPlayer ?? {}
    return (r.player1_id ? rp[r.player1_id] ?? 0 : 0) + (r.player2_id ? rp[r.player2_id] ?? 0 : 0)
  }

  const poId = useMemo(() => new Map(prijave.map(r => [r.id, r])), [prijave])
  const dist = useMemo(() => suggestGroupDistribution(prijave.length), [prijave.length])
  const groupSizes = useMemo(() => [
    ...Array(dist.groups5).fill(5), ...Array(dist.groups4).fill(4), ...Array(dist.groups3).fill(3),
  ] as number[], [dist])

  const nacrt = useMemo(() => {
    if (!rangByPlayer || prijave.length === 0 || !dist.isValid) return null
    try {
      return nacrtZivegaZreba(
        prijave.map(r => ({ id: r.id, seed: nosilnaVrednost(r) })),
        groupSizes,
      )
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prijave, rangByPlayer, groupSizes, dist.isValid])

  const konec = nacrt !== null && dodelitve.length >= nacrt.vrstniRed.length && !vTeku
  /** Par, ki je trenutno na vrsti (že z izžrebano skupino ali še brez nje). */
  const naVrsti = vTeku
    ? vTeku.id
    : (nacrt && dodelitve.length < nacrt.vrstniRed.length ? nacrt.vrstniRed[dodelitve.length] : null)
  const bobenNaVrsti = naVrsti && nacrt ? nacrt.bobenPara.get(naVrsti)! : null
  const zadnja = dodelitve.at(-1) ?? null

  function izzrebajSkupino() {
    if (!nacrt || !naVrsti || vTeku || bobenNaVrsti === null) return
    const kandidatke = prosteSkupine(nacrt, bobenNaVrsti, dodelitve)
    if (kandidatke.length === 0) return
    setVTeku({ id: naVrsti, boben: bobenNaVrsti, skupina: nakljucni(kandidatke) })
  }

  function izzrebajMesto() {
    if (!vTeku) return
    const prosta = prostaMesta(groupSizes, vTeku.skupina, dodelitve)
    if (prosta.length === 0) return
    setDodelitve(prev => [...prev, { ...vTeku, sedez: nakljucni(prosta) }])
    setVTeku(null)
  }

  function izzrebajVse() {
    if (!nacrt) return
    const nove = [...dodelitve]
    let tekoci = vTeku
    while (nove.length < nacrt.vrstniRed.length || tekoci) {
      if (tekoci) {
        nove.push({ ...tekoci, sedez: nakljucni(prostaMesta(groupSizes, tekoci.skupina, nove)) })
        tekoci = null
      } else {
        const parId = nacrt.vrstniRed[nove.length]
        const boben = nacrt.bobenPara.get(parId)!
        tekoci = { id: parId, boben, skupina: nakljucni(prosteSkupine(nacrt, boben, nove)) }
      }
    }
    setDodelitve(nove)
    setVTeku(null)
  }

  function ponastavi() {
    if ((dodelitve.length > 0 || vTeku) &&
        !window.confirm('Ponastavim žreb? Izžrebani pari se vrnejo v bobne.')) return
    setDodelitve([])
    setVTeku(null)
    setSporocilo('')
    setShranjeno(false)
  }

  /** Shrani skupine v isti obliki kot žreb v administraciji turnirja. */
  async function shrani() {
    if (!nacrt || !konec || !id) return
    if (obstojeceSkupine > 0 &&
        !window.confirm('Turnir že ima izžrebane skupine. Shranjevanje jih izbriše in nadomesti s tem žrebom. Nadaljujem?')) return
    setShranjujem(true)
    setSporocilo('')
    try {
      const dodelitveVSkupini = (gi: number) =>
        dodelitve.filter(d => d.skupina === gi).slice().sort((a, b) => a.sedez - b.sedez)
      const razdelitev = groupSizes.map((size, gi) => ({
        size: size as 3 | 4 | 5,
        teams: dodelitveVSkupini(gi).map(d => poId.get(d.id)!),
      }))

      await supabase.from('tournament_groups').delete().eq('tournament_id', id)

      const { data: skupine, error: gErr } = await supabase
        .from('tournament_groups')
        .insert(razdelitev.map((a, g) => ({
          tournament_id: id, group_number: g + 1, status: 'pending', group_size: a.size,
        })))
        .select()
      if (gErr) throw gErr

      const { data: vpisane, error: tErr } = await supabase
        .from('group_teams')
        .insert(skupine.flatMap((group, g) =>
          razdelitev[g].teams.map((reg, s) => ({ group_id: group.id, registration_id: reg.id, seed: s + 1 }))))
        .select('id, group_id, seed')
      if (tErr) throw tErr

      type Vpisana = { id: string; group_id: string; seed: number }
      const poSkupini: Record<string, Record<number, Vpisana>> = {}
      for (const v of vpisane as Vpisana[]) {
        if (!poSkupini[v.group_id]) poSkupini[v.group_id] = {}
        poSkupini[v.group_id][v.seed - 1] = v
      }

      const tekme = skupine.flatMap((group, g) => {
        const template = GROUP_TEMPLATES[razdelitev[g].size]
        const teamBySeed = poSkupini[group.id] ?? {}
        return template.map(tpl => {
          const resolve = (dep: typeof tpl.teamA): Vpisana | null =>
            dep === 'BYE' || !('seed' in dep) ? null : (teamBySeed[dep.seed] ?? null)
          const teamA = resolve(tpl.teamA)
          const teamB = resolve(tpl.teamB)
          const isBye = tpl.teamB === 'BYE'
          return {
            tournament_id: id, group_id: group.id, stage: 'group',
            match_type: isBye ? 'bye' : tpl.type, match_number: tpl.num,
            team_a_id: teamA?.id ?? null, team_b_id: teamB?.id ?? null,
            score_a: isBye ? 6 : null, score_b: isBye ? 0 : null,
            winner_id: isBye && teamA ? teamA.id : null,
            is_bye: isBye, status: isBye ? 'completed' : 'pending',
          }
        })
      })
      const { error: mErr } = await supabase.from('matches').insert(tekme)
      if (mErr) throw mErr

      setShranjeno(true)
      setObstojeceSkupine(skupine.length)
      setSporocilo(`✓ Žreb shranjen: ${skupine.length} skupin`)
    } catch (err) {
      setSporocilo('❌ Napaka pri shranjevanju: ' + (err instanceof Error ? err.message : String(err)))
    }
    setShranjujem(false)
  }

  if (nalagam) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-bocce-green" />
      </div>
    )
  }
  if (napaka || !tournament) {
    return <div className="max-w-3xl mx-auto px-4 py-10 text-red-600">Napaka: {napaka || 'turnir ne obstaja'}</div>
  }

  const razpored = [
    dist.groups5 > 0 ? `${dist.groups5}×5` : '',
    dist.groups4 > 0 ? `${dist.groups4}×4` : '',
    dist.groups3 > 0 ? `${dist.groups3}×3` : '',
  ].filter(Boolean).join(' + ')
  const brezRanga = nacrt ? prijave.filter(r => nosilnaVrednost(r) === 0).length : 0
  const parNaVrsti = naVrsti ? poId.get(naVrsti) : null

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-gray-800">Žreb v živo — {tournament.name}</h1>
        <Link to={`/admin/turnir/${id}`} className="text-sm text-bocce-green hover:underline">
          ← Nazaj na turnir
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        {prijave.length} parov · {dist.totalGroups} skupin ({razpored}) · jakostni bobni po rang lestvici
        {nacrt && <> ({nacrt.bobni.map(b => b.length).join(' / ')})</>}
      </p>

      {obstojeceSkupine > 0 && !shranjeno && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-800 mb-4">
          ⚠️ Turnir že ima izžrebane skupine — shranjevanje tega žreba jih nadomesti.
        </div>
      )}
      {brezRanga > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-700 mb-4">
          {brezRanga} parov je brez rang točk — ti so na dnu zadnjega bobna. Ročne nosilne
          vrednosti (tuji/neuvrščeni igralci) nastaviš v administraciji turnirja, zavihek Izločilni žreb.
        </div>
      )}
      {sporocilo && (
        <div className={`border rounded-xl px-4 py-2.5 text-sm mb-4 ${sporocilo.startsWith('✓')
          ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {sporocilo}
        </div>
      )}

      {!nacrt ? (
        <div className="text-gray-400 italic py-10 text-center">
          {!dist.isValid
            ? `${prijave.length} parov ne sede v ${dist.totalGroups} skupin (3–5 na skupino).`
            : 'Pripravljam bobne …'}
        </div>
      ) : (
        <>
          {/* Ukazi */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            {!konec && !vTeku && (
              <button onClick={izzrebajSkupino} disabled={!naVrsti}
                className="bg-bocce-green text-white px-6 py-3 rounded-xl text-lg font-semibold hover:bg-bocce-green-light transition-colors disabled:opacity-40">
                🎱 Izžrebaj skupino
              </button>
            )}
            {vTeku && (
              <button onClick={izzrebajMesto}
                className="bg-bocce-green text-white px-6 py-3 rounded-xl text-lg font-semibold hover:bg-bocce-green-light transition-colors">
                🎯 Izžrebaj mesto v skupini {crkaSkupine(vTeku.skupina)}
              </button>
            )}
            <button onClick={izzrebajVse} disabled={konec}
              className="border border-gray-300 text-gray-600 px-4 py-3 rounded-xl text-sm hover:bg-gray-50 transition-colors disabled:opacity-40">
              Izžrebaj vse
            </button>
            <button onClick={ponastavi} disabled={dodelitve.length === 0 && !vTeku}
              className="border border-gray-300 text-gray-600 px-4 py-3 rounded-xl text-sm hover:bg-gray-50 transition-colors disabled:opacity-40">
              ↺ Ponastavi
            </button>
            {konec && !shranjeno && (
              <button onClick={shrani} disabled={shranjujem}
                className="bg-bocce-gold text-white px-6 py-3 rounded-xl text-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
                {shranjujem ? 'Shranjujem …' : '💾 Shrani žreb'}
              </button>
            )}
            {shranjeno && (
              <Link to={`/admin/turnir/${id}`}
                className="bg-bocce-green/10 text-bocce-green px-6 py-3 rounded-xl text-lg font-semibold hover:bg-bocce-green/20 transition-colors">
                ✓ Shranjeno — na turnir
              </Link>
            )}
            <span className="ml-auto text-sm text-gray-400">
              {dodelitve.length} / {nacrt.vrstniRed.length}
            </span>
          </div>

          {/* Veliki izpis za projekcijo: kdo je na vrsti / kaj je bilo izžrebano */}
          {parNaVrsti && (
            <div className="bg-bocce-green text-white rounded-2xl px-6 py-4 mb-6 text-center shadow">
              <p className="text-sm opacity-80 mb-1">
                Na vrsti (boben {(bobenNaVrsti ?? 0) + 1})
                {vTeku && <> — skupina <span className="font-bold text-base">{crkaSkupine(vTeku.skupina)}</span>, žrebamo mesto …</>}
              </p>
              <p className="text-2xl sm:text-3xl font-bold">{teamDisplayName(parNaVrsti, true)}</p>
            </div>
          )}
          {!parNaVrsti && zadnja && (
            <div className="bg-bocce-green text-white rounded-2xl px-6 py-4 mb-6 text-center shadow">
              <p className="text-sm opacity-80 mb-1">
                Zadnji izžrebani — skupina {crkaSkupine(zadnja.skupina)}, mesto {zadnja.sedez}
              </p>
              <p className="text-2xl sm:text-3xl font-bold">{teamDisplayName(poId.get(zadnja.id), true)}</p>
            </div>
          )}

          {/* Skupine */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {groupSizes.map((size, gi) => {
              const vSkupini = dodelitve.filter(d => d.skupina === gi)
              const aktivna = vTeku?.skupina === gi
              return (
                <div key={gi} className={`bg-white border rounded-xl p-3 ${aktivna
                  ? 'border-bocce-green ring-2 ring-bocce-green/30' : 'border-gray-200'}`}>
                  <p className="font-bold text-gray-700 mb-2">Skupina {crkaSkupine(gi)}
                    <span className="ml-1.5 text-xs font-normal text-gray-400">({size})</span>
                  </p>
                  <div className="space-y-1.5">
                    {Array.from({ length: size }, (_, s) => {
                      const d = vSkupini.find(x => x.sedez === s + 1)
                      return (
                        <div key={s} className={`text-sm rounded-lg px-2 py-1.5 ${d
                          ? (d === zadnja && !vTeku ? 'bg-bocce-green/15 text-gray-800 font-semibold' : 'bg-gray-50 text-gray-700')
                          : aktivna ? 'bg-bocce-green/10 text-bocce-green animate-pulse' : 'bg-gray-50/50 text-gray-300'}`}>
                          <span className="text-[10px] text-gray-400 mr-1.5">{s + 1}.</span>
                          {d
                            ? <><span className="text-[10px] text-gray-400 mr-1.5">B{d.boben + 1}</span>{teamDisplayName(poId.get(d.id), true)}</>
                            : aktivna ? '…' : 'prosto'}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Bobni */}
          <div className="grid sm:grid-cols-3 gap-3">
            {nacrt.bobni.map((boben, bi) => {
              const ze = new Set(dodelitve.map(d => d.id))
              return (
                <div key={bi} className={`bg-white border rounded-xl p-3 ${bobenNaVrsti === bi
                  ? 'border-bocce-green ring-2 ring-bocce-green/30' : 'border-gray-200'}`}>
                  <p className="font-bold text-gray-700 mb-2">Boben {bi + 1}
                    <span className="ml-1.5 text-xs font-normal text-gray-400">({boben.length} parov)</span>
                  </p>
                  <div className="space-y-1">
                    {boben.map(rid => {
                      const r = poId.get(rid)
                      const izzreban = ze.has(rid)
                      const aktiven = rid === naVrsti
                      return (
                        <div key={rid} className={`flex items-center gap-2 text-sm rounded px-2 py-1 ${izzreban
                          ? 'text-gray-300 line-through'
                          : aktiven ? 'bg-bocce-green/10 text-bocce-green font-semibold' : 'text-gray-700'}`}>
                          <span className="flex-1 truncate">{teamDisplayName(r, true)}</span>
                          <span className="text-[11px] font-mono text-gray-400 shrink-0">
                            {r ? nosilnaVrednost(r).toFixed(1) : '—'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
