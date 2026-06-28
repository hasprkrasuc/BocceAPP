# Mladinski turnirji — serija (sezona) — načrt implementacije

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mladincem (U14/U18) omogočiti serijo turnirjev, kjer vsak turnir (skupine + izločilni boji) podeli individualne uvrstitvene točke, seštevek najboljših N rezultatov čez serijo pa določi skupnega zmagovalca.

**Architecture:** Razširimo obstoječi turnirski modul. Vodenje posameznega turnirja (skupine + izločilni boji) ostane na obstoječem [`tournament.ts`](../../../src/engines/tournament.ts) in `TournamentEdit`. Dodamo: tabelo serij, dva čista engina (uvrstitve→točke; lestvica najboljših N), data-loader, ki ju poveže s Supabase, ter admin in javne strani.

**Tech Stack:** React 18 + TypeScript + Vite, React Router v6, Supabase (Postgres + RLS), Vitest. Migracije se uveljavijo prek Supabase MCP `apply_migration` (projekt `jzpzigjljwufdnqcjtjb`).

**Spec:** [docs/superpowers/specs/2026-06-28-mladinski-turnirji-serija-design.md](../specs/2026-06-28-mladinski-turnirji-serija-design.md)

---

## Struktura datotek

| Datoteka | Odgovornost |
|---|---|
| `supabase/migrations/20260628_youth_tournament_series.sql` | Nova tabela `tournament_series`, stolpca na `tournaments`, `player2_id` nullable, RLS |
| `src/types.ts` (modify) | `TournamentSeries`; `series_id`+`discipline_type` na `Tournament`; `player2_id` nullable |
| `src/engines/tournamentPlacement.ts` (create) | Čista funkcija: tekme → uvrstitveni koš → točke po igralcih |
| `src/engines/tournamentPlacement.test.ts` (create) | Testi enginea uvrstitev |
| `src/engines/tournamentSeries.ts` (create) | Čista funkcija: najboljših N od M → lestvica |
| `src/engines/tournamentSeries.test.ts` (create) | Testi enginea lestvice |
| `src/lib/series.ts` (create) | Data-loader: iz Supabase pridobi turnirje serije in izračuna lestvico |
| `src/pages/admin/SeriesAdmin.tsx` (create) | Admin: seznam + ustvarjanje serij |
| `src/pages/admin/SeriesEdit.tsx` (create) | Admin: turnirji v seriji + lestvica |
| `src/pages/Series.tsx` (create) | Javno: seznam serij + lestvica serije |
| `src/pages/admin/TournamentEdit.tsx` (modify) | Prijava z enim igralcem pri posamezni disciplini |
| `src/App.tsx` (modify) | Nove poti |
| `src/pages/admin/AdminDashboard.tsx` (modify) | Povezava do `/admin/serije` |

---

## Task 1: DB migracija

**Files:**
- Create: `supabase/migrations/20260628_youth_tournament_series.sql`

- [ ] **Step 1: Napiši migracijo**

Ustvari `supabase/migrations/20260628_youth_tournament_series.sql`:

```sql
-- Serija mladinskih turnirjev (sezona)
create table if not exists public.tournament_series (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year int not null,
  category text not null check (category in ('u14','u18')),
  counting_results int,                         -- N najboljših; null = vsi štejejo
  status text not null default 'draft' check (status in ('draft','active','completed')),
  created_at timestamptz not null default now()
);

alter table public.tournaments
  add column if not exists series_id uuid references public.tournament_series(id) on delete set null,
  add column if not exists discipline_type text;

-- Posamezne discipline = 1 igralec na vpis
alter table public.tournament_registrations
  alter column player2_id drop not null;

-- RLS (preslikano po obstoječih tournaments politikah)
alter table public.tournament_series enable row level security;

create policy "Javno branje" on public.tournament_series
  for select using (true);

create policy "Admin pisanje serije" on public.tournament_series
  for all using (
    auth.uid() in (select id from public.users where role = any (array['admin','super_admin']))
  );
```

- [ ] **Step 2: Uveljavi migracijo**

Uveljavi prek Supabase MCP `apply_migration` (project_id `jzpzigjljwufdnqcjtjb`, name `youth_tournament_series`, query = vsebina datoteke zgoraj).

- [ ] **Step 3: Preveri**

Z `execute_sql` poženi:
```sql
select column_name from information_schema.columns
where table_name='tournaments' and column_name in ('series_id','discipline_type');
select is_nullable from information_schema.columns
where table_name='tournament_registrations' and column_name='player2_id';
```
Pričakovano: oba stolpca prisotna; `is_nullable = YES`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260628_youth_tournament_series.sql
git commit -m "feat(db): tournament_series + series_id/discipline_type + player2 nullable"
```

---

## Task 2: Tipi

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Dodaj `TournamentSeries` in razširi `Tournament`/`TournamentRegistration`**

V `src/types.ts` dodaj nov vmesnik (za ostale `Tournament*`):

```ts
export type TournamentSeriesStatus = 'draft' | 'active' | 'completed'

