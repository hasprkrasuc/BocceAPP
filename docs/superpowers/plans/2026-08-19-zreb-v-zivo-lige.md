# Žreb v živo za lige — načrt izvedbe (faza 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zaslon, na katerem se ligaški žreb izpelje v živo pred občinstvom, teče brez omrežja in se na koncu z eno potrditvijo zapiše v `league_teams`.

**Architecture:** Splošen pogon obreda v `src/engines/zreb.ts` (čist, brez I/O, vbrizgan generator) po modelu »udeleženec izvleče številko«. Ligaška pravila so ločena v `src/engines/zrebLiga.ts`, ki iz sezone sestavi opis žreba in izid preveri. Edini kos z bazo je `src/lib/zrebShrani.ts`. Zaslon `src/pages/Zreb.tsx` ima delovni in predstavitveni način.

**Tech Stack:** TypeScript, React, react-router-dom, Supabase, vitest. Brez novih odvisnosti.

**Specifikacija:** `docs/superpowers/specs/2026-08-19-zreb-v-zivo-lige-design.md`

---

## Konvencije tega repozitorija (preberi pred prvo nalogo)

- **Jezik:** koda, komentarji, sporočila commitov in vmesnik so v slovenščini.
- **Sheme nikoli ne spreminjaj v Supabase SQL Editorju** — vsaka sprememba gre skozi datoteko v `supabase/migrations/`. Migracije se **ne uveljavijo same**; to je ročni korak človeka. Poimenovanje `YYYYMMDD_NN_opis.sql`, idempotentno.
- **Razvojne baze ni.** `.env.local` kaže na produkcijo. Nobena naloga v tem načrtu ne piše v bazo; pisanje sproži šele uporabnik s klikom v vmesniku.
- `src/engines/` = čista logika brez I/O, z najgostejšo testno pokritostjo. Vsako novo pravilo tekmovanja sodi sem in dobi test.
- Preverjanje pred PR: `npm test -- --run` in `npm run typecheck`. Typecheck na `main` že javi 26 napak v 11 datotekah (7. 8. 2026) — tvoja sprememba tega števila **ne sme povečati**.
- V besedilo `COMMENT ON` v migracijah ne piši šumnikov (obstoječe migracije jih nimajo); v `--` komentarje jih piši normalno.
- Delaj na veji `spec/zreb-v-zivo-lige` (specifikacija je že tam). **Ne potiskaj na `main`** — potisk sproži produkcijski deploy.

---

## Struktura datotek

| Datoteka | Odgovornost |
|---|---|
| `supabase/migrations/20260819_01_shared_venue_key.sql` | nov stolpec `league_teams.shared_venue_key` |
| `src/engines/berger.ts` (dopolnitev) | `veljavniPariIgrisc` — pari številk, ki nista nikoli oba doma |
| `src/engines/zreb.ts` | splošen pogon obreda; brez I/O, brez ligaških pravil |
| `src/engines/zrebLiga.ts` | ligaška pravila: iz sezone sestavi `ZrebOpis`, preveri izid |
| `src/lib/zrebShrani.ts` | edini kos z bazo: naloži vhode, zapiši izid |
| `src/pages/Zreb.tsx` | zaslon obreda, delovni in predstavitveni način |
| `src/types.ts` (dopolnitev) | `LeagueTeam.shared_venue_key` |
| `src/App.tsx` (dopolnitev) | pot `/admin/zreb/liga/:seasonId` |
| `src/pages/admin/LeagueAdmin.tsx` (dopolnitev) | vnos ključa igrišča + povezava na žreb |

---

## Task 1: Migracija in tip za skupno igrišče

**Files:**
- Create: `supabase/migrations/20260819_01_shared_venue_key.sql`
- Modify: `src/types.ts` (vmesnik `LeagueTeam`)

- [ ] **Step 1: Napiši migracijo**

Ustvari `supabase/migrations/20260819_01_shared_venue_key.sql`:

```sql
-- Dve ekipi si lahko delita (rezervno) igrišče. Takrat ne smeta biti nikoli obe
-- domači v istem krogu, sicer igrišče ne zadošča. To zagotovi razlika med
-- njunima žrebanima številkama (pri sodem številu ekip N/2; izpelje jo
-- veljavniPariIgrisc iz Bergerjeve tabele).
--
-- Ekipe z enakim ključem si delijo igrišče. Ključ je prosto besedilo, ker gre
-- lahko za balinišče, ki ni vezano na klub. NULL = ekipa igrišča ne deli.
ALTER TABLE public.league_teams
  ADD COLUMN IF NOT EXISTS shared_venue_key text;

COMMENT ON COLUMN public.league_teams.shared_venue_key IS
  'Ekipe z enakim kljucem si delijo rezervno igrisce in ne smeta biti obe domaci v istem krogu. NULL = ekipa igrisca ne deli.';
```

- [ ] **Step 2: Dopolni tip**

V `src/types.ts` v vmesniku `LeagueTeam` dodaj za `group_label`:

```ts
  /** Ekipe z enakim ključem si delijo rezervno igrišče; NULL = ne deli. */
  shared_venue_key: string | null
```

- [ ] **Step 3: Preveri, da se tipi še prevedejo**

Run: `npm run typecheck 2>&1 | tail -5`
Expected: število napak ostane 26 (ali manj). Če se poveča, si tip dodal narobe.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260819_01_shared_venue_key.sql src/types.ts
git commit -m "Žreb: stolpec shared_venue_key za skupna rezervna igrišča"
```

> **Opomba za človeka:** migracijo je treba ročno pognati v Supabase, preden se uporabi zaslon žreba. Ker stolpec le dodaja, gre lahko pred deployem kode.

---

## Task 2: `veljavniPariIgrisc` v Bergerju

Pari številk, ki v nobenem krogu nista obe domači. Pravilo se **ne sme vkodirati**, ampak izpelje iz iste tabele, po kateri nastane razpored.

**Files:**
- Modify: `src/engines/berger.ts`
- Modify: `src/engines/berger.test.ts`

- [ ] **Step 1: Napiši padajoče teste**

Dodaj na konec `src/engines/berger.test.ts`:

```ts
import { veljavniPariIgrisc } from './berger'

describe('veljavniPariIgrisc', () => {
  /** Preverjeno na Prilogi B: pri sodem N je edina razlika N/2. */
  test('pri sodem številu ekip je razlika natanko N/2', () => {
    for (const [n, pricakovanaRazlika] of [[6, 3], [8, 4], [10, 5], [12, 6]] as const) {
      const pari = veljavniPariIgrisc(n, true, false)
      expect(pari.length).toBe(n / 2)
      for (const [a, b] of pari) expect(b - a).toBe(pricakovanaRazlika)
    }
  })

  test('pri 6 ekipah so pari natanko 1-4, 2-5, 3-6', () => {
    expect(veljavniPariIgrisc(6, true, false)).toEqual([[1, 4], [2, 5], [3, 6]])
  })

  test('pri lihem številu ekip sta veljavni dve razliki', () => {
    for (const n of [7, 9, 11]) {
      const razlike = new Set(veljavniPariIgrisc(n, true, false).map(([a, b]) => b - a))
      expect([...razlike].sort()).toEqual([Math.floor(n / 2), Math.ceil(n / 2)])
    }
  })

  test('zrcaljenje na pare ne vpliva', () => {
    expect(veljavniPariIgrisc(12, true, true)).toEqual(veljavniPariIgrisc(12, true, false))
  })

  /** Namen pravila, ne le njegova oblika. */
  test('para iz seznama nista v nobenem krogu oba domača', () => {
    for (const n of [6, 9, 12]) {
      const igre = bergerSchedule(n, true, false)
      for (const [a, b] of veljavniPariIgrisc(n, true, false)) {
        const krogiA = new Set(igre.filter(g => g.home === a).map(g => g.round))
        const krogiB = igre.filter(g => g.home === b).map(g => g.round)
        for (const r of krogiB) expect(krogiA.has(r)).toBe(false)
      }
    }
  })
})
```

- [ ] **Step 2: Poženi teste, da vidiš, da padejo**

Run: `npm test -- --run src/engines/berger.test.ts`
Expected: FAIL — `veljavniPariIgrisc` ni izvožen.

- [ ] **Step 3: Dopolni `src/engines/berger.ts`**

Dodaj na konec datoteke:

```ts
/**
 * Pari žrebanih številk, ki v NOBENEM krogu nista obe domači. Dve ekipi, ki si
 * delita rezervno igrišče, morata dobiti številki iz takega para.
 *
 * Vrednosti se ne vkodirajo — izpeljejo se iz iste tabele, po kateri nastane
 * razpored. Tako sodo/liho število ekip, eno- ali dvokrožnost in zrcaljenje
 * odpadejo kot posebni primeri, pravilo pa se ne more razhajati z razporedom.
 *
 * Pri sodem N je to natanko razlika N/2, pri lihem N/2 navzdol ali navzgor.
 *
 * @returns pari [a, b] z a < b, urejeni naraščajoče po a
 */
export function veljavniPariIgrisc(
  teamCount: number,
  doubleRound = false,
  mirror = false,
): Array<[number, number]> {
  const igre = bergerSchedule(teamCount, doubleRound, mirror)
  const domaciPoKrogu = new Map<number, number[]>()
  for (const g of igre) {
    const seznam = domaciPoKrogu.get(g.round) ?? []
    seznam.push(g.home)
    domaciPoKrogu.set(g.round, seznam)
  }

  const skupajDoma = new Set<string>()
  for (const doma of domaciPoKrogu.values()) {
    for (let i = 0; i < doma.length; i++) {
      for (let j = i + 1; j < doma.length; j++) {
        const [a, b] = doma[i] < doma[j] ? [doma[i], doma[j]] : [doma[j], doma[i]]
        skupajDoma.add(`${a}-${b}`)
      }
    }
  }

  const pari: Array<[number, number]> = []
  for (let a = 1; a <= teamCount; a++) {
    for (let b = a + 1; b <= teamCount; b++) {
      if (!skupajDoma.has(`${a}-${b}`)) pari.push([a, b])
    }
  }
  return pari
}
```

- [ ] **Step 4: Poženi teste**

Run: `npm test -- --run src/engines/berger.test.ts`
Expected: PASS, vsi obstoječi testi plus 5 novih.

- [ ] **Step 5: Commit**

```bash
git add src/engines/berger.ts src/engines/berger.test.ts
git commit -m "Berger: veljavniPariIgrisc — pari številk, ki nista nikoli oba doma"
```

---

## Task 3: Pogon žreba — stanje in kandidati

**Files:**
- Create: `src/engines/zreb.ts`
- Create: `src/engines/zreb.test.ts`

- [ ] **Step 1: Napiši padajoče teste**

Ustvari `src/engines/zreb.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import {
  zacniZreb, kandidati, preostale, jeKoncano,
  type ZrebOpis, type ZrebStanje,
} from './zreb'

/** Preprost opis za teste: 4 udeleženci, številke 1..4, brez omejitev. */
export function preprostOpis(n = 4): ZrebOpis {
  const ids = Array.from({ length: n }, (_, i) => `e${i + 1}`)
  return {
    udelezenci: ids.map(id => ({ id, ime: id.toUpperCase() })),
    koraki: [{
      naziv: 'Številke',
      predal: 0,
      udelezenci: () => ids,
      stevilke: () => Array.from({ length: n }, (_, i) => i + 1),
      veljavne: (s, _id) => preostaleV(s, 0, n),
    }],
  }
}

function preostaleV(s: ZrebStanje, predal: number, n: number): number[] {
  const vzete = new Set(Object.values(s.dodeljene[predal] ?? {}))
  return Array.from({ length: n }, (_, i) => i + 1).filter(x => !vzete.has(x))
}

