# Direktni izločilni sistem (knock-out) za DP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodati turnirski sistem `format = 'knockout'` (direktni izločilni brez skupin, brez repasaža) za DP, s samodejnim napredovanjem krogov; skupinski sistem ostane nedotaknjen.

**Architecture:** Čista bracket-logika v `src/engines/knockout.ts` (velikost mreže, nosilni razpored, gradnja mreže z bye, napredovanje). Tanka DB-plast v `src/lib/knockoutDraw.ts` (žreb + propagacija prek Supabase). UI spremembe v `TournamentAdmin`/`TournamentEdit`/`Tournament`/`KnockoutBracket`. Rang točkovanje (`championshipPoints`) ostane nespremenjeno.

**Tech Stack:** React 18 + TypeScript + Vite, Supabase (Postgres), Vitest (TDD), Tailwind.

**Branch:** `feature/dp-knockout-format` (že ustvarjena, z origin/main).

**Spec:** `docs/superpowers/specs/2026-07-04-dp-knockout-format-design.md`

---

## Pregled datotek

- **Novo:** `src/engines/knockout.ts` — čiste funkcije (bracketSize, seedOrder, firstStageForSize, buildKnockoutBracket, knockoutPropagation, seedRegistrations).
- **Novo:** `src/engines/knockout.test.ts` — Vitest testi.
- **Novo:** `src/lib/knockoutDraw.ts` — DB helperja `drawKnockout`, `propagateKnockout`.
- **Novo:** `supabase/migrations/2026-07-04_knockout_format.sql` — zapis migracij v repo.
- **Sprememba:** `src/types.ts` (`Tournament.format`, `MatchStage` += `r128`).
- **Sprememba:** `src/engines/tournament.ts` (`stageLabel` += r128).
- **Sprememba:** `src/pages/admin/TournamentAdmin.tsx` (izbirnik formata).
- **Sprememba:** `src/pages/admin/TournamentEdit.tsx` (izločilni žreb).
- **Sprememba:** `src/pages/Tournament.tsx` (propagateKnockout + skrit skupinski zavihek).
- **Sprememba:** `src/components/KnockoutBracket.tsx` (novi krogi + bye).

---

## Task 1: Migraciji baze (format + razširjen stage CHECK)

**Files:**
- Create: `supabase/migrations/2026-07-04_knockout_format.sql`

- [ ] **Step 1: Zapiši migracijsko datoteko v repo**

Create `supabase/migrations/2026-07-04_knockout_format.sql`:

```sql
-- Direktni izločilni sistem za DP: format turnirja + večji izločilni krogi.
alter table tournaments
  add column if not exists format text not null default 'groups'
  check (format in ('groups','knockout'));

alter table matches drop constraint if exists matches_stage_check;
alter table matches add constraint matches_stage_check
  check (stage in ('group','r128','r64','r32','r16','qf','sf','final','third_place'));
```

- [ ] **Step 2: Uveljavi migracijo v Supabase prek MCP**

Uporabi orodje `mcp__e7dc00c4-...__apply_migration` (project_id `jzpzigjljwufdnqcjtjb`):
- `name`: `knockout_format`
- `query`: vsebina datoteke iz Step 1.

- [ ] **Step 3: Preveri v bazi**

Prek `execute_sql` (project_id `jzpzigjljwufdnqcjtjb`):
```sql
select
  (select data_type from information_schema.columns
     where table_name='tournaments' and column_name='format') as format_col,
  (select pg_get_constraintdef(oid) from pg_constraint where conname='matches_stage_check') as stage_def;
```
Expected: `format_col = text`; `stage_def` vsebuje `r128`, `r64`, `r32`.

- [ ] **Step 4: Commit**

```bash
git -C /c/Users/HP/BocceAPP add supabase/migrations/2026-07-04_knockout_format.sql
git -C /c/Users/HP/BocceAPP commit -m "feat(db): tournaments.format + razširjen matches.stage CHECK za knock-out"
```

---

## Task 2: Tipi (`format`, `r128`) + oznaka kroga

**Files:**
- Modify: `src/types.ts:8` (MatchStage), `src/types.ts:72-86` (Tournament)
- Modify: `src/engines/tournament.ts` (stageLabel)

- [ ] **Step 1: Dodaj `r128` v MatchStage**

V `src/types.ts` zamenjaj vrstico 8:
```ts
export type MatchStage = 'group' | 'r128' | 'r64' | 'r32' | 'r16' | 'qf' | 'sf' | 'final' | 'third_place'
```

- [ ] **Step 2: Dodaj `format` v Tournament**

V `src/types.ts` v `interface Tournament` (za `discipline_type`) dodaj:
```ts
  format: 'groups' | 'knockout'
```

- [ ] **Step 3: Dodaj oznako kroga r128**

V `src/engines/tournament.ts`, v `stageLabel` objektu `labels`, dodaj `r128` pred `r64`:
```ts
    group: 'Skupinski del', r128: '1/64 finala', r64: '1/32 finala', r32: '1/16 finala',
    r16: '1/8 finala', qf: 'Četrtfinale',
```

