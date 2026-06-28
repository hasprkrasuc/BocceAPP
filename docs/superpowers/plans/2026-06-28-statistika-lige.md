# Statistika lige — načrt implementacije

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na strani lige (`/liga/:id`) dodati zavihka Statistika (posameznik skupno / po disciplinah / ekipno po disciplinah) in Rang (utežena lestvica te lige), z uporabo obstoječih `leagueStats` enginov.

**Architecture:** Obstoječi pure engini (`aggregatePlayerStats`, `aggregateTeamDisciplineStats`, `calculateRang`) se ne spreminjajo — dodamo jim teste. Dve novi pure pomožni funkciji pivotirata izhode po disciplinah in računata povprečje. Helper razreši UUID→ime. `LeagueDetail` pridobi rezultate disciplin, vse skupaj izriše nova predstavitvena komponenta.

**Tech Stack:** React 18 + TypeScript + Vite, Supabase, Vitest. Veja `feature/league-stats` (že ustvarjena iz main).

**Spec:** [docs/superpowers/specs/2026-06-28-statistika-lige-design.md](../specs/2026-06-28-statistika-lige-design.md)

---

## Struktura datotek

| Datoteka | Odgovornost |
|---|---|
| `src/engines/leagueStats.test.ts` (create) | Karakterizacijski testi obstoječih enginov |
| `src/engines/leagueStatsViews.ts` (create) | Pivot po disciplinah + povprečje (`playersByDiscipline`, `teamsByDiscipline`, `showsAverage`) |
| `src/engines/leagueStatsViews.test.ts` (create) | TDD testi za zgornje |
| `src/lib/playerNames.ts` (create) | `resolvePlayerNames` + `splitPlayerIds` + `UUID_RE` |
| `src/lib/playerNames.test.ts` (create) | TDD za `splitPlayerIds` |
| `src/components/LeagueStats.tsx` (create) | Predstavitev: `LeagueStatsPanel` (statistika) + `LeagueRangPanel` (rang) |
| `src/pages/League.tsx` (modify) | `LeagueDetail`: pridobi rezultate + imena, zavihka Statistika/Rang |

---

## Task 1: Karakterizacijski testi obstoječih enginov

Zaklenejo trenutno vedenje (`aggregateTeamDisciplineStats` je bila mrtva koda — testi jo prvič preverijo).

**Files:**
- Create: `src/engines/leagueStats.test.ts`

- [ ] **Step 1: Napiši teste**