describe('pogon žreba — stanje', () => {
  test('začetno stanje je prazno in na prvem koraku', () => {
    const s = zacniZreb(preprostOpis())
    expect(s.korak).toBe(0)
    expect(s.cakajoca).toBeNull()
    expect(s.dnevnik).toEqual([])
    expect(s.dodeljene).toEqual({})
  })

  test('kandidati so vsi udeleženci koraka', () => {
    const o = preprostOpis()
    expect(kandidati(o, zacniZreb(o))).toEqual(['e1', 'e2', 'e3', 'e4'])
  })

  test('kandidati so samo čakajoča, ko je udeleženec že izvlečen', () => {
    const o = preprostOpis()
    const s = { ...zacniZreb(o), cakajoca: 'e3' }
    expect(kandidati(o, s)).toEqual(['e3'])
  })

  test('preostale odšteje že dodeljene številke', () => {
    const o = preprostOpis()
    const s: ZrebStanje = { ...zacniZreb(o), dodeljene: { 0: { e1: 2 } } }
    expect(preostale(o, s)).toEqual([1, 3, 4])
  })

  test('jeKoncano je res šele, ko imajo vsi udeleženci vseh korakov številko', () => {
    const o = preprostOpis()
    const s = zacniZreb(o)
    expect(jeKoncano(o, s)).toBe(false)
    const poln: ZrebStanje = { ...s, dodeljene: { 0: { e1: 1, e2: 2, e3: 3, e4: 4 } } }
    expect(jeKoncano(o, poln)).toBe(true)
  })
})
```

- [ ] **Step 2: Poženi teste, da vidiš, da padejo**

Run: `npm test -- --run src/engines/zreb.test.ts`
Expected: FAIL — modula `./zreb` ni.

- [ ] **Step 3: Napiši `src/engines/zreb.ts`**

```ts
/**
 * SPLOŠEN POGON ŽREBA V ŽIVO
 *
 * Model: udeleženec izvleče številko, ta številka je njegovo mesto. Kaj mesto
 * pomeni (mesto v skupini, žrebana številka za Bergerja, mesto v mreži), ve
 * samo prilagojevalnik posameznega tekmovanja — ta modul tega ne ve.
 *
 * Modul je čista logika: brez DOM, brez baze in brez lastnega naključja
 * (generator se vbrizga, da so testi ponovljivi). Stanje je nespremenljivo in
 * serializabilno, zato je razveljavljanje odvzem s sklada, shranjevanje v
 * localStorage pa preprost JSON.
 */

export interface Udelezenec {
  id: string
  ime: string
  /** Neobvezna oznaka za prikaz (npr. klub ali nosilno mesto). */
  oznaka?: string
}

/** Ena dodelitev številke — bodisi izžrebana bodisi samodejna posledica. */
export interface Dodelitev {
  udelezenecId: string
  stevilka: number
  /** true = ni bila izžrebana, ampak izhaja iz pravila. */
  samodejno: boolean
  /** Razlog samodejne dodelitve; izpiše se občinstvu. */
  razlog?: string
}

/**
 * Ena faza obreda. `predal` pove, kam se dodelitve shranijo — koraki z istim
 * predalom si delijo nabor številk (npr. soigriščni pari in preostale ekipe
 * iste skupine), koraki z različnimi predali pa ne (skupina A in skupina B
 * obe uporabljata številke 1..6).
 */
export interface Korak {
  naziv: string
  predal: number
  /** Udeleženci tega koraka; funkcija, ker so lahko odvisni od prejšnjih korakov. */
  udelezenci(stanje: ZrebStanje): string[]
  /** Vse številke tega predala. */
  stevilke(stanje: ZrebStanje): number[]
  /** Katere številke sme dobiti ta udeleženec zdaj. */
  veljavne(stanje: ZrebStanje, udelezenecId: string): number[]
  /** Dodatne dodelitve, ki jih ta poteg sproži (sopostavljeni nosilec, soigriščna ekipa). */
  posledice?(stanje: ZrebStanje, udelezenecId: string, stevilka: number): Dodelitev[]
}

export interface ZrebOpis {
  udelezenci: Udelezenec[]
  koraki: Korak[]
}

export interface DnevnikVnos {
  tip: 'udelezenec' | 'stevilka'
  udelezenecId: string
  stevilka?: number
  samodejno?: boolean
  razlog?: string
  korak: number
}

export interface ZrebStanje {
  /** predal → (udeleženec → številka) */
  dodeljene: Record<number, Record<string, number>>
  korak: number
  /** Udeleženec, ki je izvlečen, a še nima številke. */
  cakajoca: string | null
  dnevnik: DnevnikVnos[]
}

/** Nespremenljivo začetno stanje. */
export function zacniZreb(_opis: ZrebOpis): ZrebStanje {
  return { dodeljene: {}, korak: 0, cakajoca: null, dnevnik: [] }
}

/** Številka, dodeljena udeležencu v danem predalu (ali undefined). */
export function dodeljena(stanje: ZrebStanje, predal: number, id: string): number | undefined {
  return stanje.dodeljene[predal]?.[id]
}

/** Preostale številke trenutnega (ali podanega) koraka. */
export function preostale(opis: ZrebOpis, stanje: ZrebStanje, korakIdx = stanje.korak): number[] {
  const korak = opis.koraki[korakIdx]
  if (!korak) return []
  const vzete = new Set(Object.values(stanje.dodeljene[korak.predal] ?? {}))
  return korak.stevilke(stanje).filter(n => !vzete.has(n))
}

/** Udeleženci, ki so lahko na vrsti zdaj. */
export function kandidati(opis: ZrebOpis, stanje: ZrebStanje): string[] {
  if (stanje.cakajoca) return [stanje.cakajoca]
  const korak = opis.koraki[stanje.korak]
  if (!korak) return []
  const ze = stanje.dodeljene[korak.predal] ?? {}
  return korak.udelezenci(stanje).filter(id => !(id in ze))
}

/** Ali so vsi udeleženci vseh korakov dobili številko. */
export function jeKoncano(opis: ZrebOpis, stanje: ZrebStanje): boolean {
  if (stanje.cakajoca) return false
  return opis.koraki.every(k => {
    const ze = stanje.dodeljene[k.predal] ?? {}
    return k.udelezenci(stanje).every(id => id in ze)
  })
}
```

- [ ] **Step 4: Poženi teste**

Run: `npm test -- --run src/engines/zreb.test.ts`
Expected: PASS, 5 testov.

- [ ] **Step 5: Commit**

```bash
git add src/engines/zreb.ts src/engines/zreb.test.ts
git commit -m "Žreb: pogon — stanje, kandidati, preostale številke"
```

---

## Task 4: Pogon žreba — žrebanje in razveljavljanje

**Files:**
- Modify: `src/engines/zreb.ts`
- Modify: `src/engines/zreb.test.ts`

- [ ] **Step 1: Napiši padajoče teste**

Dodaj v `src/engines/zreb.test.ts`:

```ts
import { izvleciUdelezenca, izvleciStevilko } from './zreb'

/** Ponovljiv generator za teste. */
export function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const randIntIz = (prng: () => number) => (n: number) => Math.floor(prng() * n)

describe('pogon žreba — potegi', () => {
  test('izvleciUdelezenca nastavi čakajočo in ne dodeli številke', () => {
    const o = preprostOpis()
    const s0 = zacniZreb(o)
    const s1 = izvleciUdelezenca(o, s0, randIntIz(mulberry32(1)))
    expect(s1.cakajoca).not.toBeNull()
    expect(s0.cakajoca).toBeNull()   // izvirno stanje ostane nedotaknjeno
    expect(s1.dodeljene).toEqual({})
    expect(s1.dnevnik).toHaveLength(1)
  })

  test('dvakratno žrebanje udeleženca javi napako', () => {
    const o = preprostOpis()
    const r = randIntIz(mulberry32(1))
    const s1 = izvleciUdelezenca(o, zacniZreb(o), r)
    expect(() => izvleciUdelezenca(o, s1, r)).toThrow(/že izvlečen/)
  })

  test('žrebanje številke brez izvlečenega udeleženca javi napako', () => {
    const o = preprostOpis()
    expect(() => izvleciStevilko(o, zacniZreb(o), randIntIz(mulberry32(1)))).toThrow(/najprej izvleci/)
  })

  test('celoten žreb dodeli vse številke in napreduje čez korake', () => {
    const o = preprostOpis()
    const r = randIntIz(mulberry32(42))
    let s = zacniZreb(o)
    let potez = 0
    while (!jeKoncano(o, s)) { s = izvleciStevilko(o, izvleciUdelezenca(o, s, r), r); potez++ }
    expect(potez).toBe(4)
    expect(Object.keys(s.dodeljene[0])).toHaveLength(4)
    expect(new Set(Object.values(s.dodeljene[0])).size).toBe(4)
    expect(preostale(o, s, 0)).toEqual([])
  })

  test('posledice dodelijo tudi druge udeležence', () => {
    const o = preprostOpis()
    o.koraki[0].posledice = (_s, id, st) =>
      id === 'e1' ? [{ udelezenecId: 'e2', stevilka: st === 1 ? 2 : 1, samodejno: true, razlog: 'preizkus' }] : []
    const r = randIntIz(mulberry32(3))
    let s = izvleciUdelezenca(o, zacniZreb(o), r)
    s = { ...s, cakajoca: 'e1' }
    s = izvleciStevilko(o, s, r)
    expect(s.dodeljene[0].e1).toBeDefined()
    expect(s.dodeljene[0].e2).toBeDefined()
    expect(s.dnevnik.some(v => v.samodejno && v.razlog === 'preizkus')).toBe(true)
  })

  test('brez veljavne številke javi napako in ne spremeni stanja', () => {
    const o = preprostOpis()
    o.koraki[0].veljavne = () => []
    const r = randIntIz(mulberry32(5))
    const s = { ...zacniZreb(o), cakajoca: 'e1' }
    expect(() => izvleciStevilko(o, s, r)).toThrow(/ni nobene veljavne/)
  })
})
```

- [ ] **Step 2: Poženi teste, da vidiš, da padejo**

Run: `npm test -- --run src/engines/zreb.test.ts`
Expected: FAIL — `izvleciUdelezenca` ni izvožen.

- [ ] **Step 3: Dopolni `src/engines/zreb.ts`**

Dodaj na konec:

```ts
/** Preskoči korake, ki nimajo več kandidatov. */
function napreduj(opis: ZrebOpis, stanje: ZrebStanje): ZrebStanje {
  let korak = stanje.korak
  while (korak < opis.koraki.length) {
    const k = opis.koraki[korak]
    const ze = stanje.dodeljene[k.predal] ?? {}
    if (k.udelezenci(stanje).some(id => !(id in ze))) break
    korak++
  }
  return korak === stanje.korak ? stanje : { ...stanje, korak }
}

/** Izvleče naslednjega udeleženca. Vrne NOVO stanje. */
export function izvleciUdelezenca(
  opis: ZrebOpis, stanje: ZrebStanje, randInt: (n: number) => number,
): ZrebStanje {
  if (stanje.cakajoca) throw new Error('udeleženec je že izvlečen — najprej izvleci številko')
  const k = kandidati(opis, stanje)
  if (k.length === 0) throw new Error('ni več udeležencev za žrebanje')
  const id = k[randInt(k.length)]
  return {
    ...stanje,
    cakajoca: id,
    dnevnik: [...stanje.dnevnik, { tip: 'udelezenec', udelezenecId: id, korak: stanje.korak }],
  }
}

