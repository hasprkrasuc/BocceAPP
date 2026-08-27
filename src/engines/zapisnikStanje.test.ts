import { describe, test, expect } from 'vitest'
import { tockeDiscipline, stanjeZapisnika, type VnosDiscipline } from './zapisnikStanje'

const v = (homeScore: string, awayScore: string): VnosDiscipline => ({ homeScore, awayScore })

describe('točke ene discipline', () => {
  test('zmaga domačih je 2:0', () => {
    expect(tockeDiscipline('13', '7')).toEqual([2, 0])
  })

  test('zmaga gostov je 0:2', () => {
    expect(tockeDiscipline('7', '13')).toEqual([0, 2])
  })

  test('izenačeno je 1:1', () => {
    expect(tockeDiscipline('10', '10')).toEqual([1, 1])
  })

  test('manjkajoča ocena pomeni neocenjeno disciplino', () => {
    expect(tockeDiscipline('', '13')).toBeNull()
    expect(tockeDiscipline('13', '')).toBeNull()
    expect(tockeDiscipline('', '')).toBeNull()
  })

  test('nesmiselna vrednost ne da točk', () => {
    expect(tockeDiscipline('abc', '7')).toBeNull()
  })

  test('nič proti nič je veljaven izid discipline in da 1:1', () => {
    // Ločiti je treba dvoje: disciplina, IGRANA in končana 0:0, obema prinese
    // po točko. Prazen zapisnik pa ni disciplina z izidom 0:0 — je odsotnost
    // vnosa in ga ujame stanjeZapisnika, ne ta funkcija.
    expect(tockeDiscipline('0', '0')).toEqual([1, 1])
  })
})

describe('stanje celotnega zapisnika', () => {
  test('prazen zapisnik nima rezultata in ostane scheduled', () => {
    const s = stanjeZapisnika([v('', ''), v('', ''), v('', '')])
    expect(s.vpisanih).toBe(0)
    expect(s.tocke).toBeNull()
    expect(s.status).toBe('scheduled')
  })

  test('zapisnik brez ene same discipline je prav tako prazen', () => {
    expect(stanjeZapisnika([]).status).toBe('scheduled')
    expect(stanjeZapisnika([]).tocke).toBeNull()
  })

  test('prva vpisana disciplina začne rezultat', () => {
    const s = stanjeZapisnika([v('13', '7'), v('', ''), v('', '')])
    expect(s.vpisanih).toBe(1)
    expect(s.tocke).toEqual({ domaci: 2, gostje: 0 })
    expect(s.status).toBe('completed')
  })

  test('polno vpisan zapisnik sešteje vse discipline', () => {
    const s = stanjeZapisnika([v('13', '7'), v('9', '13'), v('11', '11')])
    expect(s.tocke).toEqual({ domaci: 3, gostje: 3 })
    expect(s.vpisanih).toBe(3)
  })

  test('enostransko vpisana disciplina ne prinese točk', () => {
    const s = stanjeZapisnika([v('13', '')])
    expect(s.vpisanih).toBe(0)
    expect(s.tocke).toBeNull()
    expect(s.status).toBe('scheduled')
  })

  test('punti se seštejejo tudi pri enostranskem vnosu — prikaz teče med vnašanjem', () => {
    const s = stanjeZapisnika([v('13', '')])
    expect(s.punti).toEqual({ domaci: 13, gostje: 0 })
  })

  test('punti polno vpisanega zapisnika', () => {
    const s = stanjeZapisnika([v('13', '7'), v('9', '13')])
    expect(s.punti).toEqual({ domaci: 22, gostje: 20 })
  })

  test('vsota točk ne more biti 0:0, če je vpisana vsaj ena disciplina', () => {
    // To je razlog, da 0:0 v bazi zanesljivo pomeni prazen zapisnik: pri vsaki
    // ocenjeni disciplini se razdelita 2 točki.
    for (const par of [['13', '7'], ['7', '13'], ['10', '10'], ['0', '0']] as const) {
      const s = stanjeZapisnika([v(par[0], par[1])])
      expect(s.tocke!.domaci + s.tocke!.gostje).toBeGreaterThan(0)
    }
  })

  test('primer Super Liga: 12 praznih disciplin ne sme dati odigrane tekme', () => {
    // Natanko to je ustvarilo deset tekem s statusom completed in 0:0, med
    // njimi tekme z datumi v prihodnosti.
    const s = stanjeZapisnika(Array.from({ length: 12 }, () => v('', '')))
    expect(s.status).toBe('scheduled')
    expect(s.tocke).toBeNull()
  })
})