- [ ] **Step 4: Preveri prevajanje**

Run: `npx tsc --noEmit 2>&1 | grep -E "types.ts|tournament.ts" || echo "OK (brez novih napak v teh datotekah)"`
Expected: `OK` (obstoječe nepovezane tsc napake ignoriramo).

- [ ] **Step 5: Commit**

```bash
git -C /c/Users/HP/BocceAPP add src/types.ts src/engines/tournament.ts
git -C /c/Users/HP/BocceAPP commit -m "feat(types): Tournament.format + MatchStage r128 + oznaka kroga"
```

---

## Task 3: knockout.ts — velikost mreže, nosilni razpored, ime kroga

**Files:**
- Create: `src/engines/knockout.ts`
- Test: `src/engines/knockout.test.ts`

- [ ] **Step 1: Napiši padajoče teste**

Create `src/engines/knockout.test.ts`:
```ts
import { describe, test, expect } from 'vitest'
import { bracketSize, seedOrder, firstStageForSize } from './knockout'

describe('bracketSize', () => {
  test('najbližja potenca 2 ≥ n', () => {
    expect(bracketSize(2)).toBe(2)
    expect(bracketSize(3)).toBe(4)
    expect(bracketSize(5)).toBe(8)
    expect(bracketSize(8)).toBe(8)
    expect(bracketSize(9)).toBe(16)
    expect(bracketSize(17)).toBe(32)
    expect(bracketSize(128)).toBe(128)
  })
  test('robni primeri vržejo napako', () => {
    expect(() => bracketSize(1)).toThrow()
    expect(() => bracketSize(129)).toThrow()
  })
})

describe('seedOrder', () => {
  test('standardni razpored', () => {
    expect(seedOrder(2)).toEqual([1, 2])
    expect(seedOrder(4)).toEqual([1, 4, 2, 3])
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })
  test('nosilca 1 in 2 v nasprotnih polovicah', () => {
    const o = seedOrder(16)
    expect(o).toHaveLength(16)
    expect(o.indexOf(1) < 8).toBe(true)
    expect(o.indexOf(2) >= 8).toBe(true)
  })
})

describe('firstStageForSize', () => {
  test('ime prvega kroga', () => {
    expect(firstStageForSize(2)).toBe('final')
    expect(firstStageForSize(4)).toBe('sf')
    expect(firstStageForSize(8)).toBe('qf')
    expect(firstStageForSize(16)).toBe('r16')
    expect(firstStageForSize(32)).toBe('r32')
    expect(firstStageForSize(64)).toBe('r64')
    expect(firstStageForSize(128)).toBe('r128')
  })
})
```

- [ ] **Step 2: Zaženi teste — morajo pasti**

Run: `npx vitest run src/engines/knockout.test.ts`
Expected: FAIL (`knockout` modul ne obstaja).

- [ ] **Step 3: Napiši minimalno implementacijo**

Create `src/engines/knockout.ts`:
```ts
import type { MatchStage } from '../types'

/** Vrstni red izločilnih krogov (od največjega do finala). */
export const KO_STAGE_ORDER: MatchStage[] = ['r128', 'r64', 'r32', 'r16', 'qf', 'sf', 'final']

const SIZE_STAGE: Record<number, MatchStage> = {
  128: 'r128', 64: 'r64', 32: 'r32', 16: 'r16', 8: 'qf', 4: 'sf', 2: 'final',
}

/** Velikost mreže: najbližja potenca 2 ≥ n, omejeno na [2, 128]. */
export function bracketSize(n: number): number {
  if (n < 2) throw new Error('Premalo prijav za izločilni žreb (najmanj 2)')
  if (n > 128) throw new Error('Preveč prijav za izločilni žreb (največ 128)')
  let b = 2
  while (b < n) b *= 2
  return b
}

/** Ime prvega kroga glede na velikost mreže B. */
export function firstStageForSize(b: number): MatchStage {
  const s = SIZE_STAGE[b]
  if (!s) throw new Error(`Neveljavna velikost mreže: ${b}`)
  return s
}

/** Standardni nosilni razpored: vrne nosilne številke (1..B) po mestih mreže. */
export function seedOrder(b: number): number[] {
  let rounds = [1, 2]
  while (rounds.length < b) {
    const n = rounds.length * 2
    const next: number[] = []
    for (const s of rounds) {
      next.push(s)
      next.push(n + 1 - s)
    }
    rounds = next
  }
  return rounds
}
```

- [ ] **Step 4: Zaženi teste — morajo uspeti**

Run: `npx vitest run src/engines/knockout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /c/Users/HP/BocceAPP add src/engines/knockout.ts src/engines/knockout.test.ts
git -C /c/Users/HP/BocceAPP commit -m "feat(knockout): bracketSize + seedOrder + firstStageForSize"
```

---

