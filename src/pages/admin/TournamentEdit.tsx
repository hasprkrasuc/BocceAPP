import { useEffect, useState, FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../supabase'
import { GROUP_TEMPLATES, teamDisplayName, suggestGroupDistribution, stageLabel } from '../../engines/tournament'
import { isPairDiscipline } from '../../engines/tournamentPlacement'
import type { Tournament, TournamentRegistration, TournamentGroup, GroupTeam, GroupDistribution, UserProfile, GuestPlayer } from '../../types'
import { drawKnockout } from '../../lib/knockoutDraw'
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

  useEffect(() => { load() }, [id])

  async function load() {
    try {
      const { data: groupIds } = await supabase.from('tournament_groups').select('id').eq('tournament_id', id)
      const ids = groupIds?.map(x => x.id) ?? []

      const [{ data: t, error: tErr }, { data: r }, { data: g }, { data: gt }] = await Promise.all([
        supabase.from('tournaments').select('*').eq('id', id).single(),
        supabase.from('tournament_registrations')
          .select('*, player1:users!tournament_registrations_player1_id_fkey(*), player2:users!tournament_registrations_player2_id_fkey(*), guest1:guest_players!tournament_registrations_player1_guest_id_fkey(*), guest2:guest_players!tournament_registrations_player2_guest_id_fkey(*)')
          .eq('tournament_id', id).order('registered_at'),
        supabase.from('tournament_groups').select('*').eq('tournament_id', id).order('group_number'),
        ids.length > 0
          ? supabase.from('group_teams').select('*, registration:tournament_registrations(*, player1:users!tournament_registrations_player1_id_fkey(*), player2:users!tournament_registrations_player2_id_fkey(*), guest1:guest_players!tournament_registrations_player1_guest_id_fkey(*), guest2:guest_players!tournament_registrations_player2_guest_id_fkey(*))').in('group_id', ids)
          : Promise.resolve({ data: [] }),
      ])
      if (tErr) throw tErr
      setTournament(t as Tournament)
      setRegistrations((r ?? []) as TournamentRegistration[])
      setGroups((g ?? []) as TournamentGroup[])
      setGroupTeams((gt ?? []) as (GroupTeam & { registration?: TournamentRegistration })[])
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

  async function generateKnockout() {
    setMessage('')
    try {
      const confirmed = registrations.filter(r => r.status === 'confirmed')
      // Uporabi DEJANSKO število skupin (kot je bilo žrebano), ne le števila ekip,
      // sicer se lahko določitev stopnje (extra/direct) razlikuje od žreba.
      const dist = suggestGroupDistribution(confirmed.length, groups.length || undefined)

      const { data: finalMatches } = await supabase.from('matches')
        .select('*, group:tournament_groups(*)')
        .eq('tournament_id', id)
        .eq('stage', 'group')
        .eq('status', 'completed')

      // Collect qualifiers from each group
      const directQualifiers: Array<{ groupNumber: number; position: 1 | 2; teamId: string }> = []
      const extraQualifiers: Array<{ groupNumber: number; position: 1 | 2; teamId: string }> = []

      for (const g of groups) {
        const size = (g.group_size ?? 4) as 3 | 4 | 5
        const winnersMatchNum = size <= 4 ? 3 : 7
        const lastMatchNum = size <= 4 ? 5 : 9

        const gMatches = ((finalMatches ?? []) as Array<{
          group_id: string; match_number: number; winner_id: string | null
        }>).filter(m => m.group_id === g.id)

        const m1st = gMatches.find(m => m.match_number === winnersMatchNum)
        const m2nd = gMatches.find(m => m.match_number === lastMatchNum)

        // Skupina po 3 igra dodatni krog LE, kadar tak krog obstaja (G ni potenca 2).
        // Pri potenci 2 (npr. 8 skupin) so tudi skupine po 3 direktne → po 2 naprej.
        const isExtra = size === 3 && dist.extraStage !== null
        const target = isExtra ? extraQualifiers : directQualifiers

        if (m1st?.winner_id) target.push({ groupNumber: g.group_number, position: 1, teamId: m1st.winner_id })
        if (m2nd?.winner_id) target.push({ groupNumber: g.group_number, position: 2, teamId: m2nd.winner_id })
      }

      if (directQualifiers.length + extraQualifiers.length < 2) {
        setMessage('Ni dovolj napredovalcev za izločilni del')
        return
      }

      let matchNum = 1

      // Create extra stage matches (groups of 3 qualifiers)
      if (extraQualifiers.length > 0 && dist.extraStage) {
        const pos1 = extraQualifiers.filter(q => q.position === 1).sort((a, b) => a.groupNumber - b.groupNumber)
        const pos2 = extraQualifiers.filter(q => q.position === 2).sort((a, b) => a.groupNumber - b.groupNumber)
        const n = Math.min(pos1.length, pos2.length)
        for (let i = 0; i < n; i++) {
          await supabase.from('matches').insert({
            tournament_id: id, group_id: null, stage: dist.extraStage,
            match_type: 'knockout', match_number: matchNum++,
            team_a_id: pos1[i]?.teamId ?? null,
            team_b_id: pos2[n - 1 - i]?.teamId ?? null,
            status: 'pending',
          })
        }
      }

      // Create direct stage matches (groups of 4/5 qualifiers)
      const pos1d = directQualifiers.filter(q => q.position === 1).sort((a, b) => a.groupNumber - b.groupNumber)
      const pos2d = directQualifiers.filter(q => q.position === 2).sort((a, b) => a.groupNumber - b.groupNumber)
      const nd = Math.min(pos1d.length, pos2d.length)
      matchNum = 1
      for (let i = 0; i < nd; i++) {
        await supabase.from('matches').insert({
          tournament_id: id, group_id: null, stage: dist.directStage,
          match_type: 'knockout', match_number: matchNum++,
          team_a_id: pos1d[i]?.teamId ?? null,
          team_b_id: pos2d[nd - 1 - i]?.teamId ?? null,
          status: 'pending',
        })
        await supabase.from('matches').insert({
          tournament_id: id, group_id: null, stage: dist.directStage,
          match_type: 'knockout', match_number: matchNum++,
          team_a_id: pos2d[i]?.teamId ?? null,
          team_b_id: pos1d[nd - 1 - i]?.teamId ?? null,
          status: 'pending',
        })
      }

      const extraMsg = dist.extraStage ? ` + ${stageLabel(dist.extraStage)} za skupini po 3` : ''
      setMessage(`✓ Izločilni del ustvarjen — ${stageLabel(dist.directStage)} za direktne${extraMsg}`)
      load()
    } catch (err) {
      setMessage('Napaka: ' + (err as Error).message)
    }
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
      <div className="flex items-center gap-3 mb-2">
        <Link to="/admin/turnirji" className="text-sm text-gray-500 hover:text-bocce-green">← Nazaj</Link>
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
            Rezultate vnašaj na <Link to={`/prvenstva/${id}`} className="text-bocce-green hover:underline">javni strani</Link>; krogi napredujejo samodejno.
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
                              {gt.registration
                                ? `${gt.registration.player1?.full_name?.split(' ').at(-1)} / ${gt.registration.player2?.full_name?.split(' ').at(-1)}`
                                : 'Neznano'}
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
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-amber-800 font-medium mb-1">Izločilni del</p>
            {dist.extraStage ? (
              <p className="text-xs text-amber-700 mb-3">
                Skupini po 4/5 → direktno v <strong>{stageLabel(dist.directStage)}</strong> ·
                Skupini po 3 → najprej <strong>{stageLabel(dist.extraStage)}</strong>, nato {stageLabel(dist.directStage)}
              </p>
            ) : (
              <p className="text-xs text-amber-700 mb-3">
                Vse skupini → direktno v <strong>{stageLabel(dist.directStage)}</strong>
              </p>
            )}
            <button onClick={generateKnockout}
              className="bg-bocce-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-bocce-gold-light transition-colors">
              Ustvari izločilni del
            </button>
          </div>
          <p className="text-sm text-gray-500 italic">
            Za vnos rezultatov pojdi na <Link to={`/turnirji/${id}`} className="text-bocce-green hover:underline">javno stran turnirja</Link>.
          </p>
        </div>
      )}
    </div>
  )
}