Ustvari `src/engines/leagueStats.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { aggregatePlayerStats, aggregateTeamDisciplineStats, calculateRang } from './leagueStats'
import type { LeagueFixture, LeagueMatchResult, LeagueMatchDisciplineResult, LeagueSeasonDiscipline } from '../types'

const disciplines: LeagueSeasonDiscipline[] = [
  { id: 'd1', season_id: 's', name: 'POSAMEZNO', discipline_type: 'posamezno', players_per_side: 1, has_reserve: false, block_number: 1, order_num: 1 },
  { id: 'd2', season_id: 's', name: 'HITROSTNO', discipline_type: 'hitrostno', players_per_side: 1, has_reserve: false, block_number: 3, order_num: 2 },
]
const fixtures: LeagueFixture[] = [
  { id: 'f1', season_id: 's', round_number: 1, home_team_id: 'tA', away_team_id: 'tB', home_score: null, away_score: null, status: 'completed', scheduled_date: null, chief_judge_id: null, judge_ids: [], group_label: null },
  { id: 'f2', season_id: 's', round_number: 2, home_team_id: 'tA', away_team_id: 'tB', home_score: null, away_score: null, status: 'scheduled', scheduled_date: null, chief_judge_id: null, judge_ids: [], group_label: null },
]
const dr = (over: Partial<LeagueMatchDisciplineResult>): LeagueMatchDisciplineResult => ({
  id: 'x', match_result_id: 'mr1', discipline_id: 'd1', playground_number: null,
  home_score: 0, away_score: 0, home_match_points: 0, away_match_points: 0,
  home_players: [], away_players: [], ...over,
})
const matchResults: Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }> = [
  { id: 'mr1', fixture_id: 'f1', judges: null, chief_judge: null, viewers: null, time_end: null, draw_natancno_field: null, draw_blok4: null, created_at: '', discipline_results: [
    dr({ id: 'dr1', discipline_id: 'd1', home_score: 12, away_score: 8, home_match_points: 2, away_match_points: 0, home_players: ['pA'], away_players: ['pB'] }),
    dr({ id: 'dr2', discipline_id: 'd2', home_score: 20, away_score: 15, home_match_points: 2, away_match_points: 0, home_players: ['pA'], away_players: ['R: Rez Erva'] }),
  ] },
]

describe('aggregatePlayerStats', () => {
  test('sešteje točke in koše po igralcu in disciplini; izloči rezerve', () => {
    const ps = aggregatePlayerStats(matchResults, fixtures, disciplines)
    const pA = ps.find(p => p.playerId === 'pA')!
    expect(pA.totalPlayed).toBe(2)
    expect(pA.totalMatchPointsFor).toBe(4)
    const hit = pA.byDiscipline.find(d => d.disciplineId === 'd2')!
    expect(hit.played).toBe(1)
    expect(hit.scoreFor).toBe(20)
    // rezerva "R: ..." ni igralec
    expect(ps.find(p => p.playerId.startsWith('R:'))).toBeUndefined()
  })

  test('upošteva samo zaključene tekme', () => {
    const onlyScheduled = aggregatePlayerStats(
      [{ ...matchResults[0], fixture_id: 'f2' }], fixtures, disciplines,
    )
    expect(onlyScheduled).toHaveLength(0)
  })
})

describe('aggregateTeamDisciplineStats', () => {
  test('na ekipo sešteje po disciplini točke in koš', () => {
    const tA = aggregateTeamDisciplineStats('tA', fixtures, matchResults, disciplines)
    const d2 = tA.find(d => d.disciplineId === 'd2')!
    expect(d2.played).toBe(1)
    expect(d2.matchPointsFor).toBe(2)
    expect(d2.scoreFor).toBe(20)
    expect(d2.scoreAgainst).toBe(15)
  })

  test('za gostujočo ekipo zamenja stran (for/against)', () => {
    const tB = aggregateTeamDisciplineStats('tB', fixtures, matchResults, disciplines)
    const d1 = tB.find(d => d.disciplineId === 'd1')!
    expect(d1.matchPointsFor).toBe(0)
    expect(d1.scoreFor).toBe(8)
    expect(d1.scoreAgainst).toBe(12)
  })
})

describe('calculateRang', () => {
  test('vrne rang > 0 za igralca z osvojenimi točkami', () => {
    const ps = aggregatePlayerStats(matchResults, fixtures, disciplines)
    const pA = ps.find(p => p.playerId === 'pA')!
    const r = calculateRang(pA, 'super_liga')
    expect(r.playerId).toBe('pA')
    expect(r.rang).toBeGreaterThan(0)
    expect(r.totalMatchPointsFor).toBe(4)
  })
})
```

- [ ] **Step 2: Poženi teste — pričakuj uspeh (karakterizacija obstoječe kode)**

Run: `npx vitest run src/engines/leagueStats.test.ts`
Expected: PASS. Če kateri test pade, to razkrije hrošč v engine kodi — **ustavi se in javi** (status BLOCKED), ne prilagajaj testov, da skrijejo hrošč.

- [ ] **Step 3: Commit**

```bash
git add src/engines/leagueStats.test.ts
git commit -m "test: karakterizacijski testi leagueStats enginov"
```

---

## Task 2: Pivot pomožni funkciji `leagueStatsViews.ts` (TDD)

**Files:**
- Create: `src/engines/leagueStatsViews.ts`
- Test: `src/engines/leagueStatsViews.test.ts`

- [ ] **Step 1: Napiši padajoče teste**