export interface TournamentSeries {
  id: string
  name: string
  year: number
  category: 'u14' | 'u18'
  counting_results: number | null
  status: TournamentSeriesStatus
  created_at: string
}
```

V vmesniku `Tournament` dodaj dve polji (poleg obstoječih):

```ts
  series_id: string | null
  discipline_type: DisciplineType | null
```

V vmesniku `TournamentRegistration` spremeni:

```ts
  player2_id: string | null
```

`DisciplineType` je že izvožen v `src/types.ts`.

- [ ] **Step 2: Preveri prevod**

Run: `npx tsc --noEmit 2>&1 | grep -E "types.ts|player2_id" || echo "OK"`
Expected: brez NOVIH napak vezanih na te spremembe (obstoječe nepovezane napake ostanejo).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): TournamentSeries + series polja na Tournament"
```

---

## Task 3: Engine `tournamentPlacement.ts` (TDD)

**Files:**
- Create: `src/engines/tournamentPlacement.ts`
- Test: `src/engines/tournamentPlacement.test.ts`

Engine pretvori zaključene IZLOČILNE tekme v uvrstitvene koše in razširi na posameznike.
Vhod je preprost (ID-ji `group_teams`), zato je enostavno testljiv:

```ts
export type PlacementBucket = 1 | 2 | 3 | 4 | '5-8' | '9-16'

export interface PlacementInput {
  registrations: { id: string; player1_id: string; player2_id: string | null }[]
  groupTeams: { id: string; registration_id: string }[]
  // samo zaključene izločilne tekme (stage med 'r16' | 'qf' | 'sf' | 'final' | 'third_place')
  knockoutMatches: {
    stage: string
    team_a_id: string | null
    team_b_id: string | null
    winner_id: string | null
  }[]
}

export interface PlayerPoints {
  player_id: string
  points: number
  bucket: PlacementBucket
}
```

- [ ] **Step 1: Napiši padajoče teste**

Ustvari `src/engines/tournamentPlacement.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import {
  bucketPoints, isPairDiscipline, tournamentPlayerPoints, PLACEMENT_POINTS,
} from './tournamentPlacement'

describe('bucketPoints', () => {
  test('preslika koše v točke po tabeli (16/10/8/7/3/1)', () => {
    expect(bucketPoints(1)).toBe(16)
    expect(bucketPoints(2)).toBe(10)
    expect(bucketPoints(3)).toBe(8)
    expect(bucketPoints(4)).toBe(7)
    expect(bucketPoints('5-8')).toBe(3)
    expect(bucketPoints('9-16')).toBe(1)
  })
  test('PLACEMENT_POINTS je izvožen za prikaz', () => {
    expect(PLACEMENT_POINTS.p1).toBe(16)
    expect(PLACEMENT_POINTS.p9_16).toBe(1)
  })
})

describe('isPairDiscipline', () => {
  test('dvojka in štafeta sta para', () => {
    expect(isPairDiscipline('dvojka')).toBe(true)
    expect(isPairDiscipline('stafeta')).toBe(true)
  })
  test('posamezne discipline niso para', () => {
    for (const d of ['posamezno', 'hitrostno', 'natancno', 'blizanje', 'blizanje_krog', 'krog'] as const) {
      expect(isPairDiscipline(d)).toBe(false)
    }
  })
})

describe('tournamentPlayerPoints', () => {
  // 8 prijav (r1..r8), group_teams gt1..gt8, izločilni boji od četrtfinala
  const registrations = Array.from({ length: 8 }, (_, i) => ({
    id: `r${i + 1}`, player1_id: `p${i + 1}`, player2_id: null,
  }))
  const groupTeams = Array.from({ length: 8 }, (_, i) => ({
    id: `gt${i + 1}`, registration_id: `r${i + 1}`,
  }))
  // qf: gt1>gt8, gt2>gt7, gt3>gt6, gt4>gt5  → poraženci gt5..gt8 = 5-8
  // sf: gt1>gt2, gt3>gt4
  // final: gt1>gt3 ; za 3. mesto: gt2>gt4
  const knockoutMatches = [
    { stage: 'qf', team_a_id: 'gt1', team_b_id: 'gt8', winner_id: 'gt1' },
    { stage: 'qf', team_a_id: 'gt2', team_b_id: 'gt7', winner_id: 'gt2' },
    { stage: 'qf', team_a_id: 'gt3', team_b_id: 'gt6', winner_id: 'gt3' },
    { stage: 'qf', team_a_id: 'gt4', team_b_id: 'gt5', winner_id: 'gt4' },
    { stage: 'sf', team_a_id: 'gt1', team_b_id: 'gt2', winner_id: 'gt1' },
    { stage: 'sf', team_a_id: 'gt3', team_b_id: 'gt4', winner_id: 'gt3' },
    { stage: 'final', team_a_id: 'gt1', team_b_id: 'gt3', winner_id: 'gt1' },
    { stage: 'third_place', team_a_id: 'gt2', team_b_id: 'gt4', winner_id: 'gt2' },
  ]

  test('določi mesta 1–4 iz finala in tekme za 3. mesto', () => {
    const pts = tournamentPlayerPoints({ registrations, groupTeams, knockoutMatches })
    const byPlayer = Object.fromEntries(pts.map(p => [p.player_id, p]))
    expect(byPlayer['p1'].bucket).toBe(1); expect(byPlayer['p1'].points).toBe(16)
    expect(byPlayer['p3'].bucket).toBe(2); expect(byPlayer['p3'].points).toBe(10)
    expect(byPlayer['p2'].bucket).toBe(3); expect(byPlayer['p2'].points).toBe(8)
    expect(byPlayer['p4'].bucket).toBe(4); expect(byPlayer['p4'].points).toBe(7)
  })

  test('poraženci četrtfinala dobijo 5–8 (3 točke)', () => {
    const pts = tournamentPlayerPoints({ registrations, groupTeams, knockoutMatches })
    for (const p of ['p5', 'p6', 'p7', 'p8']) {
      const e = pts.find(x => x.player_id === p)!
      expect(e.bucket).toBe('5-8'); expect(e.points).toBe(3)
    }
  })

  test('neuvrščeni iz skupin (niso v izločilnih bojih) dobijo 9–16 (1 točka)', () => {
    const regs = [...registrations, { id: 'r9', player1_id: 'p9', player2_id: null }]
    const gts = [...groupTeams, { id: 'gt9', registration_id: 'r9' }]
    const pts = tournamentPlayerPoints({ registrations: regs, groupTeams: gts, knockoutMatches })
    const e = pts.find(x => x.player_id === 'p9')!
    expect(e.bucket).toBe('9-16'); expect(e.points).toBe(1)
  })

  test('par (dvojka/štafeta): oba člana dobita iste točke, vsak svojo vrstico', () => {
    const regs = [{ id: 'r1', player1_id: 'pa', player2_id: 'pb' }]
    const gts = [{ id: 'gt1', registration_id: 'r1' }]
    // edina prijava brez izločilnih bojev → 9-16
    const pts = tournamentPlayerPoints({ registrations: regs, groupTeams: gts, knockoutMatches: [] })
    expect(pts).toHaveLength(2)
    expect(pts.map(p => p.player_id).sort()).toEqual(['pa', 'pb'])
    expect(pts.every(p => p.points === 1)).toBe(true)
  })
})
```