## Task 4: knockout.ts — gradnja mreže (buildKnockoutBracket)

**Files:**
- Modify: `src/engines/knockout.ts`, `src/engines/knockout.test.ts`

- [ ] **Step 1: Dodaj padajoče teste**

V `src/engines/knockout.test.ts` dodaj na koncu:
```ts
import { buildKnockoutBracket } from './knockout'

describe('buildKnockoutBracket', () => {
  test('N=4: 2 sf + finale + tekma za 3.', () => {
    const m = buildKnockoutBracket(['t1', 't2', 't3', 't4'])
    const sf = m.filter(x => x.stage === 'sf')
    expect(sf).toHaveLength(2)
    // nosilni razpored [1,4,2,3] -> pari (t1,t4),(t2,t3)
    expect(sf[0]).toMatchObject({ teamA: 't1', teamB: 't4', isBye: false })
    expect(sf[1]).toMatchObject({ teamA: 't2', teamB: 't3', isBye: false })
    expect(m.filter(x => x.stage === 'final')).toHaveLength(1)
    expect(m.filter(x => x.stage === 'third_place')).toHaveLength(1)
  })

  test('N=3: prosti (bye) najboljšemu nosilcu', () => {
    const m = buildKnockoutBracket(['t1', 't2', 't3'])
    const sf = m.filter(x => x.stage === 'sf').sort((a, b) => a.matchNumber - b.matchNumber)
    // sloti [t1, null, t2, t3] -> (t1,bye),(t2,t3)
    expect(sf[0]).toMatchObject({ teamA: 't1', teamB: null, isBye: true, winner: 't1' })
    expect(sf[1]).toMatchObject({ teamA: 't2', teamB: 't3', isBye: false })
  })

  test('N=2: samo finale, brez tekme za 3.', () => {
    const m = buildKnockoutBracket(['t1', 't2'])
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ stage: 'final', teamA: 't1', teamB: 't2' })
    expect(m.some(x => x.stage === 'third_place')).toBe(false)
  })

  test('N=8: qf(4)+sf(2)+final(1)+3.(1) = 8 tekem', () => {
    const m = buildKnockoutBracket(['t1','t2','t3','t4','t5','t6','t7','t8'])
    expect(m.filter(x => x.stage === 'qf')).toHaveLength(4)
    expect(m.filter(x => x.stage === 'sf')).toHaveLength(2)
    expect(m.filter(x => x.stage === 'final')).toHaveLength(1)
    expect(m.filter(x => x.stage === 'third_place')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Zaženi — morajo pasti**

Run: `npx vitest run src/engines/knockout.test.ts -t buildKnockoutBracket`
Expected: FAIL (`buildKnockoutBracket` ne obstaja).

- [ ] **Step 3: Implementiraj buildKnockoutBracket**

V `src/engines/knockout.ts` dodaj:
```ts
export interface PlannedMatch {
  stage: MatchStage
  matchNumber: number
  teamA: string | null
  teamB: string | null
  isBye: boolean
  winner: string | null
}

/** Zgradi celotno izločilno mrežo iz nosilno urejenih ekip (indeks 0 = nosilec 1). */
export function buildKnockoutBracket(seededTeamIds: string[]): PlannedMatch[] {
  const n = seededTeamIds.length
  const b = bracketSize(n)
  const order = seedOrder(b)
  const slotTeam = (slot: number): string | null => seededTeamIds[order[slot] - 1] ?? null

  const stages = KO_STAGE_ORDER.slice(KO_STAGE_ORDER.indexOf(firstStageForSize(b)))
  const matches: PlannedMatch[] = []

  // Prvi krog
  const firstStage = stages[0]
  for (let i = 0; i < b / 2; i++) {
    const a = slotTeam(2 * i)
    const c = slotTeam(2 * i + 1)
    let teamA = a, teamB = c, isBye = false, winner: string | null = null
    if (a && !c) { teamA = a; teamB = null; isBye = true; winner = a }
    else if (!a && c) { teamA = c; teamB = null; isBye = true; winner = c }
    matches.push({ stage: firstStage, matchNumber: i + 1, teamA, teamB, isBye, winner })
  }

  // Nadaljnji krogi (prazni)
  for (let s = 1; s < stages.length; s++) {
    const count = b / Math.pow(2, s + 1)
    for (let i = 0; i < count; i++) {
      matches.push({ stage: stages[s], matchNumber: i + 1, teamA: null, teamB: null, isBye: false, winner: null })
    }
  }

  // Tekma za 3. mesto (če obstaja polfinale)
  if (b >= 4) {
    matches.push({ stage: 'third_place', matchNumber: 1, teamA: null, teamB: null, isBye: false, winner: null })
  }

  return matches
}
```

- [ ] **Step 4: Zaženi — morajo uspeti**

Run: `npx vitest run src/engines/knockout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /c/Users/HP/BocceAPP add src/engines/knockout.ts src/engines/knockout.test.ts
git -C /c/Users/HP/BocceAPP commit -m "feat(knockout): buildKnockoutBracket (nosilci, bye, tekma za 3.)"
```

---

## Task 5: knockout.ts — napredovanje (knockoutPropagation)

**Files:**
- Modify: `src/engines/knockout.ts`, `src/engines/knockout.test.ts`

- [ ] **Step 1: Dodaj padajoče teste**

V `src/engines/knockout.test.ts` dodaj:
```ts
import { knockoutPropagation, type KoMatchRow } from './knockout'