/** Izvleče številko za čakajočega udeleženca in uveljavi posledice. Vrne NOVO stanje. */
export function izvleciStevilko(
  opis: ZrebOpis, stanje: ZrebStanje, randInt: (n: number) => number,
): ZrebStanje {
  const id = stanje.cakajoca
  if (!id) throw new Error('najprej izvleci udeleženca')
  const korak = opis.koraki[stanje.korak]
  const veljavne = korak.veljavne(stanje, id)
  if (veljavne.length === 0) {
    throw new Error(`za ${id} ni nobene veljavne številke — žreb se ne more nadaljevati`)
  }
  const stevilka = veljavne[randInt(veljavne.length)]

  const vse: Dodelitev[] = [
    { udelezenecId: id, stevilka, samodejno: false },
    ...(korak.posledice?.(stanje, id, stevilka) ?? []),
  ]

  const predal = { ...(stanje.dodeljene[korak.predal] ?? {}) }
  const dnevnik = [...stanje.dnevnik]
  for (const d of vse) {
    if (d.udelezenecId in predal) {
      throw new Error(`${d.udelezenecId} ima številko že dodeljeno`)
    }
    predal[d.udelezenecId] = d.stevilka
    dnevnik.push({
      tip: 'stevilka', udelezenecId: d.udelezenecId, stevilka: d.stevilka,
      samodejno: d.samodejno, razlog: d.razlog, korak: stanje.korak,
    })
  }

  const naslednje: ZrebStanje = {
    ...stanje,
    dodeljene: { ...stanje.dodeljene, [korak.predal]: predal },
    cakajoca: null,
    dnevnik,
  }
  return napreduj(opis, naslednje)
}
```

- [ ] **Step 4: Poženi teste**

Run: `npm test -- --run src/engines/zreb.test.ts`
Expected: PASS, 11 testov.

- [ ] **Step 5: Commit**

```bash
git add src/engines/zreb.ts src/engines/zreb.test.ts
git commit -m "Žreb: pogon — žrebanje udeleženca in številke s posledicami"
```

---

## Task 5: Pogon žreba — invariante

**Files:**
- Modify: `src/engines/zreb.ts`
- Modify: `src/engines/zreb.test.ts`

- [ ] **Step 1: Napiši padajoče teste**

Dodaj v `src/engines/zreb.test.ts`:

```ts
import { preveri } from './zreb'

describe('pogon žreba — invariante', () => {
  test('pravilen žreb nima napak', () => {
    const o = preprostOpis()
    const r = randIntIz(mulberry32(7))
    let s = zacniZreb(o)
    while (!jeKoncano(o, s)) s = izvleciStevilko(o, izvleciUdelezenca(o, s, r), r)
    expect(preveri(o, s)).toEqual([])
  })

  test('ujame podvojeno številko', () => {
    const o = preprostOpis()
    const s: ZrebStanje = { ...zacniZreb(o), dodeljene: { 0: { e1: 1, e2: 1 } } }
    expect(preveri(o, s).some(x => /podvojena/.test(x))).toBe(true)
  })

  test('ujame številko zunaj nabora', () => {
    const o = preprostOpis()
    const s: ZrebStanje = { ...zacniZreb(o), dodeljene: { 0: { e1: 99 } } }
    expect(preveri(o, s).some(x => /ni v naboru/.test(x))).toBe(true)
  })

  test('delno stanje ne javi lažnih napak', () => {
    const o = preprostOpis()
    const r = randIntIz(mulberry32(9))
    let s = zacniZreb(o)
    for (let i = 0; i < 2; i++) s = izvleciStevilko(o, izvleciUdelezenca(o, s, r), r)
    expect(preveri(o, s)).toEqual([])
  })
})
```

- [ ] **Step 2: Poženi teste, da vidiš, da padejo**

Run: `npm test -- --run src/engines/zreb.test.ts`
Expected: FAIL — `preveri` ni izvožen.

- [ ] **Step 3: Dopolni `src/engines/zreb.ts`**

```ts
/**
 * Vrne seznam kršenih invariant v slovenščini; prazen seznam pomeni, da je vse
 * v redu. Preverbe, ki so smiselne šele ob koncu, se izvedejo le, ko je žreb
 * končan — vmesna stanja ne smejo javljati lažnih napak, ker vmesnik ob napaki
 * obred ustavi.
 */
export function preveri(opis: ZrebOpis, stanje: ZrebStanje): string[] {
  const napake: string[] = []
  const imena = new Map(opis.udelezenci.map(u => [u.id, u.ime]))
  const ime = (id: string) => imena.get(id) ?? id

  for (const korak of opis.koraki) {
    const ze = stanje.dodeljene[korak.predal] ?? {}
    const nabor = new Set(korak.stevilke(stanje))
    const videne = new Map<number, string>()
    for (const [id, st] of Object.entries(ze)) {
      if (!nabor.has(st)) napake.push(`${ime(id)}: številka ${st} ni v naboru koraka „${korak.naziv}“`)
      const prej = videne.get(st)
      if (prej) napake.push(`podvojena številka ${st}: ${ime(prej)} in ${ime(id)}`)
      else videne.set(st, id)
    }
  }

  if (jeKoncano(opis, stanje)) {
    for (const korak of opis.koraki) {
      const ze = stanje.dodeljene[korak.predal] ?? {}
      for (const id of korak.udelezenci(stanje)) {
        if (!(id in ze)) napake.push(`${ime(id)} nima številke v koraku „${korak.naziv}“`)
      }
    }
  }
  return napake
}
```

- [ ] **Step 4: Poženi teste**

Run: `npm test -- --run src/engines/zreb.test.ts`
Expected: PASS, 15 testov.

- [ ] **Step 5: Commit**

```bash
git add src/engines/zreb.ts src/engines/zreb.test.ts
git commit -m "Žreb: pogon — preverjanje invariant"
```

---

## Task 6: Ligaški opis za `flat` in `split`

**Files:**
- Create: `src/engines/zrebLiga.ts`
- Create: `src/engines/zrebLiga.test.ts`

- [ ] **Step 1: Napiši padajoče teste**

Ustvari `src/engines/zrebLiga.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { zacniZreb, izvleciUdelezenca, izvleciStevilko, jeKoncano, preveri } from './zreb'
import { mulberry32, randIntIz } from './zreb.test'
import { ligaskiOpis, type LigaEkipa } from './zrebLiga'

const ekipe = (n: number, skupno: Record<string, string> = {}): LigaEkipa[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    ime: `Ekipa ${i + 1}`,
    shared_venue_key: skupno[`t${i + 1}`] ?? null,
  }))

const odigraj = (opis: ReturnType<typeof ligaskiOpis>, seme: number) => {
  const r = randIntIz(mulberry32(seme))
  let s = zacniZreb(opis)
  while (!jeKoncano(opis, s)) s = izvleciStevilko(opis, izvleciUdelezenca(opis, s, r), r)
  return s
}

describe('ligaški opis — flat in split', () => {
  test('flat ima en korak in številke 1..N', () => {
    const o = ligaskiOpis({ format: 'flat', double_round: true, berger_mirror: false }, ekipe(12), [])
    expect(o.koraki).toHaveLength(1)
    expect(o.koraki[0].stevilke(zacniZreb(o))).toEqual([1,2,3,4,5,6,7,8,9,10,11,12])
  })

  test('vsaka ekipa dobi različno številko 1..N', () => {
    const o = ligaskiOpis({ format: 'flat', double_round: true, berger_mirror: false }, ekipe(10), [])
    const s = odigraj(o, 1)
    const st = Object.values(s.dodeljene[0])
    expect(st).toHaveLength(10)
    expect(new Set(st).size).toBe(10)
    expect(st.sort((a, b) => a - b)).toEqual([1,2,3,4,5,6,7,8,9,10])
    expect(preveri(o, s)).toEqual([])
  })

  test('split je za žreb enak flat z desetimi ekipami', () => {
    const o = ligaskiOpis({ format: 'split', double_round: true, berger_mirror: false }, ekipe(10), [])
    expect(o.koraki).toHaveLength(1)
    expect(o.koraki[0].stevilke(zacniZreb(o))).toHaveLength(10)
  })
})
```

- [ ] **Step 2: Poženi teste, da vidiš, da padejo**

Run: `npm test -- --run src/engines/zrebLiga.test.ts`
Expected: FAIL — modula `./zrebLiga` ni.

- [ ] **Step 3: Napiši `src/engines/zrebLiga.ts`**

```ts
/**
 * LIGAŠKA PRAVILA ŽREBA
 *
 * Prevede sezono v `ZrebOpis` za splošni pogon. Vsa ligaška pravila živijo tu;
 * pogon jih ne pozna.
 *
 * Dve obliki:
 *  - `flat` in `split` — ena skupina, številke 1..N
 *  - `groups` — najprej se žrebata skupini A/B po parih nosilcev, nato številke
 *    1..6 znotraj vsake skupine
 *
 * Ekipi, ki si delita rezervno igrišče, morata dobiti številki iz para, ki v
 * nobenem krogu ni obe domači (glej `veljavniPariIgrisc`).
 */
import { veljavniPariIgrisc } from './berger'
import { preostale, type Korak, type ZrebOpis, type ZrebStanje } from './zreb'

export interface LigaEkipa {
  id: string
  ime: string
  shared_venue_key: string | null
}

export interface LigaNastavitve {
  format: 'flat' | 'groups' | 'split'
  double_round: boolean
  berger_mirror: boolean
}

/** Predal 0 = skupine (groups) ali edini nabor številk (flat/split). */
export const PREDAL_SKUPINE = 0
export const PREDAL_A = 1
export const PREDAL_B = 2

/** Pari ekip, ki si delijo igrišče. Vrne pare id-jev; ključi z eno ekipo se ignorirajo. */
export function soigriscniPari(ekipe: LigaEkipa[]): Array<[string, string]> {
  const poKljucu = new Map<string, string[]>()
  for (const e of ekipe) {
    if (!e.shared_venue_key) continue
    const seznam = poKljucu.get(e.shared_venue_key) ?? []
    seznam.push(e.id)
    poKljucu.set(e.shared_venue_key, seznam)
  }
  const pari: Array<[string, string]> = []
  for (const [, ids] of poKljucu) {
    if (ids.length === 2) pari.push([ids[0], ids[1]])
  }
  return pari
}

/**
 * Preveri, ali je žreb sploh izvedljiv. Vrne napake v slovenščini; prazen
 * seznam pomeni, da se obred lahko začne. Namenoma se izvede PRED obredom, da
 * se ne zatakne sredi dvorane.
 */
export function preveriIzvedljivost(ekipe: LigaEkipa[], nastavitve: LigaNastavitve): string[] {
  const napake: string[] = []
  const poKljucu = new Map<string, string[]>()
  for (const e of ekipe) {
    if (!e.shared_venue_key) continue
    const s = poKljucu.get(e.shared_venue_key) ?? []
    s.push(e.ime)
    poKljucu.set(e.shared_venue_key, s)
  }
  for (const [kljuc, imena] of poKljucu) {
    if (imena.length > 2) {
      napake.push(`Igrišče „${kljuc}“ si deli ${imena.length} ekip (${imena.join(', ')}). Pravilo o razliki številk velja samo za dve.`)
    }
  }
  if (nastavitve.format === 'groups' && ekipe.length !== 12) {
    napake.push(`Skupinska liga zahteva 12 ekip, sezona jih ima ${ekipe.length}.`)
  }
  if (nastavitve.format !== 'groups' && (ekipe.length < 2 || ekipe.length > 12)) {
    napake.push(`Bergerjev razpored zahteva 2 do 12 ekip, sezona jih ima ${ekipe.length}.`)
  }
  return napake
}

