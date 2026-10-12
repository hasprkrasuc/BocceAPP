import { describe, test, expect } from 'vitest'
import {
  superPokalUdelezenca, superPokalDomacin, superPokalKrogi, preveriSuperPokal,
  MESTO_PRVAKA, MESTO_NASPROTNIKA, type SuperPokalEkipa,
} from './superPokal'
import { pokalniDomacin } from './pokal'

const ek = (id: string, ime: string, mesto: number | null, klub: string | null = id): SuperPokalEkipa =>
  ({ id, club_name: ime, club_id: klub, draw_number: mesto })

describe('superPokalUdelezenca', () => {
  test('različna prvaka igrata drug proti drugemu', () => {
    const par = superPokalUdelezenca(
      [{ teamId: 'pokal-a', clubId: 'A' }, { teamId: 'pokal-b', clubId: 'B' }],
      { teamId: 'liga-b', clubId: 'B' },
    )
    expect(par).toEqual({
      domacin: { teamId: 'pokal-a', vloga: 'pokalni_prvak' },
      gost: { teamId: 'liga-b', vloga: 'prvak_super_lige' },
      istiPrvak: false,
    })
  })

  test('isti prvak obojega — igra pokalni podprvak', () => {
    // Prav to je Super Pokal 2026: QAP Postojna je osvojila pokal in Super ligo.
    const par = superPokalUdelezenca(
      [{ teamId: 'pokal-qap', clubId: 'QAP' }, { teamId: 'pokal-skala', clubId: 'SKALA' }],
      { teamId: 'liga-qap', clubId: 'QAP' },
    )
    expect(par?.istiPrvak).toBe(true)
    expect(par?.domacin).toEqual({ teamId: 'pokal-qap', vloga: 'pokalni_prvak' })
    expect(par?.gost).toEqual({ teamId: 'pokal-skala', vloga: 'pokalni_podprvak' })
  })

  test('primerja po KLUBU in ne po id ekipe', () => {
    // Ekipa je vezana na sezono, zato ima isti klub v pokalu in v ligi dve
    // različni vrstici. Primerjava po id bi izjemo zgrešila vselej.
    const par = superPokalUdelezenca(
      [{ teamId: 'ekipa-1', clubId: 'QAP' }, { teamId: 'ekipa-2', clubId: 'SKALA' }],
      { teamId: 'ekipa-3', clubId: 'QAP' },
    )
    expect(par?.istiPrvak, 'id-ja se razlikujeta, klub je isti').toBe(true)
  })

  test('domačin je pokalni prvak tudi, ko je prvak lige drug', () => {
    const par = superPokalUdelezenca(
      [{ teamId: 'pokal-a', clubId: 'A' }],
      { teamId: 'liga-b', clubId: 'B' },
    )
    expect(par?.domacin.vloga).toBe('pokalni_prvak')
  })

  test('brez podatkov ne ugiba', () => {
    expect(superPokalUdelezenca([], { teamId: 'x', clubId: 'X' })).toBe(null)
    expect(superPokalUdelezenca([{ teamId: 'a', clubId: 'A' }], null)).toBe(null)
    // Isti prvak, podprvaka pa ni — para ni mogoče sestaviti.
    expect(superPokalUdelezenca([{ teamId: 'a', clubId: 'A' }], { teamId: 'b', clubId: 'A' })).toBe(null)
  })

  test('neznan klub ne sproži izjeme', () => {
    // Dve ekipi brez club_id nista nujno isti klub; izjema se ne sme ugibati.
    const par = superPokalUdelezenca(
      [{ teamId: 'a', clubId: null }], { teamId: 'b', clubId: null })
    expect(par?.istiPrvak).toBe(false)
    expect(par?.gost.vloga).toBe('prvak_super_lige')
  })
})

describe('superPokalDomacin', () => {
  test('mesto 1 je vedno doma', () => {
    expect(superPokalDomacin('prvak', 'izzivalec')).toEqual(['prvak', 'izzivalec'])
  })

  test('se razlikuje od pokalnega pravila, ko je izzivalec iz nižje lige', () => {
    // TU je razlog za svojo funkcijo. Pri izenačenem rangu da pokalniDomacin
    // isti izid, zato bi bila videti odveč — a brž ko je izzivalec iz nižje
    // lige, strani OBRNE in gostil bi izzivalec.
    const rangIzenacen = new Map([['prvak', 1], ['izzivalec', 1]])
    expect(pokalniDomacin('prvak', 'izzivalec', rangIzenacen)).toEqual(['prvak', 'izzivalec'])

    const rangNizji = new Map([['prvak', 1], ['izzivalec', 2]])
    expect(pokalniDomacin('prvak', 'izzivalec', rangNizji)).toEqual(['izzivalec', 'prvak'])
    expect(superPokalDomacin('prvak', 'izzivalec'), 'Super Pokal se vedno igra pri pokalnem prvaku')
      .toEqual(['prvak', 'izzivalec'])
  })
})

describe('superPokalKrogi', () => {
  test('en sam krog in imenuje se Finale', () => {
    // oznakeKrogov(2) bi dal »1. krog«, ker veja i === 0 prevlada.
    expect(superPokalKrogi()).toEqual([{ stage: 'final', naslov: 'Finale' }])
  })
})

describe('preveriSuperPokal', () => {
  const dobro = [ek('a', 'QAP Postojna', MESTO_PRVAKA, 'QAP'), ek('b', 'Skala Sežana', MESTO_NASPROTNIKA, 'SKALA')]

  test('pravilen vnos nima napak', () => {
    expect(preveriSuperPokal(dobro)).toEqual([])
  })

  test('ena sama ekipa je napaka, ne prosto mesto', () => {
    // Brez tega bi pajek par (ekipa, prosto) razglasil za prosto mesto in
    // pokalnega prvaka označil za zmagovalca BREZ tekme.
    const napake = preveriSuperPokal([ek('a', 'QAP Postojna', MESTO_PRVAKA, 'QAP')])
    expect(napake.length).toBeGreaterThan(0)
    expect(napake.join(' ')).toMatch(/Mesto 2 ni dodeljeno/)
  })

  test('ekipa brez mesta se opazi', () => {
    const napake = preveriSuperPokal([...dobro, ek('c', 'Tretja', null, 'C')])
    expect(napake.join(' ')).toMatch(/Tretja nima dodeljenega mesta/)
    expect(napake.join(' ')).toMatch(/natanko dve ekipi/)
  })

  test('mesto zunaj 1–2 je napaka', () => {
    const napake = preveriSuperPokal([ek('a', 'A', 1, 'A'), ek('b', 'B', 3, 'B')])
    expect(napake.join(' ')).toMatch(/Mesto 3 v Super Pokalu ne obstaja/)
    expect(napake.join(' ')).toMatch(/Mesto 2 ni dodeljeno/)
  })

  test('isto mesto dvakrat je napaka', () => {
    const napake = preveriSuperPokal([ek('a', 'A', 1, 'A'), ek('b', 'B', 1, 'B')])
    expect(napake.join(' ')).toMatch(/Isto mesto je dodeljeno dvakrat/)
  })

  test('ista kluba sta napaka', () => {
    const napake = preveriSuperPokal([ek('a', 'QAP 1', 1, 'QAP'), ek('b', 'QAP 2', 2, 'QAP')])
    expect(napake.join(' ')).toMatch(/istega kluba/)
  })

  test('ekipi brez kluba ne sprožita lažne napake', () => {
    const napake = preveriSuperPokal([ek('a', 'A', 1, null), ek('b', 'B', 2, null)])
    expect(napake).toEqual([])
  })
})