Ustvari `src/engines/leagueStatsViews.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { showsAverage, playersByDiscipline, teamsByDiscipline, AVERAGE_DISCIPLINES } from './leagueStatsViews'
import type { PlayerSeasonStat } from './leagueStats'
import type { LeagueFixture, LeagueMatchResult, LeagueMatchDisciplineResult, LeagueSeasonDiscipline } from '../types'

const discs: LeagueSeasonDiscipline[] = [
  { id: 'd1', season_id: 's', name: 'POSAMEZNO', discipline_type: 'posamezno', players_per_side: 1, has_reserve: false, block_number: 1, order_num: 1 },
  { id: 'd2', season_id: 's', name: 'HITROSTNO', discipline_type: 'hitrostno', players_per_side: 1, has_reserve: false, block_number: 3, order_num: 2 },
]

describe('showsAverage', () => {
  test('velja za 6 številčnih disciplin', () => {
    for (const t of ['hitrostno', 'natancno', 'stafeta', 'krog', 'blizanje', 'blizanje_krog'] as const)
      expect(showsAverage(t)).toBe(true)
    expect(AVERAGE_DISCIPLINES.size).toBe(6)
  })
  test('ne velja za dvoboje', () => {
    for (const t of ['posamezno', 'dvojka', 'trojka', 'podaljsek'] as const)
      expect(showsAverage(t)).toBe(false)
  })
})

describe('playersByDiscipline', () => {
  const stats: PlayerSeasonStat[] = [
    { playerId: 'pA', totalPlayed: 2, totalMatchPointsFor: 4, totalScoreFor: 40, byDiscipline: [
      { disciplineId: 'd2', disciplineName: 'HITROSTNO', disciplineType: 'hitrostno', blockNumber: 3, played: 2, matchPointsFor: 4, scoreFor: 40, scoreAgainst: 20 },
    ] },
    { playerId: 'pB', totalPlayed: 1, totalMatchPointsFor: 0, totalScoreFor: 10, byDiscipline: [
      { disciplineId: 'd2', disciplineName: 'HITROSTNO', disciplineType: 'hitrostno', blockNumber: 3, played: 1, matchPointsFor: 0, scoreFor: 10, scoreAgainst: 20 },
    ] },
  ]
  test('grupira po disciplini, računa povprečje, razvrsti po točkah', () => {
    const sec = playersByDiscipline(stats, discs)
    const d2 = sec.find(s => s.discipline.id === 'd2')!
    expect(d2.rows.map(r => r.playerId)).toEqual(['pA', 'pB'])  // pA več točk
    expect(d2.rows[0].average).toBe(20)  // 40/2
    expect(d2.rows[1].average).toBe(10)  // 10/1
    // disciplina brez igralcev ima prazne vrstice
    expect(sec.find(s => s.discipline.id === 'd1')!.rows).toHaveLength(0)
  })
})

describe('teamsByDiscipline', () => {
  const fixtures: LeagueFixture[] = [
    { id: 'f1', season_id: 's', round_number: 1, home_team_id: 'tA', away_team_id: 'tB', home_score: null, away_score: null, status: 'completed', scheduled_date: null, chief_judge_id: null, judge_ids: [], group_label: null },
  ]
  const mr: Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }> = [
    { id: 'mr1', fixture_id: 'f1', judges: null, chief_judge: null, viewers: null, time_end: null, draw_natancno_field: null, draw_blok4: null, created_at: '', discipline_results: [
      { id: 'dr2', match_result_id: 'mr1', discipline_id: 'd2', playground_number: null, home_score: 20, away_score: 15, home_match_points: 2, away_match_points: 0, home_players: ['pA'], away_players: ['pB'] },
    ] },
  ]
  test('pivotira po disciplini čez ekipe + povprečje', () => {
    const sec = teamsByDiscipline(['tA', 'tB'], fixtures, mr, discs)
    const d2 = sec.find(s => s.discipline.id === 'd2')!
    expect(d2.rows.map(r => r.teamId)).toEqual(['tA', 'tB'])  // tA več točk
    expect(d2.rows[0]).toMatchObject({ teamId: 'tA', played: 1, matchPointsFor: 2, scoreFor: 20, average: 20 })
    expect(d2.rows[1]).toMatchObject({ teamId: 'tB', matchPointsFor: 0, scoreFor: 15, average: 15 })
  })
})
```

- [ ] **Step 2: Poženi — pričakuj neuspeh**