/**
 * Ali je razpored tega formata dvokrožen.
 *
 * Stolpca `double_round` NI mogoče prenesti naravnost. V `src/types.ts` je
 * dokumentiran kot »samo format='flat'«, migracija ga zapolni le za `flat`, in
 * obrazec sezone ga pri drugih formatih sploh ne pokaže — zato pri skupinskih in
 * razdelitvenih sezonah večno ostane `false`. Resnica je drugačna: faza 1
 * skupinske lige JE dvokrožna (`LeagueAdmin` jo tako generira), faza 1
 * razdelitvene pa enokrožna.
 *
 * Napaka je nevarna v eno smer. Pari enokrožnega razporeda so nadmnožica
 * dvokrožnih, zato bi napačni `false` pri skupinski ligi ponudil par, ki v
 * dvokrožni sezoni ni varen — in ekipi bi bili v nekem krogu obe domači, kar je
 * natanko tisto, čemur se pravilo izogiba.
 */
export function jeDvokrozno(nastavitve: LigaNastavitve): boolean {
  if (nastavitve.format === 'groups') return true
  if (nastavitve.format === 'split') return false
  return nastavitve.double_round
}

/** Partnerske številke, ki jih sme dobiti soigriščna ekipa ob številki `n`. */
function partnerskeStevilke(n: number, pari: Array<[number, number]>): number[] {
  const out: number[] = []
  for (const [a, b] of pari) {
    if (a === n) out.push(b)
    if (b === n) out.push(a)
  }
  return out
}

/**
 * Korak za en nabor številk 1..velikost: najprej soigriščni pari, nato ostali.
 * Vrne dva koraka z istim predalom — vrstni red je bistven, ker bi sicer lahko
 * ekipe brez omejitve zasedle številke tako, da za par ne ostane veljavna
 * razlika.
 */
function korakiZaNabor(
  predal: number,
  /** Člani nabora; funkcija stanja, ker so pri skupinski ligi znani šele po fazi A. */
  clani: (stanje: ZrebStanje) => string[],
  velikost: number,
  pariIgrisc: Array<[string, string]>,
  nastavitve: LigaNastavitve,
  naziv: string,
): Korak[] {
  const stevilke = () => Array.from({ length: velikost }, (_, i) => i + 1)
  const veljavniPari = veljavniPariIgrisc(velikost, jeDvokrozno(nastavitve), nastavitve.berger_mirror)

  /** Pari, ki sta oba v tem naboru. */
  const mojiPari = (s: ZrebStanje) => {
    const v = new Set(clani(s))
    return pariIgrisc.filter(([a, b]) => v.has(a) && v.has(b))
  }
  const prviIzParov = (s: ZrebStanje) => mojiPari(s).map(([a]) => a)
  const drugiIzParov = (s: ZrebStanje) => new Set(mojiPari(s).map(([, b]) => b))

  const prosteV = (s: ZrebStanje) => {
    const vzete = new Set(Object.values(s.dodeljene[predal] ?? {}))
    return stevilke().filter(n => !vzete.has(n))
  }

  const korakPari: Korak = {
    naziv: `${naziv} — ekipe s skupnim igriščem`,
    predal,
    udelezenci: prviIzParov,
    stevilke,
    veljavne: (s) => {
      const proste = new Set(prosteV(s))
      // veljavna je le številka, ki ima prosto tudi partnersko
      return [...proste].filter(n => partnerskeStevilke(n, veljavniPari).some(p => proste.has(p)))
    },
    posledice: (s, id, n) => {
      const par = mojiPari(s).find(([a]) => a === id)
      if (!par) return []
      const proste = new Set(prosteV(s))
      proste.delete(n)
      const moznosti = partnerskeStevilke(n, veljavniPari).filter(p => proste.has(p))
      if (moznosti.length === 0) throw new Error(`za ${id} ni proste partnerske številke`)
      return [{
        udelezenecId: par[1],
        stevilka: moznosti[0],
        samodejno: true,
        razlog: 'skupno rezervno igrišče',
      }]
    },
  }

  const korakOstali: Korak = {
    naziv,
    predal,
    udelezenci: (s) => {
      const drugi = drugiIzParov(s)
      const prvi = new Set(prviIzParov(s))
      return clani(s).filter(id => !drugi.has(id) && !prvi.has(id))
    },
    stevilke,
    veljavne: (s) => prosteV(s),
  }

  return [korakPari, korakOstali]
}

/** Sestavi opis žreba za ligaško sezono. */
export function ligaskiOpis(
  nastavitve: LigaNastavitve,
  ekipe: LigaEkipa[],
  nosilniVrstniRed: string[],
): ZrebOpis {
  const udelezenci = ekipe.map(e => ({ id: e.id, ime: e.ime }))
  const pari = soigriscniPari(ekipe)

  if (nastavitve.format !== 'groups') {
    return {
      udelezenci,
      koraki: korakiZaNabor(
        PREDAL_SKUPINE, () => ekipe.map(e => e.id), ekipe.length, pari, nastavitve, 'Žrebane številke',
      ),
    }
  }
  return { udelezenci, koraki: korakiSkupinskeLige(ekipe, pari, nastavitve, nosilniVrstniRed) }
}

/** Zapolni Task 7 — do takrat skupinska liga ni podprta. */
function korakiSkupinskeLige(
  _ekipe: LigaEkipa[], _pari: Array<[string, string]>,
  _nastavitve: LigaNastavitve, _nosilniVrstniRed: string[],
): Korak[] {
  throw new Error('skupinska liga še ni podprta')
}

/**
 * Ligaške invariante, ki jih splošni pogon ne more poznati. Vrne napake v
 * slovenščini; prazen seznam = izid je veljaven. Kliče se po vsaki potezi ob
 * `preveri` iz pogona.
 *
 * Preverbe, ki so smiselne šele ob koncu, se izvedejo le, ko je žreb končan —
 * vmesna stanja ne smejo javljati lažnih napak, ker vmesnik ob napaki obred
 * ustavi.
 */
export function preveriLigaski(
  nastavitve: LigaNastavitve, ekipe: LigaEkipa[], nosilniVrstniRed: string[],
  stanje: ZrebStanje, koncano: boolean,
): string[] {
  const napake: string[] = []
  const ime = new Map(ekipe.map(e => [e.id, e.ime]))
  const n = (id: string) => ime.get(id) ?? id

  // 1. Zaporedna nosilca iz istega para sta v različnih skupinah.
  if (nastavitve.format === 'groups') {
    const red = nosilniVrstniRed.length ? nosilniVrstniRed : ekipe.map(e => e.id)
    const sk = stanje.dodeljene[PREDAL_SKUPINE] ?? {}
    for (let i = 0; i + 1 < red.length; i += 2) {
      const a = sk[red[i]], b = sk[red[i + 1]]
      if (a != null && b != null && a === b) {
        napake.push(`${n(red[i])} in ${n(red[i + 1])} sta zaporedna nosilca in ne smeta biti v isti skupini`)
      }
    }
    if (koncano) {
      for (const predal of [PREDAL_A, PREDAL_B]) {
        const st = Object.keys(stanje.dodeljene[predal] ?? {}).length
        if (st !== 6) napake.push(`Skupina ${predal === PREDAL_A ? 'A' : 'B'} ima ${st} ekip namesto 6`)
      }
    }
  }

  // 2. Ekipi s skupnim igriščem imata števili, ki tvorita veljaven par — TUDI
  //    kadar sta v različnih skupinah, ker skupini igrata ob istih terminih po
  //    isti tabeli in je ekipa s številko n v A domača v istih krogih kot ekipa
  //    s številko n v B.
  const velikost = nastavitve.format === 'groups' ? 6 : ekipe.length
  const veljavni = veljavniPariIgrisc(velikost, jeDvokrozno(nastavitve), nastavitve.berger_mirror)
  const dovoljene = new Set(veljavni.map(([a, b]) => `${a}-${b}`))

  /** Številka ekipe v njenem LASTNEM predalu (pri skupinah odvisno od skupine). */
  const stevilkaEkipe = (id: string): number | undefined => {
    if (nastavitve.format !== 'groups') return stanje.dodeljene[PREDAL_SKUPINE]?.[id]
    const skupina = stanje.dodeljene[PREDAL_SKUPINE]?.[id]
    if (skupina == null) return undefined
    return stanje.dodeljene[skupina === 1 ? PREDAL_A : PREDAL_B]?.[id]
  }

  for (const [a, b] of soigriscniPari(ekipe)) {
    const x = stevilkaEkipe(a), y = stevilkaEkipe(b)
    if (x == null || y == null) continue
    const kljuc = x < y ? `${x}-${y}` : `${y}-${x}`
    if (!dovoljene.has(kljuc)) {
      napake.push(`${n(a)} in ${n(b)} si delita igrišče, a številki ${x} in ${y} nista veljaven par`)
    }
  }
  return napake
}
```

- [ ] **Step 4: Poženi teste**

Run: `npm test -- --run src/engines/zrebLiga.test.ts`
Expected: PASS, 3 testi.

- [ ] **Step 5: Commit**

```bash
git add src/engines/zrebLiga.ts src/engines/zrebLiga.test.ts
git commit -m "Žreb: ligaški opis za flat in split, s pari skupnih igrišč"
```

---

## Task 7: Ligaški opis za `groups`

**Files:**
- Modify: `src/engines/zreb.ts` (posledica lahko cilja drug predal)
- Modify: `src/engines/zreb.test.ts`
- Modify: `src/engines/zrebLiga.ts`
- Modify: `src/engines/zrebLiga.test.ts`

### Zakaj se spremeni tudi pogon

Skupini igrata svoja kola **ob istih terminih** in obe uporabljata isto Bergerjevo tabelo za šest ekip. Ekipa s številko `n` v skupini A je zato domača v natanko istih krogih kot ekipa s številko `n` v skupini B.

Posledica: ekipi s skupnim igriščem morata dobiti števili iz `veljavniPariIgrisc(6, …)` **tudi kadar ju faza A raztrga v različni skupini**. Zahteva je ista, mehanika pa ne — partnerjeva številka takrat pripada drugemu predalu, česar `Dodelitev` doslej ni znala izraziti.

- [ ] **Step 1: Testa za posledico v drugem predalu**

Dodaj v `src/engines/zreb.test.ts`, znotraj obstoječega `describe('pogon žreba — potegi', …)`:

```ts
  test('posledica lahko cilja drug predal', () => {
    const o = preprostOpis()
    o.koraki[0].posledice = (_s, id, st) =>
      id === 'e1' ? [{ udelezenecId: 'x1', stevilka: st, samodejno: true, razlog: 'drug predal', predal: 5 }] : []
    const r = randIntIz(mulberry32(3))
    let s: ZrebStanje = { ...zacniZreb(o), cakajoca: 'e1' }
    s = izvleciStevilko(o, s, r)
    expect(s.dodeljene[0].e1).toBeDefined()
    expect(s.dodeljene[5].x1).toBe(s.dodeljene[0].e1)
  })

  test('podvojitev se preverja v ciljnem predalu, ne v predalu koraka', () => {
    const o = preprostOpis()
    o.koraki[0].posledice = (_s, _id, st) =>
      [{ udelezenecId: 'y1', stevilka: st, samodejno: true, predal: 5 }]
    const r = randIntIz(mulberry32(3))
    const s: ZrebStanje = { ...zacniZreb(o), cakajoca: 'e1', dodeljene: { 5: { y1: 1 } } }
    expect(() => izvleciStevilko(o, s, r)).toThrow(/že dodeljeno/)
  })
```

- [ ] **Step 2: Poženi testa, da vidiš, da padeta**

Run: `npm test -- --run src/engines/zreb.test.ts`
Expected: FAIL — `predal` ni v tipu `Dodelitev`, oziroma se posledica zapiše v napačen predal.

- [ ] **Step 3: Dopolni `src/engines/zreb.ts`**

V vmesniku `Dodelitev` dodaj za `razlog`:

```ts
  /**
   * Predal, v katerega gre ta dodelitev. Privzeto predal koraka. Nastavi ga
   * samo, kadar posledica cilja udeleženca iz DRUGEGA nabora — npr. soigriščno
   * ekipo, ki jo je žreb skupin postavil v drugo skupino.
   */
  predal?: number
