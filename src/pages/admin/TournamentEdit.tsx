import { useEffect, useState, FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../supabase'
import { GROUP_TEMPLATES, teamDisplayName, suggestGroupDistribution, stageLabel } from '../../engines/tournament'
import { isPairDiscipline } from '../../engines/tournamentPlacement'
import type { Tournament, TournamentRegistration, TournamentGroup, GroupTeam, GroupDistribution, UserProfile, GuestPlayer, MatchStage } from '../../types'
import { drawKnockout, insertKnockoutBracket } from '../../lib/knockoutDraw'
import { pairsFromSeededTeams, KO_STAGE_ORDER } from '../../engines/knockout'
import { computeRangLestvica, type RangCategory } from '../../lib/rangLestvica'
import { birthYearOf, youthLevel } from '../../engines/doubleRegistration'
import { loadTournamentPlayers } from '../../lib/tournamentPlayers'

type Tab = 'registrations' | 'draw' | 'knockout'

function toRangCat(cat: string): RangCategory | null {
  return cat === 'men' || cat === 'women' || cat === 'u18' ? cat : null
}

/** Najstarejši dovoljen letnik za mladinske serije/turnirje (letnik 2008 ali mlajši). */
const YOUTH_MIN_BIRTH_YEAR = 2008

/** Ali je kategorija mladinska (U-12/U-14/U-15/U-18, vključno z U-18 mladinke)? */
function isYouthCategory(cat: string | null | undefined): boolean {
  return youthLevel(cat) !== null || cat === 'u18_women'
}

export default function TournamentEdit() {
  const { id } = useParams<{ id: string }>()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [registrations, setRegistrations] = useState<TournamentRegistration[]>([])
  const [groups, setGroups] = useState<TournamentGroup[]>([])
  const [groupTeams, setGroupTeams] = useState<(GroupTeam & { registration?: TournamentRegistration })[]>([])
  const [tab, setTab] = useState<Tab>('registrations')
  const [loading, setLoading] = useState(true)
  const [drawLoading, setDrawLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Manual registration form
  const [showAddForm, setShowAddForm] = useState(false)
  const [players, setPlayers] = useState<UserProfile[]>([])
  // Ponovno uporabni tuji/neregistrirani igralci (guest_players) — izbirljivi na turnirjih.
  const [guestPlayers, setGuestPlayers] = useState<GuestPlayer[]>([])
  // guestN = "Neregistriran / tuji": izbereš obstoječega gosta (guestNId) ali ustvariš
  // novega (guestNId === '__new__' + guestNNewName).
  const [addForm, setAddForm] = useState({
    player1: '', player2: '',
    guest1: false, guest2: false,
    guest1Id: '', guest2Id: '',
    guest1NewName: '', guest2NewName: '',
  })
  const [addLoading, setAddLoading] = useState(false)

  // Edit registration
  const [editingRegId, setEditingRegId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ player1: '', player2: '' })
  const [editLoading, setEditLoading] = useState(false)

  // Manual group count override
  const [manualGroups, setManualGroups] = useState<number | ''>('')

  // Swap teams between groups
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null)

  // Izločilni del: način sestave parov + napredovalci + ročni pari
  type KoQualifier = { teamId: string; label: string; groupNumber: number; position: 1 | 2 }
  const [koMethod, setKoMethod] = useState<'auto' | 'draw' | 'manual'>('auto')
  const [koQualifiers, setKoQualifiers] = useState<KoQualifier[]>([])
  const [koPairs, setKoPairs] = useState<Array<[string, string]>>([])
  // Trenutne izločilne tekme (za ponovni žreb kasnejših krogov)
  type KoMatchRow = { id: string; stage: MatchStage; match_number: number; team_a_id: string | null; team_b_id: string | null; winner_id: string | null; status: string }
  const [koMatches, setKoMatches] = useState<KoMatchRow[]>([])
  // Način + ročni pari na krog (za ponovni žreb)
  const [koRoundMethod, setKoRoundMethod] = useState<Record<string, 'auto' | 'draw' | 'manual'>>({})
  const [koRoundPairs, setKoRoundPairs] = useState<Record<string, Array<[string, string]>>>({})

  useEffect(() => { load() }, [id])

  // Ob odprtju zavihka Izločilni del naloži napredovalce (za ročne/žrebne pare).
  useEffect(() => {
    if (tab === 'knockout' && groups.length > 0) loadKoQualifiers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, groups.length])

  async function load() {
    try {
      const { data: groupIds } = await supabase.from('tournament_groups').select('id').eq('tournament_id', id)
      const ids = groupIds?.map(x => x.id) ?? []

      const [{ data: t, error: tErr }, { data: r }, { data: g }, { data: gt }, { data: km }] = await Promise.all([
        supabase.from('tournaments').select('*').eq('id', id).single(),
        supabase.from('tournament_registrations')
          .select('*, player1:users!tournament_registrations_player1_id_fkey(*), player2:users!tournament_registrations_player2_id_fkey(*), guest1:guest_players!tournament_registrations_player1_guest_id_fkey(*), guest2:guest_players!tournament_registrations_player2_guest_id_fkey(*)')
          .eq('tournament_id', id).order('registered_at'),
        supabase.from('tournament_groups').select('*').eq('tournament_id', id).order('group_number'),
        ids.length > 0
          ? supabase.from('group_teams').select('*, registration:tournament_registrations(*, player1:users!tournament_registrations_player1_id_fkey(*), player2:users!tournament_registrations_player2_id_fkey(*), guest1:guest_players!tournament_registrations_player1_guest_id_fkey(*), guest2:guest_players!tournament_registrations_player2_guest_id_fkey(*))').in('group_id', ids)
          : Promise.resolve({ data: [] }),
        supabase.from('matches')
          .select('id, stage, match_number, team_a_id, team_b_id, winner_id, status')
          .eq('tournament_id', id).neq('stage', 'group'),
      ])
      if (tErr) throw tErr
      setTournament(t as Tournament)
      setRegistrations((r ?? []) as TournamentRegistration[])
      setGroups((g ?? []) as TournamentGroup[])
      setGroupTeams((gt ?? []) as (GroupTeam & { registration?: TournamentRegistration })[])
      setKoMatches((km ?? []) as KoMatchRow[])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function confirmRegistration(regId: string) {
    setMessage('')
    const { error: err } = await supabase
      .from('tournament_registrations')
      .update({ status: 'confirmed' })
      .eq('id', regId)
    if (err) { setMessage(`❌ Napaka: ${err.message}`); return }
    setMessage('✓ Prijava potrjena')
    await load()
  }

  async function rejectRegistration(regId: string) {
    setMessage('')
    const { error: err } = await supabase
      .from('tournament_registrations')
      .update({ status: 'rejected' })
      .eq('id', regId)
    if (err) { setMessage(`❌ Napaka: ${err.message}`); return }
    setMessage('✓ Prijava zavrnjena')
    await load()
  }

  async function deleteRegistration(regId: string) {
    // Trajni izbris (napačna prijava). group_teams se počisti prek ON DELETE CASCADE.
    if (!window.confirm('Trajno izbrišem to prijavo? Tega ni mogoče razveljaviti.')) return
    setMessage('')
    const { error: err } = await supabase
      .from('tournament_registrations')
      .delete()
      .eq('id', regId)
    if (err) { setMessage(`❌ Napaka: ${err.message}`); return }
    setMessage('✓ Prijava izbrisana')
    if (editingRegId === regId) setEditingRegId(null)
    await load()
  }

  async function loadGuestPlayers() {
    const { data } = await supabase.from('guest_players').select('*').order('full_name')
    setGuestPlayers((data ?? []) as GuestPlayer[])
  }

  async function loadPlayers() {
    loadGuestPlayers()
    if (players.length > 0) return
    // Vsi z vlogo 'player' + člani ligaških postav z drugo vlogo (sodniki/admini,
    // ki tudi igrajo) — sicer bi manjkali na seznamu.
    const all = await loadTournamentPlayers()
    // Mladinske serije/turnirji: pokaži le igralce letnika 2008 ali mlajše.
    // Igralci brez (razberljivega) datuma rojstva se izpustijo, ker starosti ni
    // mogoče preveriti. date_of_birth je lahko ISO ali pikčasti BZS zapis, zato
    // uporabimo birthYearOf (robusten razčlenjevalnik).
    if (isYouthCategory(tournament?.category)) {
      setPlayers(all.filter(p => {
        const y = birthYearOf(p.date_of_birth)
        return y !== null && parseInt(y, 10) >= YOUTH_MIN_BIRTH_YEAR
      }))
    } else {
      setPlayers(all)
    }
  }

  function startEdit(reg: TournamentRegistration) {
    setEditingRegId(reg.id)
    setEditForm({ player1: reg.player1_id ?? '', player2: reg.player2_id ?? '' })
    loadPlayers()
  }

  async function handleEditRegistration() {
    if (!editingRegId) return
    if (editForm.player1 === editForm.player2) { setMessage('❌ Igralca morata biti različna'); return }
    const conflict = registrations.find(r =>
      r.id !== editingRegId && (
        r.player1_id === editForm.player1 || r.player2_id === editForm.player1 ||
        r.player1_id === editForm.player2 || r.player2_id === editForm.player2
      )
    )
    if (conflict) { setMessage('❌ Eden od igralcev je že prijavljen v drugi ekipi'); return }
    setEditLoading(true)
    setMessage('')
    const { error: err } = await supabase
      .from('tournament_registrations')
      .update({ player1_id: editForm.player1, player2_id: editForm.player2 })
      .eq('id', editingRegId)
    setEditLoading(false)
    if (err) { setMessage(`❌ Napaka: ${err.message}`); return }
    setMessage('✓ Prijava posodobljena')
    setEditingRegId(null)
    await load()
  }

  /** Razreši gost-slot v guest_players ID: obstoječi izbrani ali na novo ustvarjen. */
  async function resolveGuest(existingId: string, newName: string):
    Promise<{ id: string; name: string } | { error: string }> {
    if (existingId && existingId !== '__new__') {
      const gp = guestPlayers.find(g => g.id === existingId)
      return { id: existingId, name: gp?.full_name ?? '' }
    }
    const name = newName.trim()
    if (!name) return { error: 'Izberi ali vpiši tujega igralca' }
    const { data, error } = await supabase
      .from('guest_players').insert({ full_name: name }).select('id, full_name').single()
    if (error || !data) return { error: error?.message ?? 'Napaka pri ustvarjanju gosta' }
    return { id: (data as GuestPlayer).id, name: (data as GuestPlayer).full_name }
  }

  function guestSlotFilled(isGuest: boolean, guestId: string, newName: string, playerId: string): boolean {
    if (isGuest) return (!!guestId && guestId !== '__new__') || !!newName.trim()
    return !!playerId
  }

  async function handleManualRegister(e: FormEvent) {
    e.preventDefault()
    const isPair = tournament?.discipline_type ? isPairDiscipline(tournament.discipline_type) : true

    // Validacija vnosa (pred morebitnim ustvarjanjem gosta).
    if (!guestSlotFilled(addForm.guest1, addForm.guest1Id, addForm.guest1NewName, addForm.player1)) {
      setMessage('❌ Izberi ali vpiši igralca 1'); return
    }
    if (isPair && !guestSlotFilled(addForm.guest2, addForm.guest2Id, addForm.guest2NewName, addForm.player2)) {
      setMessage('❌ Izberi ali vpiši igralca 2'); return
    }
    if (isPair && !addForm.guest1 && !addForm.guest2 && addForm.player1 === addForm.player2) {
      setMessage('❌ Igralca morata biti različna'); return
    }

    setAddLoading(true)
    setMessage('')

    // Razreši/ustvari gosta ali uporabi registriranega igralca.
    let p1Id: string | null = null, p1GuestId: string | null = null, p1Name: string | null = null
    if (addForm.guest1) {
      const g = await resolveGuest(addForm.guest1Id, addForm.guest1NewName)
      if ('error' in g) { setAddLoading(false); setMessage(`❌ ${g.error}`); return }
      p1GuestId = g.id; p1Name = g.name
    } else { p1Id = addForm.player1 }

    let p2Id: string | null = null, p2GuestId: string | null = null, p2Name: string | null = null
    if (isPair) {
      if (addForm.guest2) {
        const g = await resolveGuest(addForm.guest2Id, addForm.guest2NewName)
        if ('error' in g) { setAddLoading(false); setMessage(`❌ ${g.error}`); return }
        p2GuestId = g.id; p2Name = g.name
      } else { p2Id = addForm.player2 }
    }

    // Preveri dvojno prijavo le za registrirane igralce (gostov ni v drugih prijavah).
    const ids = [p1Id, p2Id].filter(Boolean) as string[]
    const alreadyRegistered = ids.length > 0 && registrations.find(r =>
      (r.player1_id != null && ids.includes(r.player1_id)) ||
      (r.player2_id != null && ids.includes(r.player2_id))
    )
    if (alreadyRegistered) { setAddLoading(false); setMessage('❌ Eden od igralcev je že prijavljen'); return }

    const { error: err } = await supabase.from('tournament_registrations').insert({
      tournament_id: id,
      player1_id: p1Id, player1_guest_id: p1GuestId, player1_name: p1Name,
      player2_id: p2Id, player2_guest_id: p2GuestId, player2_name: p2Name,
      status: 'confirmed',
    })
    setAddLoading(false)
    if (err) { setMessage(`❌ Napaka: ${err.message}`); return }
    setMessage('✓ Ekipa dodana in potrjena')
    setAddForm({ player1: '', player2: '', guest1: false, guest2: false, guest1Id: '', guest2Id: '', guest1NewName: '', guest2NewName: '' })
    setShowAddForm(false)
    loadGuestPlayers()
    await load()
  }

  async function handleSwap(targetId: string) {
    if (!swapSourceId) { setSwapSourceId(targetId); return }
    if (swapSourceId === targetId) { setSwapSourceId(null); return }

    const src = groupTeams.find(gt => gt.id === swapSourceId)
    const tgt = groupTeams.find(gt => gt.id === targetId)
    if (!src || !tgt) { setSwapSourceId(null); return }

    // Swap registration_ids — group_team IDs stay the same so matches are unaffected
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('group_teams').update({ registration_id: tgt.registration_id }).eq('id', swapSourceId),
      supabase.from('group_teams').update({ registration_id: src.registration_id }).eq('id', targetId),
    ])
    setSwapSourceId(null)
    if (e1 || e2) { setMessage('❌ Napaka pri zamenjavi'); return }
    setMessage('✓ Ekipi zamenjani')
    await load()
  }

  async function handleDraw() {
    const confirmed = registrations.filter(r => r.status === 'confirmed')
    if (confirmed.length === 0) { setMessage('Ni potrjenih prijav za žreb'); return }

    setDrawLoading(true)
    setMessage('')

    try {
      const dist = suggestGroupDistribution(confirmed.length, manualGroups || undefined)

      if (!dist.isValid) {
        setMessage(`❌ ${confirmed.length} parov ne sede v ${dist.totalGroups} skupin — vsaka skupina mora imeti 3–5 ekip (za ${dist.totalGroups} skupin: ${3 * dist.totalGroups}–${5 * dist.totalGroups} parov). Spremeni število skupin.`)
        setDrawLoading(false)
        return
      }

      await supabase.from('tournament_groups').delete().eq('tournament_id', id)

      // Fisher-Yates shuffle
      const shuffled = [...confirmed]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }

      // Build ordered list of group sizes: first 5s, then 4s, then 3s
      const groupSizes: (3 | 4 | 5)[] = [
        ...Array(dist.groups5).fill(5),
        ...Array(dist.groups4).fill(4),
        ...Array(dist.groups3).fill(3),
      ]

      // Assign teams to groups
      let teamIdx = 0
      const assignments: Array<{ size: 3 | 4 | 5; teams: TournamentRegistration[] }> = []
      for (const size of groupSizes) {
        assignments.push({ size, teams: shuffled.slice(teamIdx, teamIdx + size) })
        teamIdx += size
      }

      // Batch insert groups with group_size
      const { data: createdGroups, error: groupErr } = await supabase
        .from('tournament_groups')
        .insert(assignments.map((a, g) => ({
          tournament_id: id,
          group_number: g + 1,
          status: 'pending',
          group_size: a.size,
        })))
        .select()
      if (groupErr) throw groupErr

      // Batch insert group_teams
      const allGroupTeams = createdGroups.flatMap((group, g) =>
        assignments[g].teams.map((reg, s) => ({
          group_id: group.id,
          registration_id: reg.id,
          seed: s + 1,
        }))
      )
      const { data: insertedTeams, error: teamsErr } = await supabase
        .from('group_teams').insert(allGroupTeams).select('id, group_id, seed')
      if (teamsErr) throw teamsErr

      // Build per-group seed → team lookup
      type InsertedTeam = { id: string; group_id: string; seed: number }
      const teamsByGroup: Record<string, Record<number, InsertedTeam>> = {}
      for (const t of insertedTeams as InsertedTeam[]) {
        if (!teamsByGroup[t.group_id]) teamsByGroup[t.group_id] = {}
        teamsByGroup[t.group_id][t.seed - 1] = t
      }

      // Batch insert matches using per-group template
      const allMatches = createdGroups.flatMap((group, g) => {
        const size = assignments[g].size
        const template = GROUP_TEMPLATES[size]
        const teamBySeed = teamsByGroup[group.id] ?? {}
        return template.map(tpl => {
          const resolveTeam = (dep: typeof tpl.teamA): InsertedTeam | null => {
            if (dep === 'BYE' || !('seed' in dep)) return null
            return teamBySeed[dep.seed] ?? null
          }
          const teamA = resolveTeam(tpl.teamA)
          const teamB = resolveTeam(tpl.teamB)
          const isBye = tpl.teamB === 'BYE'
          return {
            tournament_id: id,
            group_id: group.id,
            stage: 'group',
            match_type: isBye ? 'bye' : tpl.type,
            match_number: tpl.num,
            team_a_id: teamA?.id ?? null,
            team_b_id: teamB?.id ?? null,
            score_a: isBye ? 6 : null,
            score_b: isBye ? 0 : null,
            winner_id: isBye && teamA ? teamA.id : null,
            is_bye: isBye,
            status: isBye ? 'completed' : 'pending',
          }
        })
      })

      const { error: matchErr } = await supabase.from('matches').insert(allMatches)
      if (matchErr) throw matchErr

      const parts = [
        dist.groups5 > 0 ? `${dist.groups5}×5` : '',
        dist.groups4 > 0 ? `${dist.groups4}×4` : '',
        dist.groups3 > 0 ? `${dist.groups3}×3` : '',
      ].filter(Boolean).join(' + ')

      setMessage(`✓ Žreb opravljen: ${dist.totalGroups} skupin (${parts})`)
      load()
    } catch (err) {
      setMessage('Napaka pri žrebu: ' + (err as Error).message)
    }
    setDrawLoading(false)
  }

  async function handleKnockoutDraw() {
    const confirmed = registrations.filter(r => r.status === 'confirmed')
    if (confirmed.length < 2) { setMessage('❌ Premalo potrjenih prijav (najmanj 2)'); return }
    if (groups.length > 0 && !confirm('Ponoven žreb izbriše obstoječo mrežo. Nadaljujem?')) return
    setDrawLoading(true); setMessage('')
    try {
      const rang = await computeRangLestvica()
      const cat = tournament ? toRangCat(tournament.category) : null
      const rangPoints: Record<string, number> = {}
      if (cat) for (const row of rang.byCategory[cat]) rangPoints[row.playerId] = row.rang
      const regs = confirmed.map(r => ({ id: r.id, player1_id: r.player1_id, player2_id: r.player2_id }))
      const res = await drawKnockout(id!, regs, rangPoints)
      setMessage(`✓ Izločilni žreb opravljen: mreža ${res.bracket} (${res.teams} ekip)`)
      await load()
    } catch (err) {
      setMessage('❌ Napaka pri žrebu: ' + (err as Error).message)
    }
    setDrawLoading(false)
  }

  /** Ime ekipe (group_teams.id) za prikaz v izločilnem delu. */
  function koTeamName(teamId: string | null): string {
    if (!teamId) return '—'
    const gt = groupTeams.find(g => g.id === teamId)
    return gt?.registration ? teamDisplayName(gt.registration) : '?'
  }

  /** Prisotni izločilni krogi v vrstnem redu (r16 → … → final). */
  function koPresentStages(): MatchStage[] {
    const present = new Set(koMatches.map(m => m.stage))
    return KO_STAGE_ORDER.filter(s => present.has(s))
  }

  /** Krogi, ki jih je mogoče na novo sestaviti/žrebati (za vsakega: napredovale ekipe). */
  function redrawableRounds() {
    const present = koPresentStages()
    const out: Array<{ stage: MatchStage; advancing: Array<{ teamId: string; label: string }>; feederComplete: boolean }> = []
    for (let i = 1; i < present.length; i++) {
      const stage = present[i]
      const matchCount = koMatches.filter(m => m.stage === stage).length
      if (matchCount < 2) continue // finale (1 tekma) — brez žreba
      const feederMatches = koMatches.filter(m => m.stage === present[i - 1]).sort((a, b) => a.match_number - b.match_number)
      const feederComplete = feederMatches.length > 0 && feederMatches.every(m => !!m.winner_id)
      const advancing = feederMatches
        .filter(m => m.winner_id)
        .map(m => ({ teamId: m.winner_id as string, label: koTeamName(m.winner_id) }))
      out.push({ stage, advancing, feederComplete })
    }
    return out
  }

  /** Na novo sestavi (samodejno/žreb/ročno) izbrani krog + počisti vse naslednje. */
  async function redrawRound(stage: MatchStage) {
    const present = koPresentStages()
    const idx = present.indexOf(stage)
    const feederMatches = koMatches.filter(m => m.stage === present[idx - 1]).sort((a, b) => a.match_number - b.match_number)
    if (feederMatches.some(m => !m.winner_id)) { setMessage('❌ Prejšnji krog ni dokončan'); return }
    const teams = feederMatches.map(m => m.winner_id as string)
    const method = koRoundMethod[stage] ?? 'auto'

    let pairs: Array<[string, string]>
    if (method === 'manual') {
      const mp = koRoundPairs[stage] ?? []
      const used = mp.flat().filter(Boolean)
      if (used.length !== teams.length || new Set(used).size !== teams.length) {
        setMessage('❌ Ročni pari: vsaka ekipa mora biti izbrana natanko enkrat'); return
      }
      pairs = mp
    } else if (method === 'draw') {
      const ids = [...teams]
      for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]] }
      pairs = []
      for (let i = 0; i < ids.length; i += 2) pairs.push([ids[i], ids[i + 1]])
    } else {
      pairs = []
      for (let i = 0; i < teams.length; i += 2) pairs.push([teams[i], teams[i + 1]])
    }

    if (!window.confirm(`Ponovni žreb kroga »${stageLabel(stage)}« pobriše rezultate tega in vseh naslednjih krogov. Nadaljujem?`)) return

    const targetMatches = koMatches.filter(m => m.stage === stage).sort((a, b) => a.match_number - b.match_number)
    for (let i = 0; i < targetMatches.length; i++) {
      const p = pairs[i] ?? ['', '']
      await supabase.from('matches').update({
        team_a_id: p[0] || null, team_b_id: p[1] || null, winner_id: null, score_a: null, score_b: null, status: 'pending', is_bye: false,
      }).eq('id', targetMatches[i].id)
    }
    // Počisti naslednje kroge + tekmo za 3. mesto (pari se spremenijo, zato so nadaljnji krogi neveljavni).
    for (const ds of [...present.slice(idx + 1), 'third_place' as MatchStage]) {
      await supabase.from('matches').update({
        team_a_id: null, team_b_id: null, winner_id: null, score_a: null, score_b: null, status: 'pending', is_bye: false,
      }).eq('tournament_id', id).eq('stage', ds)
    }
    setMessage(`✓ Krog »${stageLabel(stage)}« na novo sestavljen (${method === 'manual' ? 'ročno' : method === 'draw' ? 'žreb' : 'samodejno'})`)
    await load()
  }

  /** Napredovalci iz skupin (1. in 2. mesto vsake skupine) — za sestavo izločilnih parov. */
  async function fetchQualifiers(): Promise<KoQualifier[]> {
    const { data: gm } = await supabase.from('matches')
      .select('group_id, match_number, winner_id')
      .eq('tournament_id', id).eq('stage', 'group').eq('status', 'completed')
    const gmr = (gm ?? []) as Array<{ group_id: string; match_number: number; winner_id: string | null }>
    const nameByTeam = new Map(groupTeams.map(gt => [gt.id, gt.registration ? teamDisplayName(gt.registration) : '?']))
    const quals: KoQualifier[] = []
    for (const g of [...groups].sort((a, b) => a.group_number - b.group_number)) {
      const size = g.group_size ?? 4
      const winnersMatchNum = size <= 4 ? 3 : 7
      const lastMatchNum = size <= 4 ? 5 : 9
      const gMatches = gmr.filter(m => m.group_id === g.id)
      const found: Array<[1 | 2, string | null | undefined]> = [
        [1, gMatches.find(m => m.match_number === winnersMatchNum)?.winner_id],
        [2, gMatches.find(m => m.match_number === lastMatchNum)?.winner_id],
      ]
      for (const [pos, wid] of found) {
        if (wid) quals.push({
          teamId: wid, groupNumber: g.group_number, position: pos,
          label: `${nameByTeam.get(wid) ?? '?'} (S${g.group_number}·${pos}.)`,
        })
      }
    }
    return quals
  }

  /** Samodejni nosilni pari: zmagovalci = nosilci 1..G, drugouvrščeni = G+1..2G (obratno). */
  function autoSeedPairs(quals: KoQualifier[]): Array<[string | null, string | null]> {
    const byGroup = (a: KoQualifier, b: KoQualifier) => a.groupNumber - b.groupNumber
    const winners = quals.filter(q => q.position === 1).sort(byGroup).map(q => q.teamId)
    const runners = quals.filter(q => q.position === 2).sort(byGroup).map(q => q.teamId)
    return pairsFromSeededTeams([...winners, ...runners.reverse()])
  }

  /** Naloži napredovalce (ko odpreš zavihek Izločilni del) + pripravi privzete ročne pare. */
  async function loadKoQualifiers() {
    const quals = await fetchQualifiers()
    setKoQualifiers(quals)
    // Privzeti ročni pari = samodejni razpored — le če je napredovalcev potenca 2 (≥2).
    const n = quals.length
    if (n >= 2 && (n & (n - 1)) === 0) {
      setKoPairs(autoSeedPairs(quals).map(([a, b]) => [a ?? '', b ?? ''] as [string, string]))
    } else {
      setKoPairs([])
    }
  }

  async function generateKnockout() {
    if (!window.confirm('Ustvarjanje izločilnega dela pobriše morebitne obstoječe izločilne tekme in njihove rezultate. Nadaljujem?')) return
    setMessage('')
    try {
      const confirmed = registrations.filter(r => r.status === 'confirmed')
      const dist = suggestGroupDistribution(confirmed.length, groups.length || undefined)

      // Konfiguracija z dodatnim krogom (skupine niso potenca 2) → poseben razpored.
      if (dist.extraStage !== null) { await legacyGenerateExtra(dist); return }

      const quals = await fetchQualifiers()
      const n = quals.length
      if (n < 2) { setMessage('Ni dovolj napredovalcev za izločilni del'); return }
      if ((n & (n - 1)) !== 0) { setMessage(`Število napredovalcev (${n}) ni potenca 2 — izločilni del ni mogoč`); return }

      let pairs: Array<[string | null, string | null]>
      if (koMethod === 'manual') {
        const flat = koPairs.flat()
        const used = flat.filter(Boolean)
        if (used.length !== n || new Set(used).size !== n) {
          setMessage('❌ Ročni pari: vsaka ekipa mora biti izbrana natanko enkrat'); return
        }
        pairs = koPairs.map(([a, b]) => [a || null, b || null])
      } else if (koMethod === 'draw') {
        const ids = quals.map(q => q.teamId)
        for (let i = ids.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]
        }
        pairs = []
        for (let i = 0; i < ids.length; i += 2) pairs.push([ids[i], ids[i + 1]])
      } else {
        pairs = autoSeedPairs(quals)
      }

      await insertKnockoutBracket(id!, pairs)
      setMessage(`✓ Izločilni del ustvarjen (${koMethod === 'manual' ? 'ročno' : koMethod === 'draw' ? 'žreb' : 'samodejno'})`)
      load()
    } catch (err) {
      setMessage('Napaka: ' + (err as Error).message)
    }
  }

  /** Star razpored za konfiguracije z DODATNIM krogom (skupine niso potenca 2). */
  async function legacyGenerateExtra(dist: GroupDistribution) {
    const { data: finalMatches } = await supabase.from('matches')
      .select('*, group:tournament_groups(*)')
      .eq('tournament_id', id).eq('stage', 'group').eq('status', 'completed')
    const directQualifiers: Array<{ groupNumber: number; position: 1 | 2; teamId: string }> = []
    const extraQualifiers: Array<{ groupNumber: number; position: 1 | 2; teamId: string }> = []
    for (const g of groups) {
      const size = (g.group_size ?? 4) as 3 | 4 | 5
      const winnersMatchNum = size <= 4 ? 3 : 7
      const lastMatchNum = size <= 4 ? 5 : 9
      const gMatches = ((finalMatches ?? []) as Array<{ group_id: string; match_number: number; winner_id: string | null }>).filter(m => m.group_id === g.id)
      const m1st = gMatches.find(m => m.match_number === winnersMatchNum)
      const m2nd = gMatches.find(m => m.match_number === lastMatchNum)
      const isExtra = size === 3 && dist.extraStage !== null
      const target = isExtra ? extraQualifiers : directQualifiers
      if (m1st?.winner_id) target.push({ groupNumber: g.group_number, position: 1, teamId: m1st.winner_id })
      if (m2nd?.winner_id) target.push({ groupNumber: g.group_number, position: 2, teamId: m2nd.winner_id })
    }
    if (directQualifiers.length + extraQualifiers.length < 2) { setMessage('Ni dovolj napredovalcev za izločilni del'); return }
    let matchNum = 1
    if (extraQualifiers.length > 0 && dist.extraStage) {
      const pos1 = extraQualifiers.filter(q => q.position === 1).sort((a, b) => a.groupNumber - b.groupNumber)
      const pos2 = extraQualifiers.filter(q => q.position === 2).sort((a, b) => a.groupNumber - b.groupNumber)
      const n = Math.min(pos1.length, pos2.length)
      for (let i = 0; i < n; i++) {
        await supabase.from('matches').insert({
          tournament_id: id, group_id: null, stage: dist.extraStage, match_type: 'knockout', match_number: matchNum++,
          team_a_id: pos1[i]?.teamId ?? null, team_b_id: pos2[n - 1 - i]?.teamId ?? null, status: 'pending',
        })
      }
    }
    const pos1d = directQualifiers.filter(q => q.position === 1).sort((a, b) => a.groupNumber - b.groupNumber)
    const pos2d = directQualifiers.filter(q => q.position === 2).sort((a, b) => a.groupNumber - b.groupNumber)
    const nd = Math.min(pos1d.length, pos2d.length)
    matchNum = 1
    for (let i = 0; i < nd; i++) {
      await supabase.from('matches').insert({
        tournament_id: id, group_id: null, stage: dist.directStage, match_type: 'knockout', match_number: matchNum++,
        team_a_id: pos1d[i]?.teamId ?? null, team_b_id: pos2d[nd - 1 - i]?.teamId ?? null, status: 'pending',
      })
    }
    setMessage(`✓ Izločilni del ustvarjen — ${stageLabel(dist.directStage)}`)
    load()
  }

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-bocce-green" /></div>
  if (error) return <div className="text-center py-12 text-red-500">Napaka: {error}</div>
  if (!tournament) return <div className="text-center py-12 text-gray-400">Turnir ni najden</div>

  const isPair = tournament?.discipline_type ? isPairDiscipline(tournament.discipline_type) : true

  const confirmed = registrations.filter(r => r.status === 'confirmed')
  const pending = registrations.filter(r => r.status === 'pending')
  const rejected = registrations.filter(r => r.status === 'rejected')
  const dist: GroupDistribution = suggestGroupDistribution(confirmed.length, manualGroups || undefined)

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between gap-3 mb-2">
        <Link to="/admin/turnirji" className="text-sm text-gray-500 hover:text-bocce-green">← Nazaj</Link>
        <a
          href={`${tournament.kind === 'championship' ? '/prvenstva' : '/turnirji'}/${id}`}
          target="_blank" rel="noopener noreferrer"
          className="text-sm bg-bocce-green text-white px-3 py-1.5 rounded-lg hover:bg-bocce-green-light transition-colors">
          Odpri javno stran (vnos rezultatov) ↗
        </a>
      </div>
      <h1 className="text-2xl font-bold text-gray-800 mb-1">{tournament.name}</h1>
      <p className="text-sm text-gray-500 mb-6">{tournament.date} · {tournament.location}</p>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${message.startsWith('✓') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message}
        </div>
      )}

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(tournament.format === 'knockout'
          ? [
              { key: 'registrations' as Tab, label: `Prijave (${registrations.length})` },
              { key: 'draw' as Tab, label: `Izločilni žreb${groups.length ? ' ✓' : ''}` },
            ]
          : [
              { key: 'registrations' as Tab, label: `Prijave (${registrations.length})` },
              { key: 'draw' as Tab, label: `Žreb skupin (${groups.length})` },
              { key: 'knockout' as Tab, label: 'Izločilni del' },
            ]
        ).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
              ${tab === t.key ? 'border-bocce-green text-bocce-green' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Registrations tab */}
      {tab === 'registrations' && (
        <div>
          {/* Manual add form */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-700">Ročno dodaj ekipo</h3>
              <button
                onClick={() => { setShowAddForm(v => !v); loadPlayers() }}
                className="text-sm bg-bocce-green text-white px-3 py-1.5 rounded-lg hover:bg-bocce-green-light transition-colors">
                {showAddForm ? '✕ Zapri' : '+ Dodaj ekipo'}
              </button>
            </div>
            {showAddForm && (
              <form onSubmit={handleManualRegister}
                className="bg-bocce-green/5 border border-bocce-green/20 rounded-xl p-4 space-y-3">
                <div className={`grid gap-3 ${isPair ? 'sm:grid-cols-2' : ''}`}>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-gray-600">Igralec 1 *</label>
                      <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer select-none">
                        <input type="checkbox" checked={addForm.guest1}
                          onChange={e => setAddForm(f => ({ ...f, guest1: e.target.checked }))} />
                        Neregistriran / tuji
                      </label>
                    </div>
                    {addForm.guest1 ? (
                      <div className="space-y-2">
                        <select
                          value={addForm.guest1Id}
                          onChange={e => setAddForm(f => ({ ...f, guest1Id: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                          <option value="">Izberi tujega igralca...</option>
                          {guestPlayers.map(g => (
                            <option key={g.id} value={g.id}>{g.full_name}{g.club ? ` — ${g.club}` : ''}</option>
                          ))}
                          <option value="__new__">+ Nov tuji igralec…</option>
                        </select>
                        {addForm.guest1Id === '__new__' && (
                          <input
                            type="text"
                            value={addForm.guest1NewName}
                            onChange={e => setAddForm(f => ({ ...f, guest1NewName: e.target.value }))}
                            placeholder="Ime in priimek novega tujega igralca"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none" />
                        )}
                      </div>
                    ) : (
                      <select
                        required
                        value={addForm.player1}
                        onChange={e => setAddForm(f => ({ ...f, player1: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                        <option value="">Izberi igralca...</option>
                        {players.map(p => (
                          <option key={p.id} value={p.id} disabled={isPair && !addForm.guest2 && p.id === addForm.player2}>
                            {p.full_name}{p.club ? ` — ${p.club}` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {isPair && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-600">Igralec 2 *</label>
                        <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer select-none">
                          <input type="checkbox" checked={addForm.guest2}
                            onChange={e => setAddForm(f => ({ ...f, guest2: e.target.checked }))} />
                          Neregistriran / tuji
                        </label>
                      </div>
                      {addForm.guest2 ? (
                        <div className="space-y-2">
                          <select
                            value={addForm.guest2Id}
                            onChange={e => setAddForm(f => ({ ...f, guest2Id: e.target.value }))}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                            <option value="">Izberi tujega igralca...</option>
                            {guestPlayers.map(g => (
                              <option key={g.id} value={g.id}>{g.full_name}{g.club ? ` — ${g.club}` : ''}</option>
                            ))}
                            <option value="__new__">+ Nov tuji igralec…</option>
                          </select>
                          {addForm.guest2Id === '__new__' && (
                            <input
                              type="text"
                              value={addForm.guest2NewName}
                              onChange={e => setAddForm(f => ({ ...f, guest2NewName: e.target.value }))}
                              placeholder="Ime in priimek novega tujega igralca"
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none" />
                          )}
                        </div>
                      ) : (
                        <select
                          required
                          value={addForm.player2}
                          onChange={e => setAddForm(f => ({ ...f, player2: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                          <option value="">Izberi partnerja...</option>
                          {players.map(p => (
                            <option key={p.id} value={p.id} disabled={!addForm.guest1 && p.id === addForm.player1}>
                              {p.full_name}{p.club ? ` — ${p.club}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={addLoading}
                    className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light transition-colors disabled:opacity-50">
                    {addLoading ? 'Dodajam...' : 'Dodaj in potrdi'}
                  </button>
                  <button type="button" onClick={() => setShowAddForm(false)}
                    className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                    Prekliči
                  </button>
                </div>
              </form>
            )}
          </div>

          {pending.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-700 mb-3">Čakajo na potrditev ({pending.length})</h3>
              <div className="space-y-2">
                {pending.map(r => (
                  <div key={r.id} className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                    <div>
                      <span className="font-medium text-gray-800">{r.player1?.full_name ?? r.guest1?.full_name ?? r.player1_name}{(r.player2_id || r.player2 || r.player2_guest_id || r.guest2 || r.player2_name) ? ` / ${r.player2?.full_name ?? r.guest2?.full_name ?? r.player2_name}` : ''}</span>
                      <p className="text-xs text-gray-500">{r.player1?.club ?? '—'} · {new Date(r.registered_at).toLocaleDateString('sl')}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => confirmRegistration(r.id)}
                        className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-200 transition-colors">Potrdi</button>
                      <button onClick={() => rejectRegistration(r.id)}
                        className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors">Zavrni</button>
                      <button onClick={() => deleteRegistration(r.id)}
                        className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors">Izbriši</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {rejected.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-700 mb-3">Zavrnjene prijave ({rejected.length})</h3>
              <div className="space-y-2">
                {rejected.map(r => (
                  <div key={r.id} className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                    <div>
                      <span className="font-medium text-gray-800">{r.player1?.full_name ?? r.guest1?.full_name ?? r.player1_name}{(r.player2_id || r.player2 || r.player2_guest_id || r.guest2 || r.player2_name) ? ` / ${r.player2?.full_name ?? r.guest2?.full_name ?? r.player2_name}` : ''}</span>
                      <p className="text-xs text-gray-500">{r.player1?.club ?? '—'} · {new Date(r.registered_at).toLocaleDateString('sl')}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => confirmRegistration(r.id)}
                        className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-200 transition-colors">
                        Obnovi
                      </button>
                      <button onClick={() => deleteRegistration(r.id)}
                        className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors">
                        Izbriši
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="font-semibold text-gray-700 mb-3">Potrjene prijave ({confirmed.length})</h3>
            <div className="space-y-2">
              {confirmed.length === 0 ? (
                <p className="text-gray-400 italic text-sm">Ni potrjenih prijav</p>
              ) : (
                confirmed.map((r, i) => (
                  <div key={r.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    {editingRegId === r.id ? (
                      <div className="space-y-3">
                        <p className="text-xs font-medium text-gray-500">Uredi prijavo #{i + 1}</p>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Igralec 1</label>
                            <select
                              value={editForm.player1}
                              onChange={e => setEditForm(f => ({ ...f, player1: e.target.value }))}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                              {players.map(p => (
                                <option key={p.id} value={p.id} disabled={p.id === editForm.player2}>
                                  {p.full_name}{p.club ? ` — ${p.club}` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Igralec 2</label>
                            <select
                              value={editForm.player2}
                              onChange={e => setEditForm(f => ({ ...f, player2: e.target.value }))}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                              {players.map(p => (
                                <option key={p.id} value={p.id} disabled={p.id === editForm.player1}>
                                  {p.full_name}{p.club ? ` — ${p.club}` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleEditRegistration} disabled={editLoading}
                            className="bg-bocce-green text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-bocce-green-light transition-colors disabled:opacity-50">
                            {editLoading ? 'Shranjujem...' : 'Shrani'}
                          </button>
                          <button onClick={() => setEditingRegId(null)}
                            className="border border-gray-300 text-gray-600 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                            Prekliči
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-gray-400 text-sm w-6">{i + 1}.</span>
                          <div>
                            <span className="font-medium text-gray-800">{r.player1?.full_name ?? r.guest1?.full_name ?? r.player1_name}{(r.player2_id || r.player2 || r.player2_guest_id || r.guest2 || r.player2_name) ? ` / ${r.player2?.full_name ?? r.guest2?.full_name ?? r.player2_name}` : ''}</span>
                            <p className="text-xs text-gray-500">{r.player1?.club ?? '—'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Urejanje podpira le registrirane igralce; gost (prosto ime) se lahko le odstrani. */}
                          {!r.player1_name && !r.player2_name && !r.player1_guest_id && !r.player2_guest_id && (
                            <button onClick={() => startEdit(r)} className="text-xs text-bocce-green hover:text-bocce-green-light">✎ Uredi</button>
                          )}
                          <button onClick={() => rejectRegistration(r.id)} className="text-xs text-red-500 hover:text-red-700">Zavrni</button>
                          <button onClick={() => deleteRegistration(r.id)} className="text-xs text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded">Izbriši</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Draw tab */}
      {tab === 'draw' && tournament.format === 'knockout' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-semibold text-amber-800 mb-2">
            Direktni izločilni sistem — {registrations.filter(r => r.status === 'confirmed').length} potrjenih ekip
          </p>
          <p className="text-xs text-amber-700 mb-3">
            Nosilci se določijo po rang lestvici (dvojice po vsoti točk para). Najboljši dobijo proste (bye), če število ni potenca 2.
          </p>
          <button onClick={handleKnockoutDraw} disabled={drawLoading}
            className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light transition-colors disabled:opacity-50">
            {drawLoading ? 'Žrebam...' : groups.length > 0 ? '↺ Ponovi izločilni žreb' : 'Naredi izločilni žreb'}
          </button>
          <p className="text-xs text-gray-500 mt-3">
            Rezultate vnašaj na <Link to={`${tournament.kind === 'championship' ? '/prvenstva' : '/turnirji'}/${id}`} className="text-bocce-green hover:underline">javni strani</Link>; krogi napredujejo samodejno.
          </p>
        </div>
      )}
      {tab === 'draw' && tournament.format !== 'knockout' && (
        <div>
          {/* Distribution preview */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <p className="text-sm font-semibold text-blue-800 mb-2">
              {confirmed.length} potrjenih parov → {dist.totalGroups} skupin
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {dist.groups5 > 0 && (
                <span className="text-xs px-2 py-1 rounded-full bg-bocce-green text-white font-medium">
                  {dist.groups5}× skupina po 5 → direktno v {stageLabel(dist.directStage)}
                </span>
              )}
              {dist.groups4 > 0 && (
                <span className="text-xs px-2 py-1 rounded-full bg-blue-200 text-blue-800 font-medium">
                  {dist.groups4}× skupina po 4 → direktno v {stageLabel(dist.directStage)}
                </span>
              )}
              {dist.groups3 > 0 && dist.extraStage && (
                <span className="text-xs px-2 py-1 rounded-full bg-amber-200 text-amber-800 font-medium">
                  {dist.groups3}× skupina po 3 → {stageLabel(dist.extraStage)} → {stageLabel(dist.directStage)}
                </span>
              )}
              {dist.groups3 > 0 && !dist.extraStage && (
                <span className="text-xs px-2 py-1 rounded-full bg-amber-200 text-amber-800 font-medium">
                  {dist.groups3}× skupina po 3 → direktno v {stageLabel(dist.directStage)}
                </span>
              )}
            </div>
            {!dist.isValid && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                ⚠️ {confirmed.length} parov ne sede v {dist.totalGroups} skupin — vsaka skupina mora imeti 3–5 ekip
                (za {dist.totalGroups} skupin: {3 * dist.totalGroups}–{5 * dist.totalGroups} parov). Spremeni število skupin.
              </p>
            )}
            <div className="flex items-center gap-3 mb-3">
              <label className="text-xs text-blue-700 font-medium">Število skupin:</label>
              <input
                type="number" min="1" max={confirmed.length}
                placeholder={String(dist.totalGroups)}
                value={manualGroups}
                onChange={e => setManualGroups(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 border border-blue-300 rounded-lg px-2 py-1 text-sm text-center bg-white focus:ring-2 focus:ring-bocce-green outline-none"
              />
              {manualGroups !== '' && (
                <button onClick={() => setManualGroups('')} className="text-xs text-blue-600 hover:underline">
                  Ponastavi
                </button>
              )}
            </div>
            <button onClick={handleDraw} disabled={drawLoading || confirmed.length === 0 || !dist.isValid}
              className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light transition-colors disabled:opacity-50">
              {drawLoading ? 'Žrebam...' : groups.length > 0 ? '↺ Ponovi žreb' : 'Naredi žreb'}
            </button>
          </div>

          {swapSourceId && (
            <div className="mb-4 px-4 py-2 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800 flex items-center justify-between">
              <span>✋ Klikni ekipo v drugi skupini za zamenjavo</span>
              <button onClick={() => setSwapSourceId(null)} className="text-xs text-amber-600 hover:underline">Prekliči</button>
            </div>
          )}

          {groups.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-4">
              {groups.map(g => {
                const gTeams = groupTeams.filter(gt => gt.group_id === g.id).sort((a, b) => a.seed - b.seed)
                const size = g.group_size ?? 4
                const isExtra = size === 3
                return (
                  <div key={g.id} className={`bg-white border rounded-xl p-4 ${isExtra ? 'border-amber-200' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-bocce-green">Skupina {g.group_number}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        isExtra ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {size} ekipe{isExtra && dist.extraStage ? ` · ${stageLabel(dist.extraStage)}` : ' · direktno'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {gTeams.map(gt => {
                        const isSource = swapSourceId === gt.id
                        const isSwappable = swapSourceId !== null && swapSourceId !== gt.id
                        return (
                          <div key={gt.id}
                            onClick={() => handleSwap(gt.id)}
                            className={`flex items-center gap-2 text-sm rounded-lg px-1 py-0.5 cursor-pointer transition-colors
                              ${isSource ? 'bg-amber-100 ring-2 ring-amber-400' : ''}
                              ${isSwappable ? 'hover:bg-bocce-green/10' : 'hover:bg-gray-50'}`}>
                            <span className="w-5 h-5 rounded-full bg-bocce-green/10 text-bocce-green text-xs font-bold flex items-center justify-center flex-shrink-0">
                              {gt.seed}
                            </span>
                            <span className="text-gray-700">
                              {gt.registration ? teamDisplayName(gt.registration) : 'Neznano'}
                            </span>
                            {isSource && <span className="ml-auto text-xs text-amber-600">↕</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Knockout tab */}
      {tab === 'knockout' && (
        <div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 space-y-3">
            <p className="text-sm text-amber-800 font-medium">Izločilni del</p>
            {dist.extraStage ? (
              <p className="text-xs text-amber-700">
                Skupini po 4/5 → direktno v <strong>{stageLabel(dist.directStage)}</strong> ·
                Skupini po 3 → najprej <strong>{stageLabel(dist.extraStage)}</strong>, nato {stageLabel(dist.directStage)}
                <br />(dodatni krog — samodejni razpored)
              </p>
            ) : (
              <>
                <p className="text-xs text-amber-700">
                  Vse skupini → direktno v <strong>{stageLabel(dist.directStage)}</strong> · napredovalcev: <strong>{koQualifiers.length}</strong>
                </p>
                {/* Način sestave parov */}
                <div className="flex flex-wrap gap-2">
                  {([['auto', 'Samodejno (križanje)'], ['draw', 'Žreb (naključno)'], ['manual', 'Ročno']] as const).map(([m, label]) => (
                    <button key={m} onClick={() => setKoMethod(m)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${koMethod === m
                        ? 'bg-bocce-green text-white border-bocce-green'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {/* Ročni urejevalnik parov */}
                {koMethod === 'manual' && (
                  koQualifiers.length >= 2 && (koQualifiers.length & (koQualifiers.length - 1)) === 0 ? (
                    <div className="space-y-1.5 bg-white rounded-lg p-3 border border-amber-100">
                      <p className="text-xs text-gray-500">Sestavi pare prvega kroga (vsaka ekipa enkrat):</p>
                      {koPairs.map((pair, pi) => (
                        <div key={pi} className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-400 w-5">{pi + 1}.</span>
                          <select value={pair[0]}
                            onChange={e => setKoPairs(prev => { const cp = prev.map(p => [...p] as [string, string]); cp[pi][0] = e.target.value; return cp })}
                            className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-xs bg-white">
                            <option value="">—</option>
                            {koQualifiers.map(q => <option key={q.teamId} value={q.teamId}>{q.label}</option>)}
                          </select>
                          <span className="text-xs text-gray-400">–</span>
                          <select value={pair[1]}
                            onChange={e => setKoPairs(prev => { const cp = prev.map(p => [...p] as [string, string]); cp[pi][1] = e.target.value; return cp })}
                            className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-xs bg-white">
                            <option value="">—</option>
                            {koQualifiers.map(q => <option key={q.teamId} value={q.teamId}>{q.label}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-red-600">
                      Za ročni razpored morajo biti vpisani vsi rezultati skupin — napredovalcev mora biti potenca 2 (trenutno {koQualifiers.length}).
                    </p>
                  )
                )}
              </>
            )}
            <div>
              <button onClick={generateKnockout}
                className="bg-bocce-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-bocce-gold-light transition-colors">
                Ustvari izločilni del
              </button>
              <p className="text-[11px] text-amber-700 mt-2">
                ⚠️ Ponovno ustvarjanje pobriše obstoječe izločilne tekme in njihove rezultate.
              </p>
            </div>
          </div>

          {/* Ponovni žreb kasnejših krogov (četrtfinale, polfinale …) */}
          {redrawableRounds().length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 space-y-4">
              <p className="text-sm font-semibold text-gray-700">Ponovni žreb kroga</p>
              {redrawableRounds().map(r => {
                const method = koRoundMethod[r.stage] ?? 'auto'
                return (
                  <div key={r.stage} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">{stageLabel(r.stage)}</span>
                      {!r.feederComplete && <span className="text-xs text-gray-400 italic">prejšnji krog ni dokončan</span>}
                    </div>
                    {r.feederComplete && (
                      <>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {([['auto', 'Samodejno'], ['draw', 'Žreb'], ['manual', 'Ročno']] as const).map(([m, label]) => (
                            <button key={m}
                              onClick={() => {
                                setKoRoundMethod(prev => ({ ...prev, [r.stage]: m }))
                                if (m === 'manual') {
                                  const ids = r.advancing.map(a => a.teamId)
                                  const p: Array<[string, string]> = []
                                  for (let i = 0; i < ids.length; i += 2) p.push([ids[i], ids[i + 1] ?? ''])
                                  setKoRoundPairs(prev => ({ ...prev, [r.stage]: p }))
                                }
                              }}
                              className={`text-xs px-3 py-1 rounded-lg border transition-colors ${method === m
                                ? 'bg-bocce-green text-white border-bocce-green'
                                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                        {method === 'manual' && (
                          <div className="space-y-1.5 mb-2">
                            {(koRoundPairs[r.stage] ?? []).map((pair, pi) => (
                              <div key={pi} className="flex items-center gap-1.5">
                                <span className="text-xs text-gray-400 w-5">{pi + 1}.</span>
                                <select value={pair[0]}
                                  onChange={e => setKoRoundPairs(prev => { const arr = (prev[r.stage] ?? []).map(x => [...x] as [string, string]); arr[pi][0] = e.target.value; return { ...prev, [r.stage]: arr } })}
                                  className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-xs bg-white">
                                  <option value="">—</option>
                                  {r.advancing.map(a => <option key={a.teamId} value={a.teamId}>{a.label}</option>)}
                                </select>
                                <span className="text-xs text-gray-400">–</span>
                                <select value={pair[1]}
                                  onChange={e => setKoRoundPairs(prev => { const arr = (prev[r.stage] ?? []).map(x => [...x] as [string, string]); arr[pi][1] = e.target.value; return { ...prev, [r.stage]: arr } })}
                                  className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-xs bg-white">
                                  <option value="">—</option>
                                  {r.advancing.map(a => <option key={a.teamId} value={a.teamId}>{a.label}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
                        )}
                        <button onClick={() => redrawRound(r.stage)}
                          className="text-xs bg-bocce-gold text-white px-3 py-1.5 rounded-lg hover:bg-bocce-gold-light transition-colors">
                          Sestavi krog
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
              <p className="text-[11px] text-gray-500">Sestava kroga pobriše rezultate tega in vseh naslednjih krogov.</p>
            </div>
          )}

          <p className="text-sm text-gray-500 italic">
            Za vnos rezultatov pojdi na <Link to={`/turnirji/${id}`} className="text-bocce-green hover:underline">javno stran turnirja</Link>.
          </p>
        </div>
      )}
    </div>
  )
}