- [ ] **Step 2: Poženi teste — pričakuj neuspeh**

Run: `npx vitest run src/engines/tournamentPlacement.test.ts`
Expected: FAIL (modul `./tournamentPlacement` ne obstaja).

- [ ] **Step 3: Implementiraj engine**

Ustvari `src/engines/tournamentPlacement.ts`:

```ts
import type { DisciplineType } from '../types'

export const PLACEMENT_POINTS = { p1: 16, p2: 10, p3: 8, p4: 7, p5_8: 3, p9_16: 1 } as const

export type PlacementBucket = 1 | 2 | 3 | 4 | '5-8' | '9-16'

export interface PlacementInput {
  registrations: { id: string; player1_id: string; player2_id: string | null }[]
  groupTeams: { id: string; registration_id: string }[]
  knockoutMatches: {
    stage: string
    team_a_id: string | null
    team_b_id: string | null
    winner_id: string | null
  }[]
}

export interface PlayerPoints {
  player_id: string
  points: number
  bucket: PlacementBucket
}

const PAIR_DISCIPLINES: ReadonlySet<DisciplineType> = new Set(['dvojka', 'stafeta'])

export function isPairDiscipline(d: DisciplineType): boolean {
  return PAIR_DISCIPLINES.has(d)
}

export function bucketPoints(bucket: PlacementBucket): number {
  switch (bucket) {
    case 1: return PLACEMENT_POINTS.p1
    case 2: return PLACEMENT_POINTS.p2
    case 3: return PLACEMENT_POINTS.p3
    case 4: return PLACEMENT_POINTS.p4
    case '5-8': return PLACEMENT_POINTS.p5_8
    case '9-16': return PLACEMENT_POINTS.p9_16
  }
}

export function tournamentPlayerPoints(input: PlacementInput): PlayerPoints[] {
  const { registrations, groupTeams, knockoutMatches } = input
  const regOfGt = new Map(groupTeams.map(gt => [gt.id, gt.registration_id]))
  const loserGt = (m: PlacementInput['knockoutMatches'][number]): string | null => {
    if (!m.winner_id) return null
    return m.winner_id === m.team_a_id ? m.team_b_id : m.team_a_id
  }

  const bucketByReg = new Map<string, PlacementBucket>()
  const assign = (regId: string | undefined, b: PlacementBucket) => {
    if (regId && !bucketByReg.has(regId)) bucketByReg.set(regId, b)
  }

  const final = knockoutMatches.find(m => m.stage === 'final' && m.winner_id)
  if (final) {
    assign(regOfGt.get(final.winner_id!), 1)
    assign(regOfGt.get(loserGt(final)!), 2)
  }
  const third = knockoutMatches.find(m => m.stage === 'third_place' && m.winner_id)
  if (third) {
    assign(regOfGt.get(third.winner_id!), 3)
    assign(regOfGt.get(loserGt(third)!), 4)
  }
  for (const m of knockoutMatches.filter(m => m.stage === 'qf' && m.winner_id)) {
    assign(regOfGt.get(loserGt(m)!), '5-8')
  }
  // vse ostale prijave (poraženci r16 + neuvrščeni iz skupin)
  for (const r of registrations) assign(r.id, '9-16')

  const out: PlayerPoints[] = []
  for (const r of registrations) {
    const bucket = bucketByReg.get(r.id)!
    const points = bucketPoints(bucket)
    out.push({ player_id: r.player1_id, points, bucket })
    if (r.player2_id) out.push({ player_id: r.player2_id, points, bucket })
  }
  return out
}
```