```

V `izvleciStevilko` zamenjaj blok, ki gradi `predal`, `dnevnik` in `naslednje`, s tem:

```ts
  const dodeljene: Record<number, Record<string, number>> = { ...stanje.dodeljene }
  const dnevnik = [...stanje.dnevnik]
  for (const d of vse) {
    const p = d.predal ?? korak.predal
    const vedro = { ...(dodeljene[p] ?? {}) }
    if (d.udelezenecId in vedro) {
      throw new Error(`${d.udelezenecId} ima številko že dodeljeno`)
    }
    vedro[d.udelezenecId] = d.stevilka
    dodeljene[p] = vedro
    dnevnik.push({
      tip: 'stevilka', udelezenecId: d.udelezenecId, stevilka: d.stevilka,
      samodejno: d.samodejno, razlog: d.razlog, korak: stanje.korak,
    })
  }

  const naslednje: ZrebStanje = { ...stanje, dodeljene, cakajoca: null, dnevnik }
  return napreduj(opis, naslednje)
```

Doslej se je kopiralo eno samo vedro; zdaj se vsako vedro kopira tik pred pisanjem, da vhodno stanje ostane nedotaknjeno tudi pri več predalih hkrati.

- [ ] **Step 4: Poženi teste pogona**

Run: `npm test -- --run src/engines/zreb.test.ts`
Expected: PASS, vsi obstoječi plus 2 nova.

- [ ] **Step 5: Napiši padajoče teste za skupinsko ligo**

Dodaj v `src/engines/zrebLiga.test.ts`:

```ts
import { PREDAL_SKUPINE, PREDAL_A, PREDAL_B } from './zrebLiga'

const skupinskaLiga = { format: 'groups' as const, double_round: true, berger_mirror: false }
const vrstniRed12 = Array.from({ length: 12 }, (_, i) => `t${i + 1}`)

describe('ligaški opis — groups', () => {
  test('faza A žreba samo prvega iz vsakega para nosilcev', () => {
    const o = ligaskiOpis(skupinskaLiga, ekipe(12), vrstniRed12)
    const prvi = o.koraki[0].udelezenci(zacniZreb(o))
    expect(prvi).toEqual(['t1', 't3', 't5', 't7', 't9', 't11'])
    expect(o.koraki[0].stevilke(zacniZreb(o))).toEqual([1, 2])
  })

  test('zaporedna nosilca vedno pristaneta v različnih skupinah', () => {
    for (let seme = 1; seme <= 50; seme++) {
      const o = ligaskiOpis(skupinskaLiga, ekipe(12), vrstniRed12)
      const s = odigraj(o, seme)
      const sk = s.dodeljene[PREDAL_SKUPINE]
      for (let i = 0; i < 12; i += 2) {
        expect(sk[`t${i + 1}`]).not.toBe(sk[`t${i + 2}`])
      }
    }
  })

  test('vsaka skupina ima 6 ekip in številke 1..6', () => {
    const o = ligaskiOpis(skupinskaLiga, ekipe(12), vrstniRed12)
    const s = odigraj(o, 11)
    for (const predal of [PREDAL_A, PREDAL_B]) {
      const st = Object.values(s.dodeljene[predal])
      expect(st).toHaveLength(6)
      expect(st.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6])
    }
    expect(preveri(o, s)).toEqual([])
  })

  /**
   * Skupini igrata ob istih terminih po isti tabeli, zato sta ekipi z isto
   * številko v različnih skupinah domači v istih krogih. Pravilo o skupnem
   * igrišču mora zato veljati tudi čez skupini.
   */
  test('soigriščni par dobi veljaven par številk tudi v različnih skupinah', () => {
    // t1 in t2 sta zaporedna nosilca, zato ju faza A vedno raztrga
    const e = ekipe(12, { t1: 'x', t2: 'x' })
    const o = ligaskiOpis(skupinskaLiga, e, vrstniRed12)
    for (let seme = 1; seme <= 40; seme++) {
      const s = odigraj(o, seme)
      const sk = s.dodeljene[PREDAL_SKUPINE]
      expect(sk.t1).not.toBe(sk.t2)     // res sta v različnih skupinah
      const a = s.dodeljene[sk.t1 === 1 ? PREDAL_A : PREDAL_B].t1
      const b = s.dodeljene[sk.t2 === 1 ? PREDAL_A : PREDAL_B].t2
      expect(Math.abs(a - b)).toBe(3)
      expect(preveri(o, s)).toEqual([])
    }
  })

  test('soigriščni par v isti skupini dobi razliko 3', () => {
    // t1 in t3 nista zaporedna nosilca, zato lahko pristaneta skupaj
    const e = ekipe(12, { t1: 'x', t3: 'x' })
    const o = ligaskiOpis(skupinskaLiga, e, vrstniRed12)
    let istaSkupina = 0
    for (let seme = 1; seme <= 40; seme++) {
      const s = odigraj(o, seme)
      const sk = s.dodeljene[PREDAL_SKUPINE]
      const a = s.dodeljene[sk.t1 === 1 ? PREDAL_A : PREDAL_B].t1
      const b = s.dodeljene[sk.t3 === 1 ? PREDAL_A : PREDAL_B].t3
      expect(Math.abs(a - b)).toBe(3)
      if (sk.t1 === sk.t3) istaSkupina++
      expect(preveri(o, s)).toEqual([])
    }
    expect(istaSkupina).toBeGreaterThan(0)   // primer se res pojavi
  })
})
```

- [ ] **Step 6: Poženi teste, da vidiš, da padejo**

Run: `npm test -- --run src/engines/zrebLiga.test.ts`
Expected: FAIL — `skupinska liga še ni podprta`.

- [ ] **Step 7: Zamenjaj `korakiSkupinskeLige` v `src/engines/zrebLiga.ts`**

```ts
/**
 * Skupinska liga: dva koraka razporeditve in po dva koraka številk na skupino.
 *
 * Faza A — za vsak par zaporednih nosilcev (1-2, 3-4, …) žreba samo PRVI, ali
 * gre v A (1) ali B (2). Drugi iz para gre samodejno v nasprotno skupino. Tako
 * sta zaporedna nosilca vedno ločena in sta skupini enakovredni.
 *
 * Faza B — številke 1..6 posebej v vsaki skupini; znotraj vsake najprej
 * soigriščni pari, nato ostali.
 */
function korakiSkupinskeLige(
  ekipe: LigaEkipa[], pari: Array<[string, string]>,
  nastavitve: LigaNastavitve, nosilniVrstniRed: string[],
): Korak[] {
  const red = nosilniVrstniRed.length ? nosilniVrstniRed : ekipe.map(e => e.id)
  const prviVParu = red.filter((_, i) => i % 2 === 0)
  const partner = new Map<string, string>()
  for (let i = 0; i + 1 < red.length; i += 2) partner.set(red[i], red[i + 1])

  const fazaA: Korak = {
    naziv: 'Razporeditev v skupini',
    predal: PREDAL_SKUPINE,
    // predal nosi OZNAKO skupine, ne edinstvenih številk: šest ekip dobi 1 in
    // šest 2, zato tu podvojitev ni napaka
    enolicne: false,
    udelezenci: () => prviVParu,
    stevilke: () => [1, 2],   // 1 = A, 2 = B
    // obe skupini sta vedno na voljo: par zapolni po eno mesto v vsaki
    veljavne: () => [1, 2],
    posledice: (_s, id, n) => {
      const drugi = partner.get(id)
      if (!drugi) return []
      return [{
        udelezenecId: drugi,
        stevilka: n === 1 ? 2 : 1,
        samodejno: true,
        razlog: 'sopostavljeni nosilec gre v nasprotno skupino',
      }]
    },
  }

  /** Člani skupine so znani šele iz stanja po fazi A — zato funkcija stanja. */
  const clani = (oznaka: number) => (s: ZrebStanje) =>
    Object.entries(s.dodeljene[PREDAL_SKUPINE] ?? {})
      .filter(([, v]) => v === oznaka).map(([id]) => id)

  const skupinaOd = (s: ZrebStanje, id: string) => s.dodeljene[PREDAL_SKUPINE]?.[id]
  const predalOd = (s: ZrebStanje, id: string) => (skupinaOd(s, id) === 1 ? PREDAL_A : PREDAL_B)
  const veljavniPari6 = veljavniPariIgrisc(6, jeDvokrozno(nastavitve), nastavitve.berger_mirror)
  const proste = (s: ZrebStanje, predal: number) => {
    const vzete = new Set(Object.values(s.dodeljene[predal] ?? {}))
    return [1, 2, 3, 4, 5, 6].filter(n => !vzete.has(n))
  }

  /**
   * Soigriščni pari, ločeni po skupini PRVE ekipe iz para. Ločena koraka sta
   * potrebna, ker ima korak en sam predal — prva ekipa para iz skupine A žreba
   * iz nabora A, iz skupine B pa iz nabora B.
   *
   * Partner je lahko v drugi skupini; takrat gre njegova številka v drug predal.
   * Zahteva je enaka kot znotraj skupine, ker skupini igrata ob istih terminih
   * po isti tabeli.
   */
  const korakPari = (oznaka: number, predal: number, imeSkupine: string): Korak => ({
    naziv: `Skupina ${imeSkupine} — ekipe s skupnim igriščem`,
    predal,
    udelezenci: (s) => pari.filter(([a]) => skupinaOd(s, a) === oznaka).map(([a]) => a),
    stevilke: () => [1, 2, 3, 4, 5, 6],
    veljavne: (s, id) => {
      const par = pari.find(([a]) => a === id)
      if (!par) return proste(s, predal)
      const partnerPredal = predalOd(s, par[1])
      const partnerjeveProste = new Set(proste(s, partnerPredal))
      return proste(s, predal).filter(n => {
        const kandidati = partnerskeStevilke(n, veljavniPari6)
        // pri istem predalu partnerjeva številka ne sme biti ta, ki jo jemljemo
        return kandidati.some(p => partnerjeveProste.has(p) && !(partnerPredal === predal && p === n))
      })
    },
    posledice: (s, id, n) => {
      const par = pari.find(([a]) => a === id)
      if (!par) return []
      const partnerPredal = predalOd(s, par[1])
      const partnerjeveProste = new Set(proste(s, partnerPredal))
      if (partnerPredal === predal) partnerjeveProste.delete(n)
      const moznosti = partnerskeStevilke(n, veljavniPari6).filter(p => partnerjeveProste.has(p))
      if (moznosti.length === 0) throw new Error(`za ${id} ni proste partnerske številke`)
      return [{
        udelezenecId: par[1],
        stevilka: moznosti[0],
        samodejno: true,
        razlog: 'skupno rezervno igrišče',
        predal: partnerPredal,
      }]
    },
  })

  /** Ekipe skupine, ki niso v nobenem soigriščnem paru. */
  const korakOstali = (oznaka: number, predal: number, imeSkupine: string): Korak => ({
    naziv: `Skupina ${imeSkupine}`,
    predal,
    udelezenci: (s) => {
      const vPariu = new Set(pari.flat())
      return clani(oznaka)(s).filter(id => !vPariu.has(id))
    },
    stevilke: () => [1, 2, 3, 4, 5, 6],
    veljavne: (s) => proste(s, predal),
  })

  // Vsi soigriščni pari gredo PRED preostale ekipe obeh skupin — sicer lahko
  // ekipe brez omejitve zasedejo številke tako, da paru ne ostane veljavna razlika.
  return [
    fazaA,
    korakPari(1, PREDAL_A, 'A'),
    korakPari(2, PREDAL_B, 'B'),
    korakOstali(1, PREDAL_A, 'A'),
    korakOstali(2, PREDAL_B, 'B'),
  ]
}
```

- [ ] **Step 8: Poženi teste**

Run: `npm test -- --run src/engines/zrebLiga.test.ts`
Expected: PASS, 8 testov.

- [ ] **Step 9: Commit**

```bash
git add src/engines/zrebLiga.ts src/engines/zrebLiga.test.ts
git commit -m "Žreb: skupinska liga — žreb skupin po parih nosilcev, nato številke"
```

---

## Task 8: Skupna igrišča — pravilo in namen

**Files:**
- Modify: `src/engines/zrebLiga.test.ts`

- [ ] **Step 1: Napiši teste**

Dodaj v `src/engines/zrebLiga.test.ts`:

```ts
import { bergerSchedule } from './berger'
import { preveriIzvedljivost, soigriscniPari } from './zrebLiga'

