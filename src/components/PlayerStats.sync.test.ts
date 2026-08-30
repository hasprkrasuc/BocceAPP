import { describe, test, expect } from 'vitest'

/**
 * Statistika igralca se izpisuje na dveh straneh — javni kartici
 * (`/igraci/:id`) in lastnem profilu (`/profil`) — iz ENE komponente.
 *
 * Prej je živela samo v kartici. Ko je bila potrebna še na profilu, je bila
 * bližnjica prepisati tabele v Profile.tsx; ta test to zapre. Dva izvoda
 * istega izpisa se razideta ob prvi spremembi pravil (rang, uspešnost,
 * kategorije) in nihče ne opazi, dokler se igralec ne pritoži, da mu profil
 * kaže drugačno številko kot kartica.
 */

const moduli = import.meta.glob('../**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** Naslovi, ki smejo stati na natanko enem mestu — v deljeni komponenti. */
const NASLOVI = ['Statistika po sezonah', 'Ligaška pot', 'Statistika turnirjev']

// Poti iz `import.meta.glob` so relativne na TO datoteko (src/components/).
const KOMPONENTA = './PlayerStats.tsx'

describe('statistika igralca je na enem mestu', () => {
  test('glob je res kaj prebral', () => {
    expect(Object.keys(moduli).length).toBeGreaterThan(20)
    expect(Object.keys(moduli)).toContain(KOMPONENTA)
  })

  test.each(NASLOVI)('naslov »%s« se pojavi samo v PlayerStats', naslov => {
    const kje = Object.entries(moduli)
      .filter(([, vsebina]) => vsebina.includes(naslov))
      .map(([pot]) => pot)
    expect(kje, `naslov "${naslov}" je prepisan še drugam — statistika naj ostane v ${KOMPONENTA}`)
      .toEqual([KOMPONENTA])
  })

  test.each([['../pages/PlayerDetail.tsx'], ['../pages/Profile.tsx']])(
    '%s izriše <PlayerStats>',
    pot => {
      const vsebina = moduli[pot]
      expect(vsebina, `datoteke ${pot} ni med prebranimi`).toBeDefined()
      expect(vsebina, `${pot} ne izrisuje statistike igralca`).toMatch(/<PlayerStats\s+playerId=/)
    },
  )
})