const row = (o: Partial<KoMatchRow> & { id: string; stage: KoMatchRow['stage']; match_number: number }): KoMatchRow => ({
  team_a_id: null, team_b_id: null, winner_id: null, is_bye: false, ...o,
})

describe('knockoutPropagation', () => {
  test('zmagovalci sf → finale; poraženca sf → tekma za 3.', () => {
    const matches: KoMatchRow[] = [
      row({ id: 'sf1', stage: 'sf', match_number: 1, team_a_id: 'A', team_b_id: 'B', winner_id: 'A' }),
      row({ id: 'sf2', stage: 'sf', match_number: 2, team_a_id: 'C', team_b_id: 'D', winner_id: 'D' }),
      row({ id: 'f',   stage: 'final', match_number: 1 }),
      row({ id: 'tp',  stage: 'third_place', match_number: 1 }),
    ]
    const u = knockoutPropagation(matches)
    expect(u).toContainEqual({ id: 'f', slot: 'team_a_id', teamId: 'A' })
    expect(u).toContainEqual({ id: 'f', slot: 'team_b_id', teamId: 'D' })
    expect(u).toContainEqual({ id: 'tp', slot: 'team_a_id', teamId: 'B' })
    expect(u).toContainEqual({ id: 'tp', slot: 'team_b_id', teamId: 'C' })
  })

  test('bye zmagovalec prvega kroga napreduje', () => {
    const matches: KoMatchRow[] = [
      row({ id: 'q1', stage: 'qf', match_number: 1, team_a_id: 'A', team_b_id: null, winner_id: 'A', is_bye: true }),
      row({ id: 'q2', stage: 'qf', match_number: 2, team_a_id: 'B', team_b_id: 'C', winner_id: null }),
      row({ id: 's1', stage: 'sf', match_number: 1 }),
    ]
    const u = knockoutPropagation(matches)
    expect(u).toContainEqual({ id: 's1', slot: 'team_a_id', teamId: 'A' })
  })

  test('ne predlaga sprememb, če je mesto že pravilno', () => {
    const matches: KoMatchRow[] = [
      row({ id: 'sf1', stage: 'sf', match_number: 1, team_a_id: 'A', team_b_id: 'B', winner_id: 'A' }),
      row({ id: 'f',   stage: 'final', match_number: 1, team_a_id: 'A' }),
    ]
    const u = knockoutPropagation(matches)
    expect(u.find(x => x.id === 'f' && x.slot === 'team_a_id')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Zaženi — morajo pasti**

Run: `npx vitest run src/engines/knockout.test.ts -t knockoutPropagation`
Expected: FAIL.

- [ ] **Step 3: Implementiraj knockoutPropagation**

V `src/engines/knockout.ts` dodaj:
```ts
export interface KoMatchRow {
  id: string
  stage: MatchStage
  match_number: number
  team_a_id: string | null
  team_b_id: string | null
  winner_id: string | null
  is_bye: boolean
}

export interface KoSlotUpdate {
  id: string
  slot: 'team_a_id' | 'team_b_id'
  teamId: string
}

/** Izračuna, katera mesta naslednjih krogov je treba napolniti iz zmagovalcev. */
export function knockoutPropagation(matches: KoMatchRow[]): KoSlotUpdate[] {
  const koStages = KO_STAGE_ORDER.filter(s => matches.some(m => m.stage === s))
  const byStage = (s: MatchStage) =>
    matches.filter(m => m.stage === s).sort((a, b) => a.match_number - b.match_number)

  const updates: KoSlotUpdate[] = []
  const want = (target: KoMatchRow | undefined, slot: KoSlotUpdate['slot'], teamId: string) => {
    if (!target) return
    const cur = slot === 'team_a_id' ? target.team_a_id : target.team_b_id
    if (cur !== teamId) updates.push({ id: target.id, slot, teamId })
  }

  for (let si = 0; si < koStages.length - 1; si++) {
    const cur = byStage(koStages[si])
    const nxt = byStage(koStages[si + 1])
    cur.forEach((m, j) => {
      if (!m.winner_id) return
      want(nxt[Math.floor(j / 2)], j % 2 === 0 ? 'team_a_id' : 'team_b_id', m.winner_id)
    })
  }

  const third = byStage('third_place')[0]
  if (third) {
    byStage('sf').forEach((m, j) => {
      if (!m.winner_id) return
      const loser = m.winner_id === m.team_a_id ? m.team_b_id : m.team_a_id
      if (loser) want(third, j % 2 === 0 ? 'team_a_id' : 'team_b_id', loser)
    })
  }

  return updates
}
```

- [ ] **Step 4: Zaženi — morajo uspeti**

Run: `npx vitest run src/engines/knockout.test.ts`
Expected: PASS (vsi).

- [ ] **Step 5: Commit**

```bash
git -C /c/Users/HP/BocceAPP add src/engines/knockout.ts src/engines/knockout.test.ts
git -C /c/Users/HP/BocceAPP commit -m "feat(knockout): knockoutPropagation (napredovanje + tekma za 3.)"
```

---

## Task 6: knockout.ts — razvrstitev po nosilcih (seedRegistrations)

**Files:**
- Modify: `src/engines/knockout.ts`, `src/engines/knockout.test.ts`

- [ ] **Step 1: Dodaj padajoče teste**

V `src/engines/knockout.test.ts` dodaj:
```ts
import { seedRegistrations, type SeedableReg } from './knockout'

describe('seedRegistrations', () => {
  test('posamezno: padajoče po točkah igralca', () => {
    const regs: SeedableReg[] = [
      { id: 'r1', player1_id: 'a', player2_id: null },
      { id: 'r2', player1_id: 'b', player2_id: null },
      { id: 'r3', player1_id: 'c', player2_id: null },
    ]
    const pts = { a: 10, b: 30, c: 20 }
    expect(seedRegistrations(regs, pts)).toEqual(['r2', 'r3', 'r1'])
  })

  test('dvojice: padajoče po vsoti točk para', () => {
    const regs: SeedableReg[] = [
      { id: 'r1', player1_id: 'a', player2_id: 'b' }, // 10+5 = 15
      { id: 'r2', player1_id: 'c', player2_id: 'd' }, // 20+20 = 40
    ]
    const pts = { a: 10, b: 5, c: 20, d: 20 }
    expect(seedRegistrations(regs, pts)).toEqual(['r2', 'r1'])
  })

  test('brez točk (0) uvrščen zadnji; izenačenje po id', () => {
    const regs: SeedableReg[] = [
      { id: 'rB', player1_id: 'x', player2_id: null },
      { id: 'rA', player1_id: 'y', player2_id: null },
      { id: 'rC', player1_id: 'z', player2_id: null },
    ]
    const pts = { z: 5 }
    expect(seedRegistrations(regs, pts)).toEqual(['rC', 'rA', 'rB'])
  })
})
```

- [ ] **Step 2: Zaženi — morajo pasti**

Run: `npx vitest run src/engines/knockout.test.ts -t seedRegistrations`
Expected: FAIL.

- [ ] **Step 3: Implementiraj seedRegistrations**

V `src/engines/knockout.ts` dodaj:
```ts
export interface SeedableReg {
  id: string
  player1_id: string
  player2_id: string | null
}

/** Razvrsti prijave po nosilni vrednosti (vsota rang točk ekipe), padajoče. */
export function seedRegistrations(regs: SeedableReg[], rangPoints: Record<string, number>): string[] {
  const val = (r: SeedableReg) =>
    (rangPoints[r.player1_id] ?? 0) + (r.player2_id ? rangPoints[r.player2_id] ?? 0 : 0)
  return [...regs]
    .sort((a, b) => (val(b) - val(a)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(r => r.id)
}
```

- [ ] **Step 4: Zaženi — morajo uspeti**

Run: `npx vitest run src/engines/knockout.test.ts`
Expected: PASS (vsi ~4 skupine).

- [ ] **Step 5: Commit**

```bash
git -C /c/Users/HP/BocceAPP add src/engines/knockout.ts src/engines/knockout.test.ts
git -C /c/Users/HP/BocceAPP commit -m "feat(knockout): seedRegistrations (nosilci po vsoti rang točk)"
```

---

## Task 7: DB-plast — drawKnockout + propagateKnockout (`src/lib/knockoutDraw.ts`)

**Files:**
- Create: `src/lib/knockoutDraw.ts`

> Ta plast je tanek ovoj okoli testiranih čistih funkcij + Supabase klicev; testiramo prek ročne verifikacije (Task 12), ne z enotskimi testi.

- [ ] **Step 1: Napiši `propagateKnockout` (DB)**

Create `src/lib/knockoutDraw.ts`:
```ts
import { supabase } from '../supabase'
import {
  bracketSize, buildKnockoutBracket, knockoutPropagation, seedRegistrations,
  type KoMatchRow, type SeedableReg,
} from '../engines/knockout'

/** Prebere izločilne tekme turnirja, napolni mesta naslednjih krogov iz zmagovalcev. */
export async function propagateKnockout(tournamentId: string): Promise<void> {
  const { data } = await supabase
    .from('matches')
    .select('id, stage, match_number, team_a_id, team_b_id, winner_id, is_bye')
    .eq('tournament_id', tournamentId)
    .neq('stage', 'group')
  const rows = (data ?? []) as KoMatchRow[]
  const updates = knockoutPropagation(rows)
  for (const u of updates) {
    await supabase.from('matches').update({ [u.slot]: u.teamId }).eq('id', u.id)
  }
}
```

- [ ] **Step 2: Napiši `drawKnockout` (DB)**

V isto datoteko dodaj:
```ts
/** Naredi (ali ponovi) direktni izločilni žreb: nosilci → mreža → tekme. */
export async function drawKnockout(
  tournamentId: string,
  confirmedRegs: SeedableReg[],
  rangPoints: Record<string, number>,
): Promise<{ bracket: number; teams: number }> {
  const n = confirmedRegs.length
  const b = bracketSize(n) // vrže napako pri <2 ali >128

  // 1. Počisti obstoječo mrežo (tekme + kontejnerske skupine)
  await supabase.from('matches').delete().eq('tournament_id', tournamentId)
  const { data: oldGroups } = await supabase
    .from('tournament_groups').select('id').eq('tournament_id', tournamentId)
  const oldIds = (oldGroups ?? []).map(g => g.id)
  if (oldIds.length) await supabase.from('group_teams').delete().in('group_id', oldIds)
  await supabase.from('tournament_groups').delete().eq('tournament_id', tournamentId)

  // 2. Kontejnerska skupina
  const { data: grp, error: gErr } = await supabase
    .from('tournament_groups')
    .insert({ tournament_id: tournamentId, group_number: 1, status: 'pending' })
    .select('id').single()
  if (gErr) throw gErr

  // 3. Nosilci → group_teams (seed = mesto)
  const orderedRegIds = seedRegistrations(confirmedRegs, rangPoints)
  const { data: gts, error: gtErr } = await supabase
    .from('group_teams')
    .insert(orderedRegIds.map((regId, i) => ({ group_id: grp.id, registration_id: regId, seed: i + 1 })))
    .select('id, registration_id, seed')
  if (gtErr) throw gtErr
  const gtBySeed = new Map((gts ?? []).map(g => [g.seed, g.id]))
  const seededTeamIds = orderedRegIds.map((_, i) => gtBySeed.get(i + 1)!)

  // 4. Zgradi mrežo → vpiši tekme
  const planned = buildKnockoutBracket(seededTeamIds)
  const rows = planned.map(p => ({
    tournament_id: tournamentId,
    group_id: null,
    stage: p.stage,
    match_type: p.isBye ? 'bye' : 'knockout',
    match_number: p.matchNumber,
    team_a_id: p.teamA,
    team_b_id: p.teamB,
    winner_id: p.winner,
    score_a: p.isBye ? 6 : null,
    score_b: p.isBye ? 0 : null,
    is_bye: p.isBye,
    status: p.winner ? 'completed' : 'pending',
  }))
  const { error: mErr } = await supabase.from('matches').insert(rows)
  if (mErr) throw mErr

  // 5. Razreši bye naprej
  await propagateKnockout(tournamentId)

  return { bracket: b, teams: n }
}
```

- [ ] **Step 3: Preveri prevajanje**

Run: `npx tsc --noEmit 2>&1 | grep "knockoutDraw.ts" || echo "OK"`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git -C /c/Users/HP/BocceAPP add src/lib/knockoutDraw.ts
git -C /c/Users/HP/BocceAPP commit -m "feat(knockout): DB-plast drawKnockout + propagateKnockout"
```

---

## Task 8: TournamentAdmin — izbirnik formata

**Files:**
- Modify: `src/pages/admin/TournamentAdmin.tsx`

- [ ] **Step 1: Dodaj `format` v obrazec**

V `TournamentForm` (za `group_size: string`) dodaj:
```ts
  format: string
```
V `EMPTY_FORM` (za `group_size: '4',`) dodaj:
```ts
  format: 'groups',
```

- [ ] **Step 2: Pošlji `format` ob ustvarjanju**

V `handleCreate`, v objekt za `supabase.from('tournaments').insert({...})`, dodaj (za `group_size: form.group_size,`):
```ts
        format: form.format,
```

- [ ] **Step 3: Dodaj izbirnik v obrazec + skrij group_size pri knockout**

V obrazcu, takoj za blokom "Vrsta *" (`<div>` s `select value={form.kind}`), dodaj nov blok:
```tsx
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sistem tekmovanja *</label>
                <select value={form.format} onChange={set('format')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                  <option value="groups">Skupinski + izločilni</option>
                  <option value="knockout">Direktni izločilni (brez skupin)</option>
                </select>
              </div>
```
Nato blok "Ekipe v skupini" ovij v pogojni prikaz — zamenjaj `<div>` ... `</div>` okoli `select value={form.group_size}` z:
```tsx
              {form.format === 'groups' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ekipe v skupini</label>
                  <select value={form.group_size} onChange={set('group_size')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                    <option value="3">3 ekipe (U18 mali)</option>
                    <option value="4">4 ekipe (standardno moški)</option>
                    <option value="5">5 ekip (ženske / U18 veliki)</option>
                  </select>
                </div>
              )}
```

- [ ] **Step 4: Preveri prevajanje + build**

Run: `npx vite build 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
git -C /c/Users/HP/BocceAPP add src/pages/admin/TournamentAdmin.tsx
git -C /c/Users/HP/BocceAPP commit -m "feat(admin): izbirnik sistema tekmovanja (groups/knockout)"
```

---

## Task 9: TournamentEdit — izločilni žreb (knockout)

**Files:**
- Modify: `src/pages/admin/TournamentEdit.tsx`

- [ ] **Step 1: Dodaj uvoze + pomožno za rang točke**

Na vrh datoteke dodaj uvoze:
```ts
import { drawKnockout } from '../../lib/knockoutDraw'
import { computeRangLestvica, type RangCategory } from '../../lib/rangLestvica'
```
Za `type Tab = ...` dodaj (nad komponento):
```ts
function toRangCat(cat: string): RangCategory | null {
  return cat === 'men' || cat === 'women' || cat === 'u18' ? cat : null
}
```

- [ ] **Step 2: Dodaj stanje + funkcijo žreba**

Znotraj komponente, poleg `drawLoading`, dodaj rokovalnik (za `handleDraw`):
```ts
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
```

- [ ] **Step 3: Preklopi zavihke glede na format**

Zamenjaj blok zavihkov (`{([ { key: 'registrations' ... } ]).map(...)}`) tako, da je "Žreb skupin" viden le pri groups, sicer "Izločilni žreb":
```tsx
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
```

- [ ] **Step 4: Prikaži vsebino izločilnega žreba pri knockout**

Na začetku bloka `{tab === 'draw' && (` dodaj pogojni prikaz za knockout (pred obstoječo vsebino skupinskega žreba). Zamenjaj `{tab === 'draw' && (` z:
```tsx
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
```

> Opomba: zapri prej odprti `{tab === 'draw' && (` — s to zamenjavo se izraz konča z `!== 'knockout' && (`, obstoječa vsebina skupinskega žreba ostane nespremenjena znotraj istega bloka.

- [ ] **Step 5: Preveri build**

Run: `npx vite build 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/HP/BocceAPP add src/pages/admin/TournamentEdit.tsx
git -C /c/Users/HP/BocceAPP commit -m "feat(admin): izločilni žreb po nosilcih za knock-out DP"
```

---

## Task 10: Tournament (javna stran) — napredovanje + skrit skupinski zavihek

**Files:**
- Modify: `src/pages/Tournament.tsx`

- [ ] **Step 1: Uvozi propagateKnockout**

Dodaj uvoz:
```ts
import { propagateKnockout } from '../lib/knockoutDraw'
```

- [ ] **Step 2: Vgradi napredovanje v handleSaveScore**

V `handleSaveScore` zamenjaj blok:
```ts
    if (match.group_id) {
      await propagateGroup(match.group_id)
    }
```
z:
```ts
    if (match.group_id) {
      await propagateGroup(match.group_id)
    } else if (match.stage !== 'group') {
      await propagateKnockout(match.tournament_id)
    }
```

- [ ] **Step 3: Skrij zavihek "Skupine" pri knockout**

V bloku zavihkov (`{[ { key: 'groups' ... }, ... ].map(...)}`) zamenjaj statični seznam s pogojnim:
```tsx
        {(tournament.format === 'knockout'
          ? [
              { key: 'knockout' as const, label: 'Izločilni del' },
              { key: 'registrations' as const, label: `Prijave (${registrations.length})` },
            ]
          : [
              { key: 'groups' as const, label: `Skupine (${groups.length})` },
              { key: 'knockout' as const, label: 'Izločilni del' },
              { key: 'registrations' as const, label: `Prijave (${registrations.length})` },
            ]
        ).map(t => (
```

- [ ] **Step 4: Privzeti zavihek za knockout**

Poišči `useState<'groups' | 'knockout' | 'registrations'>('groups')` in po nalaganju turnirja nastavi privzeti zavihek. V obstoječem `useEffect`, ki nastavi turnir (ali dodaj nov `useEffect`):
```ts
  useEffect(() => {
    if (tournament?.format === 'knockout') setTab('knockout')
  }, [tournament?.format])
```

- [ ] **Step 5: Preveri build**

Run: `npx vite build 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/HP/BocceAPP add src/pages/Tournament.tsx
git -C /c/Users/HP/BocceAPP commit -m "feat(tournament): samodejno napredovanje knock-out + skrit skupinski zavihek"
```

---

## Task 11: KnockoutBracket — novi krogi + prikaz bye

**Files:**
- Modify: `src/components/KnockoutBracket.tsx`

- [ ] **Step 1: Razširi seznam krogov + širine**

Zamenjaj:
```ts
const STAGES: MatchStage[] = ['r16', 'qf', 'sf', 'final']
const STAGE_WIDTHS: Partial<Record<MatchStage | 'third_place', number>> = {
  r16: 140, qf: 148, sf: 156, final: 164, third_place: 156,
}
```
z:
```ts
const STAGES: MatchStage[] = ['r128', 'r64', 'r32', 'r16', 'qf', 'sf', 'final']
const STAGE_WIDTHS: Partial<Record<MatchStage | 'third_place', number>> = {
  r128: 132, r64: 132, r32: 136, r16: 140, qf: 148, sf: 156, final: 164, third_place: 156,
}
```

- [ ] **Step 2: Prikaži bye namesto "Čaka..." za prosto mesto**

V `KnockoutMatchCard`, v vrstici za ekipo B, zamenjaj `{match.teamB ? nameB : 'Čaka...'}` z:
```tsx
          {match.teamB ? nameB : (match.is_bye ? 'prosto (bye)' : 'Čaka...')}
```

- [ ] **Step 3: Preveri build**

Run: `npx vite build 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 4: Commit**

```bash
git -C /c/Users/HP/BocceAPP add src/components/KnockoutBracket.tsx
git -C /c/Users/HP/BocceAPP commit -m "feat(bracket): krogi r128/r64/r32 + prikaz bye"
```

---

## Task 12: Celovita verifikacija + rob tournamentPlacement

**Files:**
- Preveri/po potrebi: `src/engines/tournamentPlacement.ts`
- Pregled: cela funkcija

- [ ] **Step 1: Preveri, kje se uporablja tournamentPlacement**

Run: `git -C /c/Users/HP/BocceAPP grep -n "tournamentPlayerPoints" -- "src/*.ts" "src/*.tsx" || echo "nikjer uporabljeno"`
(ali uporabi orodje Grep za vzorec `tournamentPlayerPoints`). Ugotovi, ali se uporablja za prikaz uvrstitev knock-out turnirjev.

- [ ] **Step 2: Če se uporablja za knock-out — omeji "9.–16." na dejanske r16 poražence**

Če (in samo če) Step 1 pokaže uporabo za knock-out prikaz, v `src/engines/tournamentPlacement.ts` zamenjaj:
```ts
  // vse ostale prijave (poraženci r16 + neuvrščeni iz skupin)
  for (const r of registrations) assign(r.id, '9-16')
```
z:
```ts
  for (const m of knockoutMatches.filter(m => m.stage === 'r16' && m.winner_id)) {
    assign(regOfGt.get(loserGt(m)!), '9-16')
  }
```
in v izhodni zanki preskoči prijave brez določenega mesta:
```ts
  for (const r of registrations) {
    const bucket = bucketByReg.get(r.id)
    if (!bucket) continue
    const points = bucketPoints(bucket)
    out.push({ player_id: r.player1_id, points, bucket })
    if (r.player2_id) out.push({ player_id: r.player2_id, points, bucket })
  }
```
> Če se `tournamentPlacement` NE uporablja za knock-out (rang uporablja `championshipPoints`), preskoči ta korak in to zabeleži v commit sporočilu naslednjega koraka.

- [ ] **Step 3: Zaženi celoten testni paket**

Run: `npx vitest run`
Expected: vsi testi PASS (vključno z obstoječimi `tournamentPlacement.test.ts` — če si spreminjal, po potrebi posodobi teste).

- [ ] **Step 4: Ročna verifikacija toka (Supabase MCP)**

Prek `execute_sql` ustvari testni knock-out DP z ~5 prijavami in ročno preveri, ali `drawKnockout` (prek UI ali ročne replikacije) ustvari pravilno mrežo (sf/qf glede na velikost, bye za nosilca 1, tekma za 3.). Vnesi nekaj rezultatov in preveri, da `propagateKnockout` napolni naslednji krog. **Po verifikaciji izbriši testni turnir** (kot pri prejšnjem uvozu DP).

- [ ] **Step 5: Build + commit**

Run: `npx vite build 2>&1 | tail -3`
Expected: `✓ built`.
```bash
git -C /c/Users/HP/BocceAPP add -A
git -C /c/Users/HP/BocceAPP commit -m "chore: verifikacija knock-out sistema + rob tournamentPlacement"
```

- [ ] **Step 6: Potisni vejo + odpri PR**

```bash
git -C /c/Users/HP/BocceAPP push -u origin feature/dp-knockout-format
```
Nato uporabniku ponudi povezavo za PR (gh CLI ni na voljo; uporabnik merga prek GitHub weba).

---

## Odvisnosti / opombe

- **Rang točkovanje DP** (`championshipPoints`, veja `feature/dp-championships`) je neodvisno od te veje; za pravilno štetje knock-out DP v rang mora biti tudi tista veja mergana. Ta funkcija (vodenje turnirja) deluje samostojno.
- **Kategorije brez rang preslikave** (mixed/u15/u12): `rangPoints` prazen → žreb naključen po `registration.id` (sprejemljivo; nosilci se uporabijo, kjer rang obstaja).