describe('skupna rezervna igrišča', () => {
  test('soigriscniPari najde samo ključe z natanko dvema ekipama', () => {
    const e = ekipe(6, { t1: 'balinisce-x', t2: 'balinisce-x', t3: 'y', t4: 'y', t5: 'z' })
    expect(soigriscniPari(e)).toEqual([['t1', 't2'], ['t3', 't4']])
  })

  test('trije na istem igrišču so neizvedljivi in se ujamejo pred obredom', () => {
    const e = ekipe(6, { t1: 'x', t2: 'x', t3: 'x' })
    const napake = preveriIzvedljivost(e, { format: 'flat', double_round: true, berger_mirror: false })
    expect(napake.some(x => /3 ekip/.test(x))).toBe(true)
  })

  test('pri 12 ekipah dobi soigriščni par razliko 6', () => {
    const o = ligaskiOpis(
      { format: 'flat', double_round: true, berger_mirror: false },
      ekipe(12, { t1: 'x', t7: 'x' }), [],
    )
    for (let seme = 1; seme <= 50; seme++) {
      const s = odigraj(o, seme)
      expect(Math.abs(s.dodeljene[0].t1 - s.dodeljene[0].t7)).toBe(6)
    }
  })

  /** Test namena: pravilo obstaja zato, da ekipi nista nikoli obe domači. */
  test('soigriščni ekipi v razporedu nista nikoli obe domači', () => {
    const o = ligaskiOpis(
      { format: 'flat', double_round: true, berger_mirror: false },
      ekipe(10, { t2: 'x', t9: 'x' }), [],
    )
    for (let seme = 1; seme <= 30; seme++) {
      const s = odigraj(o, seme)
      const a = s.dodeljene[0].t2, b = s.dodeljene[0].t9
      const igre = bergerSchedule(10, true, false)
      const krogiA = new Set(igre.filter(g => g.home === a).map(g => g.round))
      for (const g of igre.filter(g => g.home === b)) {
        expect(krogiA.has(g.round)).toBe(false)
      }
    }
  })

  test('več soigriščnih parov hkrati se izide', () => {
    const o = ligaskiOpis(
      { format: 'flat', double_round: true, berger_mirror: false },
      ekipe(12, { t1: 'x', t2: 'x', t3: 'y', t4: 'y', t5: 'z', t6: 'z' }), [],
    )
    for (let seme = 1; seme <= 30; seme++) {
      const s = odigraj(o, seme)
      for (const [a, b] of [['t1','t2'],['t3','t4'],['t5','t6']] as const) {
        expect(Math.abs(s.dodeljene[0][a] - s.dodeljene[0][b])).toBe(6)
      }
      expect(preveri(o, s)).toEqual([])
    }
  })
})

describe('preveriLigaski', () => {
  const nast = { format: 'flat' as const, double_round: true, berger_mirror: false }

  test('pravilen izid nima napak', () => {
    const e = ekipe(12, { t1: 'x', t7: 'x' })
    const o = ligaskiOpis(nast, e, [])
    const s = odigraj(o, 4)
    expect(preveriLigaski(nast, e, [], s, true)).toEqual([])
  })

  test('ujame napačno razliko pri soigriščnem paru', () => {
    const e = ekipe(12, { t1: 'x', t7: 'x' })
    const s = { dodeljene: { 0: { t1: 1, t7: 2 } }, korak: 0, cakajoca: null, dnevnik: [] }
    expect(preveriLigaski(nast, e, [], s, false).some(x => /nista veljaven par/.test(x))).toBe(true)
  })

  test('ujame zaporedna nosilca v isti skupini', () => {
    const nastG = { format: 'groups' as const, double_round: true, berger_mirror: false }
    const s = { dodeljene: { 0: { t1: 1, t2: 1 } }, korak: 0, cakajoca: null, dnevnik: [] }
    expect(preveriLigaski(nastG, ekipe(12), vrstniRed12, s, false)
      .some(x => /zaporedna nosilca/.test(x))).toBe(true)
  })

  test('delno stanje ne javi lažnih napak', () => {
    const e = ekipe(12, { t1: 'x', t7: 'x' })
    const s = { dodeljene: { 0: { t3: 5 } }, korak: 0, cakajoca: null, dnevnik: [] }
    expect(preveriLigaski(nast, e, [], s, false)).toEqual([])
  })

  /** Par v RAZLIČNIH skupinah: brez preverbe čez predala bi napaka ušla. */
  test('ujame soigriščni par v različnih skupinah z neveljavnima številkama', () => {
    const nastG = { format: 'groups' as const, double_round: true, berger_mirror: false }
    const e = ekipe(12, { t1: 'x', t2: 'x' })
    const s = {
      dodeljene: { [PREDAL_SKUPINE]: { t1: 1, t2: 2 }, [PREDAL_A]: { t1: 2 }, [PREDAL_B]: { t2: 2 } },
      korak: 0, cakajoca: null, dnevnik: [],
    }
    // obe imata številko 2 — v svojih skupinah sta domači v istih krogih
    expect(preveriLigaski(nastG, e, vrstniRed12, s, false)
      .some(x => /nista veljaven par/.test(x))).toBe(true)
  })

  test('sprejme soigriščni par v različnih skupinah z veljavnima številkama', () => {
    const nastG = { format: 'groups' as const, double_round: true, berger_mirror: false }
    const e = ekipe(12, { t1: 'x', t2: 'x' })
    const s = {
      dodeljene: { [PREDAL_SKUPINE]: { t1: 1, t2: 2 }, [PREDAL_A]: { t1: 2 }, [PREDAL_B]: { t2: 5 } },
      korak: 0, cakajoca: null, dnevnik: [],
    }
    expect(preveriLigaski(nastG, e, vrstniRed12, s, false)
      .some(x => /nista veljaven par/.test(x))).toBe(false)
  })
})

describe('jeDvokrozno', () => {
  /**
   * Stolpec double_round velja samo za 'flat'; pri 'groups' in 'split' večno
   * ostane false, čeprav je faza 1 skupinske lige dvokrožna. Prenos stolpca
   * naravnost bi pri skupinski ligi dal preohlapne pare igrišč.
   */
  test('groups je vedno dvokrožen, ne glede na stolpec', () => {
    expect(jeDvokrozno({ format: 'groups', double_round: false, berger_mirror: false })).toBe(true)
  })

  test('split je vedno enokrožen, ne glede na stolpec', () => {
    expect(jeDvokrozno({ format: 'split', double_round: true, berger_mirror: false })).toBe(false)
  })

  test('flat sledi stolpcu', () => {
    expect(jeDvokrozno({ format: 'flat', double_round: true, berger_mirror: false })).toBe(true)
    expect(jeDvokrozno({ format: 'flat', double_round: false, berger_mirror: false })).toBe(false)
  })

  test('skupinska liga dobi pare dvokrožnega razporeda, tudi če je stolpec false', () => {
    const nastG = { format: 'groups' as const, double_round: false, berger_mirror: false }
    const o = ligaskiOpis(nastG, ekipe(12, { t1: 'x', t5: 'x' }), vrstniRed12)
    const s = odigraj(o, 17)
    const predal = s.dodeljene[PREDAL_A]?.t1 != null ? PREDAL_A : PREDAL_B
    const a = s.dodeljene[predal].t1, b = s.dodeljene[predal].t5
    // dvokrožno pri šestih: edina veljavna razlika je 3 (enokrožno bi dopustilo tudi 4-6)
    if (a != null && b != null) expect(Math.abs(a - b)).toBe(3)
  })
})

describe('izid je sprejemljiv za obstoječo kodo', () => {
  test('flat: bergerFixtures ne vrže izjeme', () => {
    const nast = { format: 'flat' as const, double_round: true, berger_mirror: false }
    const e = ekipe(12)
    const s = odigraj(ligaskiOpis(nast, e, []), 21)
    const zEkipami = e.map(x => ({ id: x.id, draw_number: s.dodeljene[0][x.id] }))
    expect(() => bergerFixtures(zEkipami, true, false)).not.toThrow()
  })

  test('groups: leagueGroups.validateDraw ne najde napak', () => {
    const nastG = { format: 'groups' as const, double_round: true, berger_mirror: false }
    const e = ekipe(12)
    const s = odigraj(ligaskiOpis(nastG, e, vrstniRed12), 33)
    const vrstice = e.map(x => ({
      id: x.id,
      group_label: s.dodeljene[PREDAL_A]?.[x.id] != null ? 'A' : 'B',
      draw_number: s.dodeljene[PREDAL_A]?.[x.id] ?? s.dodeljene[PREDAL_B][x.id],
    }))
    expect(validateDraw(vrstice)).toEqual([])
  })
})
```

Uvoze na vrhu datoteke dopolni:

```ts
import { bergerSchedule, bergerFixtures } from './berger'
import { validateDraw } from './leagueGroups'
import { preveriIzvedljivost, soigriscniPari, preveriLigaski, jeDvokrozno } from './zrebLiga'
```

> **Opomba:** `bergerFixtures` pričakuje ekipe z `draw_number`; točen tip preveri v `src/engines/berger.ts` (`BergerFixture`, vrstica ~122) in po potrebi prilagodi obliko objekta.

- [ ] **Step 2: Poženi teste**

Run: `npm test -- --run src/engines/zrebLiga.test.ts`
Expected: PASS, 11 testov. Če »več soigriščnih parov« pade z »ni proste partnerske številke«, je vrstni red korakov v `korakiZaNabor` napačen — soigriščni pari se morajo žrebati pred ostalimi.

- [ ] **Step 3: Commit**

```bash
git add src/engines/zrebLiga.test.ts
git commit -m "Žreb: testi za skupna rezervna igrišča, vključno s testom namena"
```

---

## Task 9: Lastnostni test — žreb se nikoli ne zatakne

**Files:**
- Modify: `src/engines/zrebLiga.test.ts`

- [ ] **Step 1: Napiši test**

```ts
describe('lastnostni test', () => {
  test('10 000 žrebov: nobene kršitve in nikoli brez veljavne številke', () => {
    const primeri = [
      { n: 12, nast: { format: 'flat' as const, double_round: true, berger_mirror: false }, skupno: { t1: 'x', t7: 'x' } },
      { n: 11, nast: { format: 'flat' as const, double_round: true, berger_mirror: false }, skupno: { t2: 'x', t8: 'x' } },
      { n: 10, nast: { format: 'split' as const, double_round: true, berger_mirror: true }, skupno: {} },
      { n: 12, nast: { format: 'groups' as const, double_round: true, berger_mirror: false }, skupno: { t1: 'x', t5: 'x' } },
    ]
    for (const p of primeri) {
      for (let seme = 1; seme <= 2500; seme++) {
        const o = ligaskiOpis(p.nast, ekipe(p.n, p.skupno), p.nast.format === 'groups' ? vrstniRed12 : [])
        const r = randIntIz(mulberry32(seme))
        let s = zacniZreb(o)
        while (!jeKoncano(o, s)) {
          const s1 = izvleciUdelezenca(o, s, r)
          const veljavne = o.koraki[s1.korak].veljavne(s1, s1.cakajoca!)
          expect(veljavne.length).toBeGreaterThan(0)
          s = izvleciStevilko(o, s1, r)
        }
        expect(preveri(o, s)).toEqual([])
      }
    }
  }, 60_000)
})
```

- [ ] **Step 2: Poženi test**

Run: `npm test -- --run src/engines/zrebLiga.test.ts`
Expected: PASS. Če traja več kot minuto, zmanjšaj `2500` na `500` in to zapiši v sporočilo commita.

- [ ] **Step 3: Commit**

```bash
git add src/engines/zrebLiga.test.ts
git commit -m "Žreb: lastnostni test 10 000 ligaških žrebov"
```

---

## Task 10: Nalaganje in shranjevanje

**Files:**
- Create: `src/lib/zrebShrani.ts`

- [ ] **Step 1: Napiši `src/lib/zrebShrani.ts`**

```ts
import { supabase } from '../supabase'
import { PREDAL_SKUPINE, PREDAL_A, PREDAL_B, type LigaEkipa, type LigaNastavitve } from '../engines/zrebLiga'
import type { ZrebStanje } from '../engines/zreb'