- [ ] **Step 4: Poženi teste — pričakuj uspeh**

Run: `npx vitest run src/engines/tournamentPlacement.test.ts`
Expected: PASS (vsi testi).

- [ ] **Step 5: Commit**

```bash
git add src/engines/tournamentPlacement.ts src/engines/tournamentPlacement.test.ts
git commit -m "feat(engine): tournamentPlacement — uvrstitve v točke po igralcih (TDD)"
```

---

## Task 4: Engine `tournamentSeries.ts` (TDD)

**Files:**
- Create: `src/engines/tournamentSeries.ts`
- Test: `src/engines/tournamentSeries.test.ts`

- [ ] **Step 1: Napiši padajoče teste**

Ustvari `src/engines/tournamentSeries.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { seriesStandings } from './tournamentSeries'

describe('seriesStandings', () => {
  test('sešteje vse rezultate, ko countBest = null', () => {
    const rows = [
      { player_id: 'a', points: 16 },
      { player_id: 'a', points: 10 },
      { player_id: 'b', points: 8 },
    ]
    const s = seriesStandings(rows, null)
    expect(s[0]).toMatchObject({ player_id: 'a', total: 26, tournaments_played: 2 })
    expect(s[1]).toMatchObject({ player_id: 'b', total: 8, tournaments_played: 1 })
  })

  test('upošteva samo najboljših N in odbije najslabše', () => {
    const rows = [
      { player_id: 'a', points: 16 },
      { player_id: 'a', points: 3 },
      { player_id: 'a', points: 10 },
    ]
    const s = seriesStandings(rows, 2)
    expect(s[0].counted.slice().sort((x, y) => y - x)).toEqual([16, 10])
    expect(s[0].dropped).toEqual([3])
    expect(s[0].total).toBe(26)
    expect(s[0].tournaments_played).toBe(3)
  })

  test('razvrsti padajoče po skupnih točkah', () => {
    const rows = [
      { player_id: 'a', points: 7 },
      { player_id: 'b', points: 16 },
      { player_id: 'c', points: 10 },
    ]
    const s = seriesStandings(rows, null)
    expect(s.map(r => r.player_id)).toEqual(['b', 'c', 'a'])
  })

  test('countBest večji od števila rezultatov šteje vse', () => {
    const rows = [{ player_id: 'a', points: 8 }]
    const s = seriesStandings(rows, 4)
    expect(s[0].total).toBe(8)
    expect(s[0].dropped).toEqual([])
  })
})
```

- [ ] **Step 2: Poženi teste — pričakuj neuspeh**

Run: `npx vitest run src/engines/tournamentSeries.test.ts`
Expected: FAIL (modul ne obstaja).

- [ ] **Step 3: Implementiraj engine**

Ustvari `src/engines/tournamentSeries.ts`:

```ts
export interface SeriesPlayerResult {
  player_id: string
  total: number
  counted: number[]
  dropped: number[]
  tournaments_played: number
}

/**
 * Združi točke igralca čez vse turnirje serije in uporabi "najboljših N".
 * @param perTournament  ena vrstica na (igralec, turnir)
 * @param countBest      N najboljših rezultatov; null = štejejo vsi
 */
export function seriesStandings(
  perTournament: { player_id: string; points: number }[],
  countBest: number | null,
): SeriesPlayerResult[] {
  const byPlayer = new Map<string, number[]>()
  for (const row of perTournament) {
    const arr = byPlayer.get(row.player_id) ?? []
    arr.push(row.points)
    byPlayer.set(row.player_id, arr)
  }

  const results: SeriesPlayerResult[] = []
  for (const [player_id, pointsArr] of byPlayer) {
    const sorted = [...pointsArr].sort((a, b) => b - a)
    const n = countBest == null ? sorted.length : Math.min(countBest, sorted.length)
    const counted = sorted.slice(0, n)
    const dropped = sorted.slice(n)
    results.push({
      player_id,
      total: counted.reduce((s, p) => s + p, 0),
      counted,
      dropped,
      tournaments_played: pointsArr.length,
    })
  }

  return results.sort(
    (a, b) =>
      b.total - a.total ||
      b.tournaments_played - a.tournaments_played ||
      a.player_id.localeCompare(b.player_id),
  )
}
```

- [ ] **Step 4: Poženi teste — pričakuj uspeh**