Run: `npx vitest run src/engines/leagueStatsViews.test.ts`
Expected: FAIL (modul ne obstaja).

- [ ] **Step 3: Implementiraj**

Ustvari `src/engines/leagueStatsViews.ts`:

```ts
import type {
  DisciplineType, LeagueSeasonDiscipline, LeagueFixture,
  LeagueMatchResult, LeagueMatchDisciplineResult,
} from '../types'
import { aggregateTeamDisciplineStats, type PlayerSeasonStat } from './leagueStats'

/** Discipline s številčnim rezultatom → prikažemo povprečje doseženega. */
export const AVERAGE_DISCIPLINES: ReadonlySet<DisciplineType> = new Set<DisciplineType>([
  'hitrostno', 'natancno', 'stafeta', 'krog', 'blizanje', 'blizanje_krog',
])
export function showsAverage(t: DisciplineType): boolean {
  return AVERAGE_DISCIPLINES.has(t)
}

export interface DisciplineSection<Row> {
  discipline: LeagueSeasonDiscipline
  rows: Row[]
}

export interface DisciplinePlayerRow {
  playerId: string
  played: number
  matchPointsFor: number
  scoreFor: number
  average: number
}

/** Za vsako disciplino seznam igralcev (iz njihovih byDiscipline), razvrščen po točkah. */
export function playersByDiscipline(
  stats: PlayerSeasonStat[],
  disciplines: LeagueSeasonDiscipline[],
): DisciplineSection<DisciplinePlayerRow>[] {
  return disciplines.map(discipline => {
    const rows: DisciplinePlayerRow[] = []
    for (const ps of stats) {
      const d = ps.byDiscipline.find(b => b.disciplineId === discipline.id)
      if (!d || d.played === 0) continue
      rows.push({
        playerId: ps.playerId,
        played: d.played,
        matchPointsFor: d.matchPointsFor,
        scoreFor: d.scoreFor,
        average: d.played > 0 ? d.scoreFor / d.played : 0,
      })
    }
    rows.sort((a, b) => b.matchPointsFor - a.matchPointsFor || b.average - a.average)
    return { discipline, rows }
  })
}

export interface DisciplineTeamRow {
  teamId: string
  played: number
  matchPointsFor: number
  scoreFor: number
  average: number
}

/** Za vsako disciplino seznam ekip (kliče aggregateTeamDisciplineStats na ekipo), razvrščen po točkah. */
export function teamsByDiscipline(
  teamIds: string[],
  fixtures: LeagueFixture[],
  matchResults: Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }>,
  disciplines: LeagueSeasonDiscipline[],
): DisciplineSection<DisciplineTeamRow>[] {
  const perTeam = new Map<string, Map<string, { played: number; matchPointsFor: number; scoreFor: number }>>()
  for (const teamId of teamIds) {
    const m = new Map<string, { played: number; matchPointsFor: number; scoreFor: number }>()
    for (const s of aggregateTeamDisciplineStats(teamId, fixtures, matchResults, disciplines)) {
      m.set(s.disciplineId, { played: s.played, matchPointsFor: s.matchPointsFor, scoreFor: s.scoreFor })
    }
    perTeam.set(teamId, m)
  }
  return disciplines.map(discipline => {
    const rows: DisciplineTeamRow[] = []
    for (const teamId of teamIds) {
      const s = perTeam.get(teamId)?.get(discipline.id)
      if (!s || s.played === 0) continue
      rows.push({
        teamId,
        played: s.played,
        matchPointsFor: s.matchPointsFor,
        scoreFor: s.scoreFor,
        average: s.played > 0 ? s.scoreFor / s.played : 0,
      })
    }
    rows.sort((a, b) => b.matchPointsFor - a.matchPointsFor || b.average - a.average)
    return { discipline, rows }
  })
}
```

- [ ] **Step 4: Poženi — pričakuj uspeh**

Run: `npx vitest run src/engines/leagueStatsViews.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/leagueStatsViews.ts src/engines/leagueStatsViews.test.ts
git commit -m "feat(engine): leagueStatsViews — pivot po disciplinah + povprečje (TDD)"
```

---