export interface LigaskoIzhodisce {
  nastavitve: LigaNastavitve
  ekipe: LigaEkipa[]
  /** Nosilni vrstni red (id-ji) za format 'groups'; sicer prazen. */
  nosilniVrstniRed: string[]
  imeSezone: string
}

/** Naloži vse, kar obred potrebuje. Po tem klicu zaslon ne bere več iz baze. */
export async function naloziLigaskiZreb(seasonId: string): Promise<LigaskoIzhodisce> {
  const { data: sezona, error: e1 } = await supabase
    .from('league_seasons')
    .select('id, name, format, double_round, berger_mirror')
    .eq('id', seasonId).single()
  if (e1 || !sezona) throw new Error('sezone ni mogoče naložiti')

  const { data: ekipeRaw, error: e2 } = await supabase
    .from('league_teams')
    .select('id, club_name, shared_venue_key')
    .eq('season_id', seasonId)
    .order('club_name')
  if (e2) throw new Error('ekip ni mogoče naložiti')

  const ekipe: LigaEkipa[] = (ekipeRaw ?? []).map(e => ({
    id: e.id, ime: e.club_name, shared_venue_key: e.shared_venue_key ?? null,
  }))

  return {
    nastavitve: {
      format: sezona.format,
      double_round: sezona.double_round,
      berger_mirror: sezona.berger_mirror,
    },
    ekipe,
    nosilniVrstniRed: [],
    imeSezone: sezona.name,
  }
}

/** Vrstica, ki bo posodobljena — za predogled pred zapisom. */
export interface Sprememba {
  id: string
  ime: string
  draw_number: number
  group_label: 'A' | 'B' | null
}

/** Iz končanega stanja izpelje seznam sprememb. Brez I/O — da ga zaslon pokaže. */
export function spremembe(
  izhodisce: LigaskoIzhodisce, stanje: ZrebStanje,
): Sprememba[] {
  const ime = new Map(izhodisce.ekipe.map(e => [e.id, e.ime]))
  if (izhodisce.nastavitve.format !== 'groups') {
    return Object.entries(stanje.dodeljene[PREDAL_SKUPINE] ?? {}).map(([id, n]) => ({
      id, ime: ime.get(id) ?? id, draw_number: n, group_label: null,
    }))
  }
  const out: Sprememba[] = []
  for (const [predal, oznaka] of [[PREDAL_A, 'A'], [PREDAL_B, 'B']] as const) {
    for (const [id, n] of Object.entries(stanje.dodeljene[predal] ?? {})) {
      out.push({ id, ime: ime.get(id) ?? id, draw_number: n, group_label: oznaka })
    }
  }
  return out
}

/** Zapiše izid. Kliče se šele ob izrecni potrditvi uporabnika. */
export async function shraniLigaskiZreb(spremembe: Sprememba[]): Promise<void> {
  for (const s of spremembe) {
    const { error } = await supabase
      .from('league_teams')
      .update({ draw_number: s.draw_number, group_label: s.group_label })
      .eq('id', s.id)
    if (error) throw new Error(`zapis za ${s.ime} ni uspel: ${error.message}`)
  }
}
```

- [ ] **Step 2: Preveri tipe**

Run: `npm run typecheck 2>&1 | tail -5`
Expected: število napak se ne poveča.

- [ ] **Step 3: Commit**

```bash
git add src/lib/zrebShrani.ts
git commit -m "Žreb: nalaganje sezone in zapis izida s predogledom sprememb"
```

---

## Task 11: Zaslon obreda — delovni način

**Files:**
- Create: `src/pages/Zreb.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Napiši `src/pages/Zreb.tsx`**

Zaslon hrani sklad stanj (`zgodovina`), shranjuje v `localStorage` in po vsaki potezi kliče `preveri`. Ob napaki obred ustavi.

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  zacniZreb, izvleciUdelezenca, izvleciStevilko, jeKoncano, preveri, preostale,
  type ZrebStanje,
} from '../engines/zreb'
import { ligaskiOpis, preveriIzvedljivost, preveriLigaski } from '../engines/zrebLiga'
import {
  naloziLigaskiZreb, spremembe, shraniLigaskiZreb,
  type LigaskoIzhodisce, type Sprememba,
} from '../lib/zrebShrani'

/** Enakomerno naključno celo število iz [0, n) z zavrnitvenim vzorčenjem. */
function kriptoRandInt(n: number): number {
  if (!Number.isInteger(n) || n <= 0) throw new Error('n mora biti celo število, večji od 0')
  const meja = Math.floor(0x100000000 / n) * n
  const buf = new Uint32Array(1)
  let v: number
  do { crypto.getRandomValues(buf); v = buf[0] } while (v >= meja)
  return v % n
}

