import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { USER_PUBLIC_COLS } from '../lib/userColumns'
import { useAuth } from '../contexts/AuthContext'
import type { UserProfile, DoubleRegistration } from '../types'
import { isAgeEligibleByYear, ageInYear, isFemale, eligibleSecondaryTeams, primaryForSecondary, latestSeasonsOnly, primaryTeams, seasonStartYear, DR_STATUS_LABELS, DR_STATUS_COLORS, DR_TIER_LABELS } from '../engines/doubleRegistration'
import PlayerStats from '../components/PlayerStats'

export default function PlayerDetail() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin } = useAuth()
  const [player, setPlayer] = useState<UserProfile | null>(null)
  const [doubleRegs, setDoubleRegs] = useState<DoubleRegistration[]>([])
  const [eligibleTeams, setEligibleTeams] = useState<{ id: string; club_name: string; tier: string; category: string; season_id: string; seasonName: string | null }[]>([])
  const [myTeams, setMyTeams] = useState<{ id: string; tier: string; category: string; season_id: string; seasonName: string | null }[]>([])
  const [drRefYear, setDrRefYear] = useState<number | null>(null)
  const [selectedSecondary, setSelectedSecondary] = useState('')
  const [drSubmitting, setDrSubmitting] = useState(false)
  const [drMsg, setDrMsg] = useState('')
  const [loading, setLoading] = useState(true)

  // Klubsko članstvo (samo admin). Doslej ga v aplikaciji ni bilo mogoče
  // spremeniti nikjer — Administracija → Uporabniki ureja le vlogo, profil pa
  // samo besedilno polje, ki na članstvo ne vpliva.
  const [klubi, setKlubi] = useState<{ id: string; name: string }[]>([])
  const [izbranKlub, setIzbranKlub] = useState<string>('')
  const [klubBusy, setKlubBusy] = useState(false)
  const [klubMsg, setKlubMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!isAdmin) return
    supabase.from('clubs').select('id, name').order('name').then(({ data }) => setKlubi(data ?? []))
  }, [isAdmin])

  useEffect(() => { setIzbranKlub(player?.club_id ?? '') }, [player?.club_id])

  async function shraniKlub() {
    if (!player) return
    const toClubId = izbranKlub || null
    const trenutni = player.club_id ?? null
    if (toClubId === trenutni) return
    const ime = klubi.find(k => k.id === toClubId)?.name
    if (!window.confirm(
      toClubId
        ? `Vpisati ${player.full_name} v klub ${ime}?`
        : `Odvzeti klub igralcu ${player.full_name}?\n\nZgodovine članstva baza ne vodi, zato se prejšnji klub izgubi. ` +
          'Rezultati in zapisniki ostanejo nedotaknjeni.'
    )) return
    setKlubBusy(true); setKlubMsg(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const res = await fetch('/api/club-membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session?.access_token}` },
        body: JSON.stringify({ playerIds: [player.id], toClubId, expectFromClubId: trenutni }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Sprememba ni uspela')
      if (json.changed === 0) throw new Error(json.skipped?.[0]?.reason ?? 'Sprememba ni bila izvedena')
      const { data: osvezen } = await supabase.from('users').select(USER_PUBLIC_COLS).eq('id', player.id).single()
      if (osvezen) setPlayer(osvezen as UserProfile)
      setKlubMsg(toClubId ? `✓ Vpisan v klub ${ime}` : '✓ Klub odvzet')
    } catch (e) {
      setKlubMsg(`❌ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setKlubBusy(false)
    }
  }

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('users').select(USER_PUBLIC_COLS).eq('id', id).single(),
      supabase
        .from('double_registrations')
        .select('*, primary_team:league_teams!primary_team_id(club_name, season:league_seasons(name,tier)), secondary_team:league_teams!secondary_team_id(club_name, season:league_seasons(name,tier))')
        .eq('player_id', id)
        .order('requested_at', { ascending: false }),
    ]).then(async ([{ data: p }, { data: dr }]) => {
      setPlayer(p as UserProfile)
      setDoubleRegs((dr ?? []) as DoubleRegistration[])

      // Ekipe za dvojno reg (admin) — spolno-zavedno (moški / ženske).
      // Vedno najnovejša sezona, tudi če je že zaključena. Pri ženskah je
      // primarna lahko katerakoli njena ekipa (tudi U18 — klub pogosto nima
      // ženske ekipe).
      const playerGender = (p as UserProfile)?.gender
      const { data: tpData } = await supabase
        .from('league_team_players')
        .select('league_team_id, league_teams(id, club_name, season_id, season:league_seasons(id, name, tier, year, category))')
        .eq('player_id', (p as UserProfile)?.id ?? id)
      const playerTeams = latestSeasonsOnly(primaryTeams(playerGender,
        ((tpData ?? []) as any[]).map(tp => tp.league_teams).filter(Boolean)))
      setMyTeams(playerTeams.map((t: any) => ({
        id: t.id, tier: t.season.tier, category: t.season.category,
        season_id: t.season_id, seasonName: t.season.name ?? null,
      })))
      // Sezonsko referenčno leto (za starostno upravičenost po letniku, ne po dnevni starosti)
      const drYears = playerTeams.map((t: any) => seasonStartYear(t.season?.name)).filter((y: number | null): y is number => y !== null)
      setDrRefYear(drYears.length ? Math.max(...drYears) : null)

      const { data: allTeams } = await supabase
        .from('league_teams')
        .select('id, club_name, season:league_seasons(id, name, tier, year, category)')
      const candidates = latestSeasonsOnly(((allTeams ?? []) as any[]).filter(t => t?.season))
      const eligibleRefs = eligibleSecondaryTeams(
        playerGender,
        playerTeams.map((t: any) => ({ id: t.id, tier: t.season?.tier, category: t.season?.category, seasonName: t.season?.name ?? null })),
        candidates.map((t: any) => ({ id: t.id, tier: t.season?.tier, category: t.season?.category, seasonName: t.season?.name ?? null })),
      )
      const eligibleIds = new Set(eligibleRefs.map(r => r.id))
      setEligibleTeams(candidates
        .filter((t: any) => eligibleIds.has(t.id))
        .map((t: any) => ({
          id: t.id, club_name: t.club_name, tier: t.season?.tier, category: t.season?.category,
          season_id: t.season?.id, seasonName: t.season?.name ?? null,
        })))

      setLoading(false)
    })
  }, [id])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-bocce-green" />
    </div>
  )
  if (!player) return <div className="text-center py-12 text-gray-400">Igralec ni najden</div>

  // Poln datum rojstva ni javno berljiv (osebni podatek) — javni profil dela
  // z izpeljano letnico. Pravilo za dvojno registracijo je po letniku, zato je
  // presoja enako natančna; starost je letnik, ne starost na dan.
  const birthYear = player.birth_year ?? null
  const age = ageInYear(player.birth_year)
  const drEligible = isAgeEligibleByYear(player.birth_year, drRefYear)

  async function approveDoubleReg() {
    if (!selectedSecondary || myTeams.length === 0) return
    setDrSubmitting(true); setDrMsg('')
    const secTeam = eligibleTeams.find(t => t.id === selectedSecondary)
    // Matična ekipa mora biti iz ISTE sezone kot sekundarna — myTeams[0] je lahko
    // ekipa iz prejšnje sezone in bi zapis kazal na napačen par.
    const primaryTeam = secTeam ? primaryForSecondary(myTeams, secTeam) : null
    if (!primaryTeam) {
      setDrMsg('❌ Za to sezono ni matične ekipe, iz katere bi bila dvojna registracija mogoča.')
      setDrSubmitting(false)
      return
    }
    // 1. Ustvari zapis dvojne registracije (že odobreno)
    const { error: drErr } = await supabase.from('double_registrations').insert({
      player_id:          player.id,
      primary_team_id:    primaryTeam.id,
      secondary_team_id:  selectedSecondary,
      season_id:          secTeam?.season_id ?? primaryTeam.season_id,
      status:             'approved',
      resolved_at:        new Date().toISOString(),
    })
    if (drErr) { setDrMsg(`❌ ${drErr.message}`); setDrSubmitting(false); return }
    // 2. Dodaj v league_team_players sekundarne ekipe
    const { error: ltpErr } = await supabase.from('league_team_players').insert({
      league_team_id: selectedSecondary,
      player_id:      player.id,
    })
    if (ltpErr) { setDrMsg(`❌ ${ltpErr.message}`); setDrSubmitting(false); return }
    setDrMsg(`✓ Dvojna registracija odobrena za ${secTeam?.club_name}`)
    setSelectedSecondary('')
    // Osveži seznam
    const { data: dr } = await supabase
      .from('double_registrations')
      .select('*, primary_team:league_teams!primary_team_id(club_name, season:league_seasons(name,tier)), secondary_team:league_teams!secondary_team_id(club_name, season:league_seasons(name,tier))')
      .eq('player_id', player.id).order('requested_at', { ascending: false })
    setDoubleRegs((dr ?? []) as DoubleRegistration[])
    setDrSubmitting(false)
  }
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link to={player.club_id ? `/klubi/${player.club_id}` : '/klubi'}
        className="inline-block text-sm text-bocce-green hover:underline mb-4">
        ← {player.club ?? 'Klubi'}
      </Link>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 flex items-start gap-6 flex-wrap">
        {player.photo_url ? (
          <img src={player.photo_url} alt={player.full_name ?? ''}
            className="w-28 h-28 rounded-xl object-cover border border-gray-200 flex-shrink-0" />
        ) : (
          <div className="w-28 h-28 rounded-xl bg-bocce-green/10 flex items-center justify-center text-4xl font-bold text-bocce-green flex-shrink-0">
            {(player.full_name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-800 mb-3">{player.full_name}</h1>
          <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
            {/* Številka licence je odstranjena iz javnega profila — vidita jo
                lastnik profila in admin (users_sensitive). */}
            {birthYear && (
              <>
                <dt className="text-gray-500">Leto rojstva</dt>
                <dd className="font-medium text-gray-800">{birthYear}</dd>
              </>
            )}
            {player.club && (
              <>
                <dt className="text-gray-500">Matični klub</dt>
                <dd className="font-medium text-gray-800">
                  {player.club_id
                    ? <Link to={`/klubi/${player.club_id}`} className="text-bocce-green hover:underline">{player.club}</Link>
                    : player.club}
                </dd>
              </>
            )}
            {player.gender && (
              <>
                <dt className="text-gray-500">Spol</dt>
                <dd className="font-medium text-gray-800">{player.gender === 'M' ? 'Moški' : 'Ženska'}</dd>
              </>
            )}
          </dl>
        </div>
      </div>

      {/* Klubsko članstvo — samo admin. Ločeno od vloge: kdor sodi in igra, ima
          vlogo "sodnik", igranje pa teče prek ekip, ne prek vloge. */}
      {isAdmin && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Klub</h2>
          <p className="text-sm text-gray-500 mb-4">
            {player.club_id
              ? <>Trenutno član kluba <span className="font-medium text-gray-700">{player.club}</span>.</>
              : 'Igralec ni vpisan v noben klub, zato se ne pojavi med člani nobenega kluba.'}
          </p>
          <div className="flex gap-2 flex-wrap">
            <select
              value={izbranKlub}
              onChange={e => setIzbranKlub(e.target.value)}
              className="flex-1 min-w-[14rem] border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none"
            >
              <option value="">— brez kluba —</option>
              {klubi.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
            <button
              onClick={shraniKlub}
              disabled={klubBusy || (izbranKlub || null) === (player.club_id ?? null)}
              className="bg-bocce-green text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-bocce-green-light transition-colors disabled:opacity-40 shrink-0"
            >
              {klubBusy ? '...' : 'Shrani klub'}
            </button>
          </div>
          {klubMsg && (
            <p className={`text-sm rounded-lg px-3 py-2 mt-3 ${klubMsg.startsWith('❌') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {klubMsg}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-3">
            Članstvo v klubu in nastop za ekipo sta ločeni stvari — v ligaško ekipo se igralec
            doda v Administracija → Državne lige → Ekipe.
          </p>
        </div>
      )}

      {/* Sezone z rangom, ligaška pot in turnirji — deljeno z /profil. */}
      <PlayerStats playerId={player.id} />

      {/* Dvojna registracija */}
      {(drEligible || doubleRegs.length > 0) && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Dvojna registracija</h2>
            {drEligible && (
              <span className="text-xs bg-bocce-green/10 text-bocce-green border border-bocce-green/20 px-2.5 py-1 rounded-full font-medium">
                ✓ Upravičen ({age} let)
              </span>
            )}
          </div>

          {/* Obstoječe dvojne registracije */}
          {doubleRegs.length > 0 && (
            <div className="space-y-2 mb-4">
              {doubleRegs.map(dr => (
                <div key={dr.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                  <div className="flex-1 text-sm">
                    <span className="font-medium">{(dr.primary_team as any)?.club_name}</span>
                    <span className="text-xs text-gray-400 ml-1">({DR_TIER_LABELS[(dr.primary_team as any)?.season?.tier ?? ''] ?? ''})</span>
                    <span className="mx-2 text-gray-300">→</span>
                    <span className="font-medium">{(dr.secondary_team as any)?.club_name}</span>
                    <span className="text-xs text-gray-400 ml-1">({DR_TIER_LABELS[(dr.secondary_team as any)?.season?.tier ?? ''] ?? ''})</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${DR_STATUS_COLORS[dr.status]}`}>
                    {DR_STATUS_LABELS[dr.status]}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Admin: dodaj dvojno registracijo */}
          {isAdmin && drEligible && myTeams.length > 0 && eligibleTeams.length > 0 && (
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dodaj dvojno registracijo</p>
              <div className="flex gap-2">
                <select
                  value={selectedSecondary}
                  onChange={e => setSelectedSecondary(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none"
                >
                  <option value="">— Izberi sekundarno ekipo —</option>
                  {eligibleTeams.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.club_name} ({DR_TIER_LABELS[t.tier] ?? t.tier})
                    </option>
                  ))}
                </select>
                <button
                  onClick={approveDoubleReg}
                  disabled={!selectedSecondary || drSubmitting}
                  className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-bocce-green-light transition-colors shrink-0"
                >
                  {drSubmitting ? '...' : '🔄 Dodeli'}
                </button>
              </div>
              {drMsg && (
                <p className={`text-sm rounded-lg px-3 py-2 ${drMsg.startsWith('❌') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                  {drMsg}
                </p>
              )}
            </div>
          )}

          {isAdmin && drEligible && myTeams.length === 0 && (
            <p className="text-sm text-gray-400 italic">
              {isFemale(player.gender)
                ? 'Igralka ni v nobeni ženski ekipi tekoče sezone.'
                : 'Igralec ni v nobeni moški ekipi tekoče sezone.'}
            </p>
          )}
        </div>
      )}


    </div>
  )
}