## Task 3: Razrešitev imen `playerNames.ts` (TDD za pure del)

**Files:**
- Create: `src/lib/playerNames.ts`
- Test: `src/lib/playerNames.test.ts`

- [ ] **Step 1: Napiši padajoče teste**

Ustvari `src/lib/playerNames.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { splitPlayerIds, UUID_RE } from './playerNames'

describe('splitPlayerIds', () => {
  test('loči UUID-je od prostih imen in odstrani dvojnike', () => {
    const ids = [
      'a2230001-0000-4000-8000-000000000004',
      'Janez Novak',
      'a2230001-0000-4000-8000-000000000004', // dvojnik
      'Marko Kos',
    ]
    const { uuids, names } = splitPlayerIds(ids)
    expect(uuids).toEqual(['a2230001-0000-4000-8000-000000000004'])
    expect(names).toEqual(['Janez Novak', 'Marko Kos'])
  })

  test('UUID_RE prepozna pravi UUID', () => {
    expect(UUID_RE.test('a2230001-0000-4000-8000-000000000004')).toBe(true)
    expect(UUID_RE.test('Janez Novak')).toBe(false)
  })
})
```

- [ ] **Step 2: Poženi — pričakuj neuspeh**

Run: `npx vitest run src/lib/playerNames.test.ts`
Expected: FAIL (modul ne obstaja).

- [ ] **Step 3: Implementiraj**

Ustvari `src/lib/playerNames.ts`:

```ts
import { supabase } from '../supabase'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Razdeli mešan seznam (UUID | prosto ime) na UUID-je in imena (brez dvojnikov). */
export function splitPlayerIds(ids: string[]): { uuids: string[]; names: string[] } {
  const uuids: string[] = []
  const names: string[] = []
  for (const id of [...new Set(ids)]) {
    if (!id) continue
    if (UUID_RE.test(id)) uuids.push(id)
    else names.push(id)
  }
  return { uuids, names }
}

export interface ResolvedPlayer {
  full_name: string
  club: string | null
}

/**
 * Razreši seznam (UUID | ime) v zemljevid prikaznih imen + klubov.
 * UUID-je poišče v users (brez sodnikov); prosta imena pusti dobesedno.
 */
export async function resolvePlayerNames(ids: string[]): Promise<Map<string, ResolvedPlayer>> {
  const { uuids, names } = splitPlayerIds(ids)
  const map = new Map<string, ResolvedPlayer>()
  for (const n of names) map.set(n, { full_name: n, club: null })
  if (uuids.length) {
    const { data } = await supabase.from('users').select('id, full_name, club, role').in('id', uuids)
    for (const u of (data ?? []).filter((x: { role?: string }) => x.role !== 'judge')) {
      map.set(u.id, { full_name: u.full_name ?? `?? ${u.id.slice(0, 8)}`, club: u.club ?? null })
    }
  }
  return map
}
```

- [ ] **Step 4: Poženi — pričakuj uspeh**

Run: `npx vitest run src/lib/playerNames.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/playerNames.ts src/lib/playerNames.test.ts
git commit -m "feat(lib): resolvePlayerNames + splitPlayerIds (TDD)"
```

---

## Task 4: Predstavitvena komponenta `LeagueStats.tsx`

**Files:**
- Create: `src/components/LeagueStats.tsx`

Komponenta računa prek enginov (useMemo) in izriše. Sprejme surove podatke + zemljevida imen.

- [ ] **Step 1: Implementiraj komponento**

Ustvari `src/components/LeagueStats.tsx`:

```tsx
import { useMemo, useState } from 'react'
import type {
  LeagueFixture, LeagueMatchResult, LeagueMatchDisciplineResult,
  LeagueSeasonDiscipline, LeagueTeam,
} from '../types'
import { aggregatePlayerStats, calculateRang } from '../engines/leagueStats'
import { playersByDiscipline, teamsByDiscipline, showsAverage } from '../engines/leagueStatsViews'
import type { ResolvedPlayer } from '../lib/playerNames'

type MR = Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }>

interface BaseProps {
  fixtures: LeagueFixture[]
  matchResults: MR
  disciplines: LeagueSeasonDiscipline[]
  teams: LeagueTeam[]
  names: Map<string, ResolvedPlayer>
}

const nameOf = (names: Map<string, ResolvedPlayer>, id: string) => names.get(id)?.full_name ?? id
const clubOf = (names: Map<string, ResolvedPlayer>, id: string) => names.get(id)?.club ?? ''

// ── Statistika (3 podpogledi) ────────────────────────────────────────────────
export function LeagueStatsPanel({ fixtures, matchResults, disciplines, teams, names }: BaseProps) {
  const [view, setView] = useState<'player' | 'playerDisc' | 'teamDisc'>('player')

  const playerStats = useMemo(
    () => aggregatePlayerStats(matchResults, fixtures, disciplines),
    [matchResults, fixtures, disciplines],
  )
  const playerSections = useMemo(
    () => playersByDiscipline(playerStats, disciplines),
    [playerStats, disciplines],
  )
  const teamSections = useMemo(
    () => teamsByDiscipline(teams.map(t => t.id), fixtures, matchResults, disciplines),
    [teams, fixtures, matchResults, disciplines],
  )
  const teamName = useMemo(
    () => Object.fromEntries(teams.map(t => [t.id, t.club_name])) as Record<string, string>,
    [teams],
  )

  const TABS: { key: typeof view; label: string }[] = [
    { key: 'player', label: 'Posameznik' },
    { key: 'playerDisc', label: 'Po disciplinah' },
    { key: 'teamDisc', label: 'Ekipno' },
  ]

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setView(t.key)}
            className={`text-sm px-3 py-1.5 rounded-lg border ${view === t.key ? 'bg-bocce-green text-white border-bocce-green' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {view === 'player' && (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="py-1 w-8">#</th><th>Igralec</th><th>Klub</th>
            <th className="text-right">Odigrano</th><th className="text-right">Točke</th>
          </tr></thead>
          <tbody>
            {playerStats.map((p, i) => (
              <tr key={p.playerId} className="border-b">
                <td className="py-1">{i + 1}</td>
                <td>{nameOf(names, p.playerId)}</td>
                <td className="text-gray-500">{clubOf(names, p.playerId)}</td>
                <td className="text-right">{p.totalPlayed}</td>
                <td className="text-right font-semibold">{p.totalMatchPointsFor}</td>
              </tr>
            ))}
            {playerStats.length === 0 && <tr><td colSpan={5} className="py-2 text-gray-400">Ni podatkov.</td></tr>}
          </tbody>
        </table>
      )}

      {view === 'playerDisc' && (
        <div className="space-y-6">
          {playerSections.filter(s => s.rows.length > 0).map(({ discipline, rows }) => (
            <div key={discipline.id}>
              <h3 className="text-sm font-bold text-gray-700 mb-2">{discipline.name}</h3>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-500 border-b">
                  <th className="py-1">Igralec</th><th className="text-right">Odigrano</th>
                  <th className="text-right">Točke</th>
                  {showsAverage(discipline.discipline_type) && <th className="text-right">Povprečje</th>}
                </tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.playerId} className="border-b">
                      <td className="py-1">{nameOf(names, r.playerId)}</td>
                      <td className="text-right">{r.played}</td>
                      <td className="text-right font-semibold">{r.matchPointsFor}</td>
                      {showsAverage(discipline.discipline_type) && <td className="text-right">{r.average.toFixed(1)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {playerSections.every(s => s.rows.length === 0) && <p className="text-sm text-gray-400">Ni podatkov.</p>}
        </div>
      )}

      {view === 'teamDisc' && (
        <div className="space-y-6">
          {teamSections.filter(s => s.rows.length > 0).map(({ discipline, rows }) => (
            <div key={discipline.id}>
              <h3 className="text-sm font-bold text-gray-700 mb-2">{discipline.name}</h3>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-500 border-b">
                  <th className="py-1">Ekipa</th><th className="text-right">Odigrano</th>
                  <th className="text-right">Točke</th>
                  {showsAverage(discipline.discipline_type) && <th className="text-right">Povprečje</th>}
                </tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.teamId} className="border-b">
                      <td className="py-1">{teamName[r.teamId] ?? r.teamId}</td>
                      <td className="text-right">{r.played}</td>
                      <td className="text-right font-semibold">{r.matchPointsFor}</td>
                      {showsAverage(discipline.discipline_type) && <td className="text-right">{r.average.toFixed(1)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {teamSections.every(s => s.rows.length === 0) && <p className="text-sm text-gray-400">Ni podatkov.</p>}
        </div>
      )}
    </div>
  )
}

// ── Rang (utežena lestvica te lige) ──────────────────────────────────────────
export function LeagueRangPanel({ fixtures, matchResults, disciplines, names, tier }: BaseProps & { tier: string }) {
  const ranking = useMemo(() => {
    const ps = aggregatePlayerStats(matchResults, fixtures, disciplines)
    return ps.map(p => calculateRang(p, tier)).sort((a, b) => b.rang - a.rang)
  }, [matchResults, fixtures, disciplines, tier])

  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-gray-500 border-b">
        <th className="py-1 w-8">#</th><th>Igralec</th><th>Klub</th><th className="text-right">Rang</th>
      </tr></thead>
      <tbody>
        {ranking.map((r, i) => (
          <tr key={r.playerId} className="border-b">
            <td className="py-1">{i + 1}</td>
            <td>{nameOf(names, r.playerId)}</td>
            <td className="text-gray-500">{clubOf(names, r.playerId)}</td>
            <td className="text-right font-semibold">{r.rang.toFixed(2)}</td>
          </tr>
        ))}
        {ranking.length === 0 && <tr><td colSpan={4} className="py-2 text-gray-400">Ni podatkov.</td></tr>}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 2: Preveri prevod**

Run: `npm run build 2>&1 | tail -3`
Expected: build uspe.

- [ ] **Step 3: Commit**

```bash
git add src/components/LeagueStats.tsx
git commit -m "feat(ui): LeagueStats — predstavitev statistike in ranga lige"
```

---

## Task 5: Povezava v `LeagueDetail`

**Files:**
- Modify: `src/pages/League.tsx`

- [ ] **Step 1: Preglej obstoječi `LeagueDetail`**

Run: `grep -n "type tab\|useState<'standings'\|setTab\|async function load\|league_match_results\|discipline\|loadData\|<LeagueTable\|tab ===" src/pages/League.tsx`
Ugotovi: tip stanja zavihkov (`'standings' | 'fixtures' | 'teams'`), funkcijo `load()`, kje se izrisujejo zavihki, in kateri podatki so že v stanju (`season`, `teams`, `fixtures`).

- [ ] **Step 2: Dodaj uvoze**

Na vrh `src/pages/League.tsx` dodaj:
```tsx
import { LeagueStatsPanel, LeagueRangPanel } from '../components/LeagueStats'
import { resolvePlayerNames, type ResolvedPlayer } from '../lib/playerNames'
import type { LeagueMatchResult, LeagueMatchDisciplineResult, LeagueSeasonDiscipline } from '../types'
```
(`LeagueMatchResult` ipd. so morda že uvožene — ne podvajaj.)

- [ ] **Step 3: Razširi stanje in nalaganje v `LeagueDetail`**

Razširi tip zavihka in dodaj stanje:
```tsx
const [tab, setTab] = useState<'standings' | 'fixtures' | 'teams' | 'statistika' | 'rang'>('standings')
const [matchResults, setMatchResults] = useState<Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }>>([])
const [disciplines, setDisciplines] = useState<LeagueSeasonDiscipline[]>([])
const [names, setNames] = useState<Map<string, ResolvedPlayer>>(new Map())
```

V `load()` (kjer se z `Promise.all` naložijo season/teams/fixtures) dodaj poizvedbi za rezultate in discipline ter razreši imena. Za seznam fixture ID-jev uporabi naložene `fixtures`:
```tsx
const { data: discData } = await supabase.from('league_season_disciplines')
  .select('*').eq('season_id', id).order('order_num')
setDisciplines((discData ?? []) as LeagueSeasonDiscipline[])

const { data: mrData } = await supabase.from('league_match_results')
  .select('*, discipline_results:league_match_discipline_results(*)')
  .in('fixture_id', (fixtureData ?? []).map(f => f.id))
const results = (mrData ?? []) as Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }>
setMatchResults(results)

const ids = results.flatMap(r => (r.discipline_results ?? [])
  .flatMap(dr => [...(dr.home_players ?? []), ...(dr.away_players ?? [])]))
  .filter(p => p && !p.startsWith('R: '))
setNames(await resolvePlayerNames(ids))
```
(`fixtureData` je spremenljivka z naloženimi fixture vrsticami v `load()`; če se imenuje drugače, uporabi obstoječe ime.)

- [ ] **Step 4: Dodaj gumba zavihkov**

Kjer so gumbi za `standings | fixtures | teams`, dodaj še dva (uporabi enak razred kot obstoječi gumbi):
```tsx
<button onClick={() => setTab('statistika')} className={tabBtn('statistika')}>Statistika</button>
<button onClick={() => setTab('rang')} className={tabBtn('rang')}>Rang</button>
```
(Če zavihki niso preko pomožne funkcije, posnemaj obstoječ vzorec gumba in pogojni razred.)

- [ ] **Step 5: Dodaj vsebino zavihkov**

Kjer se pogojno izrisuje vsebina (`{tab === 'teams' && ...}`), dodaj:
```tsx
{tab === 'statistika' && season && (
  <LeagueStatsPanel fixtures={fixtures} matchResults={matchResults}
    disciplines={disciplines} teams={teams} names={names} />
)}
{tab === 'rang' && season && (
  <LeagueRangPanel fixtures={fixtures} matchResults={matchResults}
    disciplines={disciplines} teams={teams} names={names} tier={season.tier} />
)}
```

- [ ] **Step 6: Preveri prevod + teste**

Run: `npm run build 2>&1 | tail -3 && npx vitest run 2>&1 | tail -4`
Expected: build uspe; vsi testi zeleni.

- [ ] **Step 7: Commit**

```bash
git add src/pages/League.tsx
git commit -m "feat(ui): zavihka Statistika in Rang na strani lige"
```

---

## Task 6: Zaključna verifikacija + PR

- [ ] **Step 1: Vsi testi + build**

Run: `npx vitest run 2>&1 | tail -4 && npm run build 2>&1 | tail -3`
Expected: vse zeleno; build uspe.

- [ ] **Step 2: Push**

```bash
git push -u origin feature/league-stats
```
Odpri PR prek GitHub (link iz push izpisa).

- [ ] **Step 3: Ročna verifikacija na Vercel preview (javna stran)**

Odpri `/liga/<id aktivne lige>` → zavihek **Statistika**: preklopi Posameznik / Po disciplinah / Ekipno; pri Hitrostno/Natančno/Štafeta/Krog/Bližanje preveri stolpec **Povprečje**. Zavihek **Rang**: igralci razvrščeni po uteženem rangu. Preveri, da imena (UUID) niso prikazana kot surov UUID.

---

## Self-review (povzetek)

- **Pokritost spec-a:** posameznik skupno (Task 4 `player`) · po disciplinah (Task 2 `playersByDiscipline` + Task 4 `playerDisc`) · ekipno po disciplinah (Task 2 `teamsByDiscipline` + Task 4 `teamDisc`) · rang (Task 4 `LeagueRangPanel`) · povprečje za 6 disciplin (Task 2 `showsAverage`) · razrešitev imen (Task 3) · zavihka (Task 5) · skupni /rang nespremenjen (ni v obsegu). ✓
- **Brez nosilcev:** vse kode-stopnje vsebujejo dejansko kodo; Task 5 koraki se sklicujejo na obstoječe spremenljivke v `load()` (preglej v Step 1). ✓
- **Doslednost tipov:** `PlayerSeasonStat`, `DisciplineSection`, `DisciplinePlayerRow`, `DisciplineTeamRow`, `playersByDiscipline`, `teamsByDiscipline`, `showsAverage`, `resolvePlayerNames`, `ResolvedPlayer`, `LeagueStatsPanel`, `LeagueRangPanel` dosledno poimenovani med engini, komponento in stranjo. ✓