export default function Zreb() {
  const { seasonId } = useParams<{ seasonId: string }>()
  const [izhodisce, setIzhodisce] = useState<LigaskoIzhodisce | null>(null)
  const [napaka, setNapaka] = useState('')
  const [zacet, setZacet] = useState(false)
  const [zgodovina, setZgodovina] = useState<ZrebStanje[]>([])
  const [predstavitev, setPredstavitev] = useState(false)
  const [shranjeno, setShranjeno] = useState(false)

  const kljuc = `zreb-liga-${seasonId}`

  useEffect(() => {
    if (!seasonId) return
    naloziLigaskiZreb(seasonId).then(setIzhodisce).catch(e => setNapaka(e.message))
  }, [seasonId])

  const opis = useMemo(
    () => (izhodisce ? ligaskiOpis(izhodisce.nastavitve, izhodisce.ekipe, izhodisce.nosilniVrstniRed) : null),
    [izhodisce],
  )
  const izvedljivost = useMemo(
    () => (izhodisce ? preveriIzvedljivost(izhodisce.ekipe, izhodisce.nastavitve) : []),
    [izhodisce],
  )

  const stanje = zgodovina[zgodovina.length - 1] ?? null
  const koncano = opis && stanje ? jeKoncano(opis, stanje) : false

  useEffect(() => {
    if (zgodovina.length) {
      try { localStorage.setItem(kljuc, JSON.stringify(zgodovina)) } catch { /* ni nujno */ }
    }
  }, [zgodovina, kljuc])

  function zacni() {
    if (!opis) return
    try {
      const shr = localStorage.getItem(kljuc)
      if (shr) {
        const z = JSON.parse(shr) as ZrebStanje[]
        if (Array.isArray(z) && z.length > 1 && confirm(`Najden je začet žreb (${z[z.length - 1].dnevnik.length} potez). Nadaljujem?`)) {
          setZgodovina(z); setZacet(true); return
        }
      }
    } catch { /* pokvarjen zapis ignoriramo */ }
    setZgodovina([zacniZreb(opis)]); setZacet(true)
  }

  function poteza() {
    if (!opis || !stanje) return
    setNapaka('')
    try {
      const novo = stanje.cakajoca
        ? izvleciStevilko(opis, stanje, kriptoRandInt)
        : izvleciUdelezenca(opis, stanje, kriptoRandInt)
      const napake = [
        ...preveri(opis, novo),
        ...preveriLigaski(
          izhodisce!.nastavitve, izhodisce!.ekipe, izhodisce!.nosilniVrstniRed,
          novo, jeKoncano(opis, novo),
        ),
      ]
      if (napake.length) throw new Error(napake.join(' | '))
      setZgodovina(z => [...z, novo])
    } catch (e) {
      setNapaka(`${e instanceof Error ? e.message : String(e)} — pritisnite Razveljavi in poskusite znova`)
    }
  }

  function razveljavi() {
    setNapaka('')
    setZgodovina(z => (z.length > 1 ? z.slice(0, -1) : z))
  }

  async function zapisi() {
    if (!izhodisce || !stanje) return
    const sp: Sprememba[] = spremembe(izhodisce, stanje)
    if (!confirm(`Zapišem ${sp.length} vrstic v bazo?`)) return
    try { await shraniLigaskiZreb(sp); setShranjeno(true) }
    catch (e) { setNapaka(e instanceof Error ? e.message : String(e)) }
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!zacet) return
      if (e.code === 'Space') { e.preventDefault(); poteza() }
      if (e.key === 'z' || e.key === 'Z') razveljavi()
      if (e.key === 'p' || e.key === 'P') setPredstavitev(v => !v)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  if (napaka && !izhodisce) return <div className="p-8 text-red-700">{napaka}</div>
  if (!izhodisce || !opis) return <div className="p-8">Nalagam …</div>

  if (izvedljivost.length) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-bold mb-4">Žreb se ne more začeti</h1>
        <ul className="list-disc pl-6 text-red-700">
          {izvedljivost.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      </div>
    )
  }

  if (!zacet) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-2">Žreb — {izhodisce.imeSezone}</h1>
        <p className="mb-4 text-gray-600">
          {izhodisce.ekipe.length} ekip · format {izhodisce.nastavitve.format}
        </p>
        <ul className="mb-6 text-sm">
          {izhodisce.ekipe.map(e => (
            <li key={e.id}>{e.ime}{e.shared_venue_key ? ` — igrišče: ${e.shared_venue_key}` : ''}</li>
          ))}
        </ul>
        <button onClick={zacni} className="px-6 py-3 bg-bocce-green text-white rounded">
          Začni žreb
        </button>
      </div>
    )
  }

  const zadnja = [...(stanje?.dnevnik ?? [])].reverse().find(v => v.tip === 'stevilka')
  const trenutniKorak = opis.koraki[stanje!.korak]

  if (predstavitev) {
    // ?ozadje=prosojno → brez ozadja, za brskalnikov vir v OBS
    const prosojno = new URLSearchParams(window.location.search).get('ozadje') === 'prosojno'
    return (
      <div
        className={`fixed inset-0 flex flex-col items-center justify-center ${prosojno ? '' : 'bg-white'}`}
        style={prosojno ? { background: 'transparent' } : undefined}
      >
        <p className="text-2xl text-gray-500 mb-6">{koncano ? 'ŽREB JE KONČAN' : trenutniKorak?.naziv}</p>
        <p className="text-6xl font-bold mb-4">
          {stanje!.cakajoca
            ? opis.udelezenci.find(u => u.id === stanje!.cakajoca)?.ime
            : zadnja ? opis.udelezenci.find(u => u.id === zadnja.udelezenecId)?.ime : ' '}
        </p>
        <p className="text-[10rem] leading-none font-bold text-bocce-green">
          {stanje!.cakajoca ? ' ' : (zadnja?.stevilka ?? ' ')}
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 grid gap-6 md:grid-cols-3">
      <section>
        <p className="text-sm font-semibold text-gray-600 mb-2">
          {koncano ? 'ŽREB JE KONČAN' : trenutniKorak?.naziv}
        </p>
        <p className="text-3xl font-bold min-h-[2.5rem]">
          {stanje!.cakajoca ? opis.udelezenci.find(u => u.id === stanje!.cakajoca)?.ime : ' '}
        </p>
        <p className="text-7xl font-bold text-bocce-green min-h-[5rem]">
          {stanje!.cakajoca ? ' ' : (zadnja?.stevilka ?? ' ')}
        </p>
        <button onClick={poteza} disabled={koncano}
          className="px-6 py-3 bg-bocce-green text-white rounded disabled:opacity-40">
          {stanje!.cakajoca ? 'Izvleci številko' : 'Izvleci ekipo'}
        </button>
        {napaka && <p className="mt-3 text-red-700 font-semibold">{napaka}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={razveljavi} disabled={zgodovina.length < 2} className="px-3 py-2 border rounded disabled:opacity-40">Razveljavi</button>
          <button onClick={() => setPredstavitev(true)} className="px-3 py-2 border rounded">Predstavitev</button>
          <button onClick={zapisi} disabled={!koncano || shranjeno} className="px-3 py-2 border rounded disabled:opacity-40">
            {shranjeno ? 'Zapisano' : 'Zapiši v bazo'}
          </button>
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Stanje</h2>
        <table className="w-full text-sm">
          <tbody>
            {izhodisce.ekipe.map(e => {
              const sp = spremembe(izhodisce, stanje!).find(x => x.id === e.id)
              return (
                <tr key={e.id} className="border-b">
                  <td>{e.ime}</td>
                  <td className="text-center">{sp?.group_label ?? ''}</td>
                  <td className="text-center font-bold">{sp?.draw_number ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Preostale številke</h2>
        <p className="mb-4">{preostale(opis, stanje!).join(', ') || '—'}</p>
        <h2 className="font-semibold mb-2">Dnevnik</h2>
        <ol className="text-xs max-h-64 overflow-y-auto">
          {[...stanje!.dnevnik].reverse().map((v, i) => (
            <li key={i}>
              {opis.udelezenci.find(u => u.id === v.udelezenecId)?.ime}
              {v.tip === 'stevilka' ? ` → ${v.stevilka}` : ' — na vrsti'}
              {v.samodejno ? ` (${v.razlog})` : ''}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Dodaj pot v `src/App.tsx`**

Ob ostale `import` vrstice dodaj:

```tsx
import Zreb from './pages/Zreb'
```

Med admin poti (za vrstico `/admin/liga`) dodaj:

```tsx
              <Route path="/admin/zreb/liga/:seasonId" element={<LeagueAdminRoute><Zreb /></LeagueAdminRoute>} />
```

- [ ] **Step 3: Preveri tipe in teste**

Run: `npm run typecheck 2>&1 | tail -5`
Expected: število napak se ne poveča.

Run: `npm test -- --run`
Expected: vsi testi PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Zreb.tsx src/App.tsx
git commit -m "Žreb: zaslon obreda z delovnim in predstavitvenim načinom"
```

---

## Task 12: Nosilni vrstni red za skupinske lige

Pri `format='groups'` je vrstni red nosilcev **bistven** — po njem se tvorijo pari, ki se razdelijo v skupini. `naloziLigaskiZreb` ga vrne prazen, `ligaskiOpis` pa takrat pade nazaj na vrstni red iz baze (po abecedi kluba), kar je napačno. Ta naloga to zapre.

Samodejno polnjenje iz lestvice prejšnje sezone je namenoma **izpuščeno** — zahteva izračun lestvice in odgovor na vprašanje, katera sezona je »prejšnja«. Admin vrstni red vnese ročno, enako kot danes vnaša žrebane številke.

**Files:**
- Modify: `src/pages/Zreb.tsx`

- [ ] **Step 1: Dodaj stanje za vrstni red**

Med ostale `useState` v `Zreb`:

```tsx
  /** id ekipe → mesto po lanski lestvici (1..N); samo za format 'groups'. */
  const [mesta, setMesta] = useState<Record<string, number>>({})
```

- [ ] **Step 2: Vrstni red posreduj v opis**

Zamenjaj `useMemo` za `opis`:

```tsx
  const nosilniVrstniRed = useMemo(() => {
    if (!izhodisce || izhodisce.nastavitve.format !== 'groups') return []
    return izhodisce.ekipe
      .filter(e => mesta[e.id])
      .sort((a, b) => mesta[a.id] - mesta[b.id])
      .map(e => e.id)
  }, [izhodisce, mesta])

  const opis = useMemo(
    () => (izhodisce ? ligaskiOpis(izhodisce.nastavitve, izhodisce.ekipe, nosilniVrstniRed) : null),
    [izhodisce, nosilniVrstniRed],
  )
```

In v `poteza` ter `preveriLigaski` uporabi `nosilniVrstniRed` namesto `izhodisce!.nosilniVrstniRed`.

- [ ] **Step 3: Na začetnem zaslonu dodaj vnos mest**

V bloku `if (!zacet)`, nad gumbom »Začni žreb«:

```tsx
        {izhodisce.nastavitve.format === 'groups' && (
          <div className="mb-6">
            <h2 className="font-semibold mb-1">Vrstni red po lanski lestvici</h2>
            <p className="text-sm text-gray-600 mb-2">
              Pari zaporednih nosilcev (1-2, 3-4 …) se razdelijo v različni skupini.
              Vpiši mesta 1–{izhodisce.ekipe.length}.
            </p>
            {izhodisce.ekipe.map(e => (
              <div key={e.id} className="flex items-center gap-2 mb-1">
                <input type="number" min={1} max={izhodisce.ekipe.length}
                  value={mesta[e.id] ?? ''}
                  onChange={ev => setMesta(m => ({ ...m, [e.id]: Number(ev.target.value) }))}
                  className="w-16 border rounded px-2 py-1" />
                <span>{e.ime}</span>
              </div>
            ))}
          </div>
        )}
```

- [ ] **Step 4: Onemogoči začetek, dokler vrstni red ni popoln**

Zamenjaj gumb »Začni žreb«:

```tsx
        {(() => {
          const potrebenRed = izhodisce.nastavitve.format === 'groups'
          const redPoln = !potrebenRed ||
            (nosilniVrstniRed.length === izhodisce.ekipe.length &&
             new Set(Object.values(mesta)).size === izhodisce.ekipe.length)
          return (
            <>
              {potrebenRed && !redPoln && (
                <p className="text-amber-700 mb-2">
                  Vsaka ekipa mora imeti svoje mesto 1–{izhodisce.ekipe.length}, brez podvojitev.
                </p>
              )}
              <button onClick={zacni} disabled={!redPoln}
                className="px-6 py-3 bg-bocce-green text-white rounded disabled:opacity-40">
                Začni žreb
              </button>
            </>
          )
        })()}
```

- [ ] **Step 5: Preveri tipe in ročno**

Run: `npm run typecheck 2>&1 | tail -5`
Expected: število napak se ne poveča.

Run: `npm run dev` in odpri žreb za skupinsko sezono — gumb mora ostati onemogočen, dokler niso vpisana vsa mesta brez podvojitev.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Zreb.tsx
git commit -m "Žreb: ročni vnos nosilnega vrstnega reda za skupinske lige"
```

---

## Task 13: Vnos ključa igrišča in povezava iz LeagueAdmin

**Files:**
- Modify: `src/pages/admin/LeagueAdmin.tsx`

- [ ] **Step 1: Poišči obstoječi vzorec**

Run: `grep -n "group_label\|draw_number" src/pages/admin/LeagueAdmin.tsx | head -12`

Obstaja `setGroupLabel`, ki spremembo najprej optimistično zapiše v `teams`, nato v bazo. Novo polje sledi istemu vzorcu.

- [ ] **Step 2: Dodaj funkcijo za shranjevanje ključa**

Ob obstoječi funkciji za `group_label`:

```tsx
  /** Vnos ključa skupnega rezervnega igrišča (optimistično v UI + shrani v bazo). */
  function setSharedVenueKey(teamId: string, v: string) {
    const kljuc = v.trim() === '' ? null : v.trim()
    setTeams(ts => ts.map(t => (t.id === teamId ? { ...t, shared_venue_key: kljuc } : t)))
    supabase.from('league_teams').update({ shared_venue_key: kljuc }).eq('id', teamId)
  }
```

- [ ] **Step 3: Dodaj polje v vrstico ekipe**

V zavihku Ekipe, ob polju `#` za `draw_number`:

```tsx
                    <label className="flex items-center gap-1 text-xs text-gray-500"
                      title="Ekipe z enakim ključem si delijo rezervno igrišče">
                      igrišče
                      <input type="text" value={t.shared_venue_key ?? ''}
                        onChange={e => setSharedVenueKey(t.id, e.target.value)}
                        className="w-28 border rounded px-2 py-1" />
                    </label>
```

- [ ] **Step 4: Dodaj povezavo na žreb**

Ob opozorilu o veljavnosti žreba:

```tsx
                  <a href={`/admin/zreb/liga/${selectedSeason.id}`}
                    className="px-3 py-2 border rounded inline-block">
                    Žreb v živo
                  </a>
```

- [ ] **Step 5: Preveri tipe**

Run: `npm run typecheck 2>&1 | tail -5`
Expected: število napak se ne poveča.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/LeagueAdmin.tsx
git commit -m "Žreb: vnos ključa igrišča in povezava na žreb v živo"
```

---

## Task 14: Končno preverjanje

- [ ] **Step 1: Vsi testi**

Run: `npm test -- --run`
Expected: vsi PASS, nobenega preskočenega.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck 2>&1 | tail -5`
Expected: največ 26 napak (izhodišče na `main` 7. 8. 2026).

- [ ] **Step 3: Ročni preizkus v razvojnem strežniku**

Run: `npm run dev`

Odpri `/admin/zreb/liga/<id obstoječe sezone>`. Preveri: seznam ekip se naloži; »Začni žreb« deluje; preslednica izmenično vleče ekipo in številko; `Z` razveljavi; `P` preklopi v predstavitev; ob koncu se pokaže gumb za zapis.

**Gumba »Zapiši v bazo« ne pritiskaj na pravi sezoni** — baza je produkcijska. Uporabi sintetično sezono s predpono `ZZ Test` in jo za sabo pobriši, kot zahteva `CLAUDE.md`.

- [ ] **Step 4: Preveri, da obred ne kliče baze**

Med žrebom odpri zavihek Network v razvijalskih orodjih. Po kliku »Začni žreb« do konca obreda ne sme biti nobene zahteve na Supabase.

- [ ] **Step 5: Commit morebitnih popravkov in PR**

```bash
git push -u origin spec/zreb-v-zivo-lige
gh pr create --title "Žreb v živo za lige" --body "Glej docs/superpowers/specs/2026-08-19-zreb-v-zivo-lige-design.md"
```

> **Ne združuj v `main` brez lastnikove potrditve** — potisk na `main` sproži produkcijski deploy, migracijo `20260819_01` pa je treba pognati ročno pred uporabo zaslona.

---

## Kaj ostane za naslednji fazi

**Faza 2 — žreb skupin turnirja.** Nov prilagojevalnik ob `zrebLiga.ts`, ki prevede `tournament_registrations` v udeležence in skupine × mesta v številke; izid gre v `group_teams`.

**Faza 3 — izločilni žreb.** Nov prilagojevalnik; številke so mesta v mreži, `veljavne` nosi pravila o blokiranih in partnerskih številkah, izid gre v `insertKnockoutBracket`.