Run: `npx vitest run src/engines/tournamentSeries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/tournamentSeries.ts src/engines/tournamentSeries.test.ts
git commit -m "feat(engine): tournamentSeries — lestvica najboljših N (TDD)"
```

---

## Task 5: Data-loader `src/lib/series.ts`

**Files:**
- Create: `src/lib/series.ts`

Poveže Supabase z engini. Uporabljata ga admin in javna stran (DRY).

- [ ] **Step 1: Implementiraj loader**

Ustvari `src/lib/series.ts`:

```ts
import { supabase } from '../supabase'
import { tournamentPlayerPoints } from '../engines/tournamentPlacement'
import { seriesStandings, type SeriesPlayerResult } from '../engines/tournamentSeries'
import type { TournamentSeries } from '../types'

export interface SeriesStandingRow extends SeriesPlayerResult {
  full_name: string | null
}

/** Izračuna lestvico serije iz vseh ZAKLJUČENIH turnirjev v njej. */
export async function loadSeriesStandings(series: TournamentSeries): Promise<SeriesStandingRow[]> {
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id')
    .eq('series_id', series.id)
    .eq('status', 'completed')

  const perTournament: { player_id: string; points: number }[] = []

  for (const t of tournaments ?? []) {
    const [{ data: regs }, { data: groups }, { data: matches }] = await Promise.all([
      supabase.from('tournament_registrations')
        .select('id, player1_id, player2_id')
        .eq('tournament_id', t.id).eq('status', 'confirmed'),
      supabase.from('tournament_groups')
        .select('id, group_teams(id, registration_id)')
        .eq('tournament_id', t.id),
      supabase.from('matches')
        .select('stage, team_a_id, team_b_id, winner_id')
        .eq('tournament_id', t.id).neq('stage', 'group').eq('status', 'completed'),
    ])

    const groupTeams = (groups ?? []).flatMap(g =>
      (g.group_teams ?? []).map((gt: { id: string; registration_id: string }) => gt))

    const pts = tournamentPlayerPoints({
      registrations: regs ?? [],
      groupTeams,
      knockoutMatches: matches ?? [],
    })
    perTournament.push(...pts.map(p => ({ player_id: p.player_id, points: p.points })))
  }

  const standings = seriesStandings(perTournament, series.counting_results)

  // pridruži imena
  const ids = standings.map(s => s.player_id)
  const { data: users } = ids.length
    ? await supabase.from('users').select('id, full_name').in('id', ids)
    : { data: [] as { id: string; full_name: string | null }[] }
  const nameById = new Map((users ?? []).map(u => [u.id, u.full_name]))

  return standings.map(s => ({ ...s, full_name: nameById.get(s.player_id) ?? null }))
}
```

- [ ] **Step 2: Preveri prevod**

Run: `npm run build 2>&1 | tail -3`
Expected: `built in ...` (build uspe).

- [ ] **Step 3: Commit**

```bash
git add src/lib/series.ts
git commit -m "feat(lib): loadSeriesStandings — poveže Supabase z engini"
```

---

## Task 6: Poti in admin povezava

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/admin/AdminDashboard.tsx`

- [ ] **Step 1: Dodaj poti v `src/App.tsx`**

Ob obstoječih turnirskih poteh dodaj uvoze in poti (znotraj `<Routes>`). Javne:
```tsx
import Series from './pages/Series'
// ...
<Route path="/serije" element={<Series />} />
<Route path="/serija/:id" element={<Series />} />
```
Admin (poleg `/admin/turnirji`):
```tsx
import SeriesAdmin from './pages/admin/SeriesAdmin'
import SeriesEdit from './pages/admin/SeriesEdit'
// ...
<Route path="/admin/serije" element={<SeriesAdmin />} />
<Route path="/admin/serija/:id" element={<SeriesEdit />} />
```
> Opomba: te 4 strani nastanejo v Task 7–9. Da prevod ne pade vmes, ta task izvedi **po** Task 7–9 ali pa začasno zakomentiraj poti. Priporočeno: izvedi Task 7–9, nato ta task.

- [ ] **Step 2: Dodaj povezavo v `AdminDashboard.tsx`**

Poleg obstoječe povezave do `/admin/turnirji` dodaj kartico/povezavo:
```tsx
<Link to="/admin/serije" className="...">Mladinske serije</Link>
```
(uporabi enak razred kot sosednje admin povezave).

- [ ] **Step 3: Preveri**

Run: `npm run build 2>&1 | tail -3`
Expected: build uspe.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/pages/admin/AdminDashboard.tsx
git commit -m "feat(routing): poti za serije + admin povezava"
```

---

## Task 7: Admin — seznam in ustvarjanje serij (`SeriesAdmin.tsx`)

**Files:**
- Create: `src/pages/admin/SeriesAdmin.tsx`

- [ ] **Step 1: Implementiraj stran**

Ustvari `src/pages/admin/SeriesAdmin.tsx` (vzorec po `TournamentAdmin.tsx` — enaka uporaba `supabase`, `useState`, `Link`):

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabase'
import type { TournamentSeries } from '../../types'

