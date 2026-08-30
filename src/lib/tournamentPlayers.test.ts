import { describe, test, expect, vi, beforeEach } from 'vitest'

/**
 * Regresija: seznam igralcev za turnirje se je tiho odrezal pri 1000 vrsticah.
 *
 * Igralci-sodniki in igralci-admini pridejo na seznam samo prek ligaških
 * postav. Branje postav je bilo napisano kot en sam `select` brez stranjenja,
 * PostgREST pa vrne največ 1000 vrstic — 29. 8. 2026 jih je bilo 4054. Kdor je
 * bil čez mejo, ga na prvenstvu ni bilo mogoče izbrati; videti je bilo, kot da
 * igralca sploh ni.
 *
 * Test postavi natanko tak primer: sodnik, ki je v postavi šele globoko za
 * mejo ene strani. Brez stranjenja pade.
 */

const VRSTIC_POSTAV = 2500
const SODNIK = 'sodnik-globoko-v-seznamu'
const MESTO_SODNIKA = 1700          // krepko čez mejo 1000

/** Zabeleži, katere razpone strani je koda dejansko zahtevala. */
const zahtevaniRazponi: Record<string, Array<[number, number]>> = {}

function odziv<T>(vrstice: T[], od: number, doVkljucno: number) {
  return Promise.resolve({ data: vrstice.slice(od, doVkljucno + 1), error: null })
}

vi.mock('../supabase', () => {
  const igralci = Array.from({ length: 1200 }, (_, i) => ({
    id: `igralec-${i}`, full_name: `Igralec ${String(i).padStart(4, '0')}`,
  }))
  const postave = Array.from({ length: VRSTIC_POSTAV }, (_, i) => ({
    player_id: i === MESTO_SODNIKA ? SODNIK : `igralec-${i % 1200}`,
  }))

  const graditelj = (tabela: string) => {
    const stanje: { idji?: string[] } = {}
    const api: Record<string, unknown> = {
      select: () => api, eq: () => api, order: () => api,
      in: (_stolpec: string, idji: string[]) => { stanje.idji = idji; return api },
      range: (od: number, doVkljucno: number) => {
        ;(zahtevaniRazponi[tabela] ??= []).push([od, doVkljucno])
        return tabela === 'users' ? odziv(igralci, od, doVkljucno) : odziv(postave, od, doVkljucno)
      },
      // `.in(...)` se počaka brez `.range(...)` — zato mora biti veriga thenable.
      then: (resolve: (v: unknown) => unknown) =>
        resolve({
          data: (stanje.idji ?? []).map(id => ({ id, full_name: id === SODNIK ? 'Branko Sodnik' : id })),
          error: null,
        }),
    }
    return api
  }
  return { supabase: { from: (tabela: string) => graditelj(tabela) } }
})

const { loadTournamentPlayers } = await import('./tournamentPlayers')

describe('loadTournamentPlayers bere vse strani', () => {
  beforeEach(() => { for (const k of Object.keys(zahtevaniRazponi)) delete zahtevaniRazponi[k] })

  test('sodnik iz postave čez mejo 1000 vrstic je na seznamu', async () => {
    const vsi = await loadTournamentPlayers()
    expect(
      vsi.some(p => p.id === SODNIK),
      'igralec s primarno vlogo sodnika, ki je v postavi šele za mejo ene strani, ' +
        'je izpadel — branje ligaških postav ni po straneh',
    ).toBe(true)
  })

  test('ligaške postave se berejo v več straneh, ne v eni', async () => {
    await loadTournamentPlayers()
    const strani = zahtevaniRazponi['league_team_players'] ?? []
    expect(strani.length, 'postave so bile prebrane v eni sami zahtevi').toBeGreaterThan(1)
    expect(strani[0]).toEqual([0, 999])
  })

  test('tudi igralci z vlogo player se berejo v več straneh', async () => {
    await loadTournamentPlayers()
    expect((zahtevaniRazponi['users'] ?? []).length).toBeGreaterThan(1)
  })
})
