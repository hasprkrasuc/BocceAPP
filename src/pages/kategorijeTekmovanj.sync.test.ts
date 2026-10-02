import { describe, test, expect } from 'vitest'
import tournamentAdmin from './admin/TournamentAdmin.tsx?raw'
import mojaTekmovanja from './admin/MojaTekmovanja.tsx?raw'
import statsArchive from './StatsAndArchive.tsx?raw'
import home from './Home.tsx?raw'
import tournament from './Tournament.tsx?raw'
import types from '../types.ts?raw'

/**
 * OZNAKE KATEGORIJ SO V PETIH IZVODIH IN SE NE SMEJO RAZITI.
 *
 * `CATEGORY_LABELS` je preslikava `TournamentCategory` → besedilo in obstaja
 * ločeno na petih straneh; Home ima poleg nje še `CATEGORY_COLORS`. Kadar v
 * `TournamentCategory` pride nova kategorija, mora v vsako od njih.
 *
 * To ni slogovno pravilo. 2. 10. 2026 je prvenstvo »Hitrostno izbijanje U14«
 * dobilo kategorijo `u14` (prej `u15`, ki se na rang lestvici ne prepozna).
 * `u14` v tipu in v nobeni preslikavi ni obstajal, zato je bila značka
 * kategorije na štirih straneh PRAZNA — `CATEGORY_LABELS[t.category]` je
 * vrnil `undefined`. Napaka se ni pokazala kot zlom, ampak kot manjkajoče
 * besedilo.
 *
 * `Record<TournamentCategory, string>` izčrpnost sicer preverja TypeScript, a
 * `npm run build` tipov NE preverja (CLAUDE.md) in projekt CI nima. Ta test je
 * druga mreža, ki teče z `npm test`.
 */

const VIRI: Array<[string, string]> = [
  ['TournamentAdmin.tsx', tournamentAdmin],
  ['MojaTekmovanja.tsx', mojaTekmovanja],
  ['StatsAndArchive.tsx', statsArchive],
  ['Home.tsx', home],
  ['Tournament.tsx', tournament],
]

/** Ključi ene preslikave `Record<TournamentCategory, …>` iz vira. */
function kljuci(vir: string, ime: string): string[] {
  const zac = vir.indexOf(`const ${ime}: Record<TournamentCategory, string> = {`)
  if (zac === -1) throw new Error(`Ni preslikave ${ime}`)
  const konec = vir.indexOf('\n}', zac)
  const telo = vir.slice(zac, konec)
  return [...telo.matchAll(/(?:^|[{,\s])([a-z_0-9]+)\s*:/gm)].map(m => m[1])
}

/** Vrednosti unije `TournamentCategory` iz types.ts. */
function kategorijeIzTipa(): string[] {
  const m = /export type TournamentCategory = (.+)/.exec(types)
  if (!m) throw new Error('Ni tipa TournamentCategory')
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
}

describe('vsaka kategorija tekmovanja ima oznako na vseh straneh', () => {
  const kategorije = kategorijeIzTipa()

  test('tip našteje pričakovane kategorije', () => {
    expect(kategorije).toContain('u14')
    expect(kategorije.length).toBeGreaterThanOrEqual(8)
  })

  for (const [ime, vir] of VIRI) {
    test(`${ime} pokrije vse kategorije`, () => {
      const imena = kljuci(vir, 'CATEGORY_LABELS')
      for (const k of kategorije) {
        expect(imena, `${ime}: manjka oznaka za kategorijo "${k}"`).toContain(k)
      }
    })
  }

  test('Home pokrije vse kategorije tudi z barvami', () => {
    const imena = kljuci(home, 'CATEGORY_COLORS')
    for (const k of kategorije) {
      expect(imena, `Home.tsx: manjka barva za kategorijo "${k}"`).toContain(k)
    }
  })

  test('oznake se med stranmi ujemajo', () => {
    // Ne le da ključ obstaja — pisati se mora enako. »U18 Ženske« na eni in
    // »U18 ženske« na drugi strani je ista past v manjšem.
    const oznake = (vir: string) => {
      const zac = vir.indexOf('const CATEGORY_LABELS: Record<TournamentCategory, string> = {')
      const telo = vir.slice(zac, vir.indexOf('\n}', zac))
      return Object.fromEntries(
        [...telo.matchAll(/([a-z_0-9]+)\s*:\s*'([^']*)'/g)].map(m => [m[1], m[2]]),
      )
    }
    const prva = oznake(tournamentAdmin)
    for (const [ime, vir] of VIRI.slice(1)) {
      expect(oznake(vir), `${ime} se je razšel s TournamentAdmin.tsx`).toEqual(prva)
    }
  })
})