export default function SeriesAdmin() {
  const [series, setSeries] = useState<TournamentSeries[]>([])
  const [form, setForm] = useState({ name: '', year: new Date().getFullYear(), category: 'u14' as 'u14' | 'u18', counting_results: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('tournament_series').select('*').order('year', { ascending: false }).order('name')
    setSeries((data ?? []) as TournamentSeries[])
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await supabase.from('tournament_series').insert({
      name: form.name, year: form.year, category: form.category,
      counting_results: form.counting_results === '' ? null : Number(form.counting_results),
      status: 'draft',
    })
    setForm({ name: '', year: new Date().getFullYear(), category: 'u14', counting_results: '' })
    setLoading(false)
    load()
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-xl font-bold mb-4">Mladinske serije</h1>

      <form onSubmit={create} className="bg-gray-50 border rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end">
        <input required placeholder="Ime serije" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="flex-1 min-w-[200px] border rounded-lg px-3 py-2 text-sm" />
        <input type="number" value={form.year}
          onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))}
          className="w-24 border rounded-lg px-3 py-2 text-sm" />
        <select value={form.category}
          onChange={e => setForm(f => ({ ...f, category: e.target.value as 'u14' | 'u18' }))}
          className="border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="u14">U14</option>
          <option value="u18">U18</option>
        </select>
        <input type="number" min={1} placeholder="N (najboljših; prazno = vsi)" value={form.counting_results}
          onChange={e => setForm(f => ({ ...f, counting_results: e.target.value }))}
          className="w-44 border rounded-lg px-3 py-2 text-sm" title="Najboljših N rezultatov" />
        <button disabled={loading} className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          Ustvari serijo
        </button>
      </form>

      <div className="space-y-2">
        {series.map(s => (
          <Link key={s.id} to={`/admin/serija/${s.id}`}
            className="block bg-white border rounded-xl px-4 py-3 hover:bg-gray-50">
            <span className="font-semibold">{s.name}</span>
            <span className="ml-2 text-xs text-gray-500">{s.category.toUpperCase()} · {s.year} · {s.counting_results ? `najboljših ${s.counting_results}` : 'vsi štejejo'} · {s.status}</span>
          </Link>
        ))}
        {series.length === 0 && <p className="text-sm text-gray-400">Ni serij.</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Preveri**

Run: `npm run build 2>&1 | tail -3`
Expected: build uspe.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/SeriesAdmin.tsx
git commit -m "feat(admin): SeriesAdmin — seznam in ustvarjanje serij"
```

---

## Task 8: Admin — urejanje serije (`SeriesEdit.tsx`)

**Files:**
- Create: `src/pages/admin/SeriesEdit.tsx`

Stran prikaže turnirje serije, omogoči **ustvarjanje turnirja v seriji** (z disciplino) in prikaže **lestvico** (prek `loadSeriesStandings`).

- [ ] **Step 1: Implementiraj stran**

Ustvari `src/pages/admin/SeriesEdit.tsx`:

```tsx
import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../supabase'
import { loadSeriesStandings, type SeriesStandingRow } from '../../lib/series'
import type { TournamentSeries, Tournament, DisciplineType } from '../../types'

const YOUTH_DISCIPLINES: { value: DisciplineType; label: string }[] = [
  { value: 'posamezno', label: 'Posamezno' },
  { value: 'dvojka', label: 'Dvojka' },
  { value: 'hitrostno', label: 'Hitrostno izbijanje' },
  { value: 'natancno', label: 'Natančno izbijanje' },
  { value: 'blizanje', label: 'Natančno bližanje' },
  { value: 'blizanje_krog', label: 'Bližanje v krog' },
  { value: 'krog', label: 'Krog' },
  { value: 'stafeta', label: 'Štafeta' },
]

export default function SeriesEdit() {
  const { id } = useParams<{ id: string }>()
  const [series, setSeries] = useState<TournamentSeries | null>(null)
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [standings, setStandings] = useState<SeriesStandingRow[]>([])
  const [form, setForm] = useState({ name: '', date: '', location: '', discipline_type: 'posamezno' as DisciplineType })

  const load = useCallback(async () => {
    if (!id) return
    const { data: s } = await supabase.from('tournament_series').select('*').eq('id', id).single()
    setSeries(s as TournamentSeries)
    const { data: ts } = await supabase.from('tournaments').select('*').eq('series_id', id).order('date')
    setTournaments((ts ?? []) as Tournament[])
    if (s) setStandings(await loadSeriesStandings(s as TournamentSeries))
  }, [id])
  useEffect(() => { load() }, [load])

  async function addTournament(e: React.FormEvent) {
    e.preventDefault()
    if (!series) return
    await supabase.from('tournaments').insert({
      name: form.name, date: form.date, location: form.location,
      category: series.category, status: 'draft', group_size: 4,
      series_id: series.id, discipline_type: form.discipline_type,
    })
    setForm({ name: '', date: '', location: '', discipline_type: 'posamezno' })
    load()
  }

  if (!series) return <div className="p-6">Nalagam…</div>

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link to="/admin/serije" className="text-sm text-gray-500">← Serije</Link>
      <h1 className="text-xl font-bold mb-1">{series.name}</h1>
      <p className="text-xs text-gray-500 mb-6">{series.category.toUpperCase()} · {series.year} · {series.counting_results ? `najboljših ${series.counting_results}` : 'vsi štejejo'}</p>

      <h2 className="font-semibold mb-2">Turnirji v seriji</h2>
      <form onSubmit={addTournament} className="bg-gray-50 border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <input required placeholder="Ime turnirja" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="flex-1 min-w-[160px] border rounded-lg px-3 py-2 text-sm" />
        <input required type="date" value={form.date}
          onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          className="border rounded-lg px-3 py-2 text-sm" />
        <input placeholder="Kraj" value={form.location}
          onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
          className="w-32 border rounded-lg px-3 py-2 text-sm" />
        <select value={form.discipline_type}
          onChange={e => setForm(f => ({ ...f, discipline_type: e.target.value as DisciplineType }))}
          className="border rounded-lg px-3 py-2 text-sm bg-white">
          {YOUTH_DISCIPLINES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <button className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm">Dodaj turnir</button>
      </form>

      <div className="space-y-2 mb-8">
        {tournaments.map(t => (
          <Link key={t.id} to={`/admin/turnir/${t.id}`} className="block bg-white border rounded-xl px-4 py-2 hover:bg-gray-50 text-sm">
            <span className="font-medium">{t.name}</span>
            <span className="ml-2 text-xs text-gray-500">{t.date} · {YOUTH_DISCIPLINES.find(d => d.value === t.discipline_type)?.label ?? t.discipline_type} · {t.status}</span>
          </Link>
        ))}
        {tournaments.length === 0 && <p className="text-sm text-gray-400">Ni turnirjev.</p>}
      </div>

      <h2 className="font-semibold mb-2">Lestvica serije</h2>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-gray-500 border-b">
          <th className="py-1 w-10">#</th><th>Igralec</th><th className="text-right">Točke</th><th className="text-right">Turnirjev</th>
        </tr></thead>
        <tbody>
          {standings.map((r, i) => (
            <tr key={r.player_id} className="border-b">
              <td className="py-1">{i + 1}</td>
              <td>{r.full_name ?? r.player_id}</td>
              <td className="text-right font-semibold">{r.total}</td>
              <td className="text-right text-gray-500">{r.tournaments_played}</td>
            </tr>
          ))}
          {standings.length === 0 && <tr><td colSpan={4} className="py-2 text-gray-400">Še ni zaključenih turnirjev.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Preveri**

Run: `npm run build 2>&1 | tail -3`
Expected: build uspe.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/SeriesEdit.tsx
git commit -m "feat(admin): SeriesEdit — turnirji serije + lestvica"
```

---

## Task 9: Javna stran serij (`Series.tsx`)

**Files:**
- Create: `src/pages/Series.tsx`

Ena komponenta z dvema načinoma glede na prisotnost `:id` (vzorec po `Tournament.tsx`).

- [ ] **Step 1: Implementiraj stran**

Ustvari `src/pages/Series.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { loadSeriesStandings, type SeriesStandingRow } from '../lib/series'
import type { TournamentSeries } from '../types'

export default function Series() {
  const { id } = useParams<{ id: string }>()
  return id ? <SeriesDetail id={id} /> : <SeriesList />
}

function SeriesList() {
  const [series, setSeries] = useState<TournamentSeries[]>([])
  useEffect(() => {
    supabase.from('tournament_series').select('*').neq('status', 'draft')
      .order('year', { ascending: false }).then(({ data }) => setSeries((data ?? []) as TournamentSeries[]))
  }, [])
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-bold mb-4">Mladinske serije</h1>
      <div className="space-y-2">
        {series.map(s => (
          <Link key={s.id} to={`/serija/${s.id}`} className="block bg-white border rounded-xl px-4 py-3 hover:bg-gray-50">
            <span className="font-semibold">{s.name}</span>
            <span className="ml-2 text-xs text-gray-500">{s.category.toUpperCase()} · {s.year}</span>
          </Link>
        ))}
        {series.length === 0 && <p className="text-sm text-gray-400">Ni objavljenih serij.</p>}
      </div>
    </div>
  )
}

function SeriesDetail({ id }: { id: string }) {
  const [series, setSeries] = useState<TournamentSeries | null>(null)
  const [standings, setStandings] = useState<SeriesStandingRow[]>([])
  useEffect(() => {
    supabase.from('tournament_series').select('*').eq('id', id).single().then(async ({ data }) => {
      if (!data) return
      setSeries(data as TournamentSeries)
      setStandings(await loadSeriesStandings(data as TournamentSeries))
    })
  }, [id])
  if (!series) return <div className="p-6">Nalagam…</div>
  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link to="/serije" className="text-sm text-gray-500">← Serije</Link>
      <h1 className="text-xl font-bold mb-1">{series.name}</h1>
      <p className="text-xs text-gray-500 mb-6">{series.category.toUpperCase()} · {series.year} · {series.counting_results ? `najboljših ${series.counting_results}` : 'vsi štejejo'}</p>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-gray-500 border-b">
          <th className="py-1 w-10">#</th><th>Igralec</th><th className="text-right">Točke</th><th className="text-right">Turnirjev</th>
        </tr></thead>
        <tbody>
          {standings.map((r, i) => (
            <tr key={r.player_id} className="border-b">
              <td className="py-1">{i + 1}</td><td>{r.full_name ?? '—'}</td>
              <td className="text-right font-semibold">{r.total}</td>
              <td className="text-right text-gray-500">{r.tournaments_played}</td>
            </tr>
          ))}
          {standings.length === 0 && <tr><td colSpan={4} className="py-2 text-gray-400">Še ni rezultatov.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Preveri**

Run: `npm run build 2>&1 | tail -3`
Expected: build uspe.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Series.tsx
git commit -m "feat(public): Series — seznam serij + lestvica"
```

---

## Task 10: Prijava z enim igralcem pri posamezni disciplini

**Files:**
- Modify: `src/pages/admin/TournamentEdit.tsx`

Pri turnirjih s posamezno disciplino mora admin prijaviti **samo enega** igralca
(`player2_id = null`). Pri dvojki/štafeti ostane dvojni vnos.

- [ ] **Step 1: Preberi obstoječi vnos prijave**

Run: `grep -n "player2_id\|player1_id\|discipline_type\|tournament_registrations" src/pages/admin/TournamentEdit.tsx`
Ugotovi, kje se ustvari prijava (insert v `tournament_registrations`) in kako se hrani izbrani igralec(a).

- [ ] **Step 2: Naloži tudi disciplino turnirja**

Tam, kjer se naloži turnir (`supabase.from('tournaments').select(...).eq('id', id)`), zagotovi, da je v izbiri tudi `discipline_type` (če je `select('*')`, je že vključen). Izpelji:
```tsx
import { isPairDiscipline } from '../../engines/tournamentPlacement'
// ...
const isPair = tournament?.discipline_type ? isPairDiscipline(tournament.discipline_type) : true
```
(privzeto `true`, da navadni turnirji brez `discipline_type` ostanejo dvojni.)

- [ ] **Step 3: Pogojno prikaži drugi izbirnik in shrani null**

V obrazcu za dodajanje prijave drugi izbirnik igralca prikaži samo, če `isPair`.
V insertu nastavi:
```tsx
player2_id: isPair ? player2Id : null,
```
(`player2Id` je obstoječe stanje za drugega igralca; pri ne-paru ga ne uporabimo.)

- [ ] **Step 4: Preveri**

Run: `npm run build 2>&1 | tail -3`
Expected: build uspe.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/TournamentEdit.tsx
git commit -m "feat(admin): prijava z enim igralcem pri posamezni disciplini"
```

---

## Task 11: Zaključna verifikacija + PR

- [ ] **Step 1: Vsi testi**

Run: `npx vitest run`
Expected: vse zeleno (vključno z `tournamentPlacement` in `tournamentSeries`).

- [ ] **Step 2: Build**

Run: `npm run build 2>&1 | tail -3`
Expected: `built in ...`.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feature/youth-tournament-series
```
Odpri PR prek GitHub spletnega vmesnika (link iz push izpisa). Po mergu Vercel deploya.

- [ ] **Step 4: Ročna verifikacija na Vercel preview (admin seja)**

1. `/admin/serije` → ustvari serijo (U14, N=4).
2. V seriji ustvari turnir (npr. Posamezno) → odpri `/admin/turnir/:id` → dodaj ≤16 prijav (en igralec), izvedi žreb skupin, vnesi rezultate, zaključi izločilne boje, turnir → status `completed`.
3. Nazaj na `/admin/serija/:id` → preveri, da lestvica prikaže točke (zmagovalec 16, …).
4. Ustvari turnir z **dvojko** → potrdi, da prijava zahteva dva igralca in da oba dobita točke.
5. `/serija/:id` (javno) → lestvica vidna.

---

## Self-review (povzetek)

- **Pokritost spec-a:** vpis 1/2 igralca (Task 10, isPairDiscipline) · točkovna tabela (Task 3) · max 16 / vsi točkujejo (Task 3: vse prijave → 9-16) · uvrstitve po krogu izpada (Task 3) · disciplina na turnirju (Task 2, 8) · najboljših N (Task 4) · serija kot sezona (Task 1, 7, 8, 9). ✓
- **Brez nosilcev:** vse kode-stopnje vsebujejo dejansko kodo. ✓
- **Doslednost tipov:** `tournamentPlayerPoints`/`PlacementInput`/`PlayerPoints`, `seriesStandings`/`SeriesPlayerResult`, `SeriesStandingRow`, `isPairDiscipline` so dosledno poimenovani med engini, loaderjem in stranmi. ✓
- **Vrstni red:** Task 6 (App.tsx poti) je odvisen od Task 7–9 (strani morajo obstajati pred uvozi) — opomba v Task 6 Step 1 narekuje izvedbo poti šele po straneh.
