import { describe, test, expect } from 'vitest'
import { nacrtZivegaZreba, prosteSkupine, prostaMesta, type ZrebDodelitev } from './zivZreb'

/** 25 parov z rangom 25 (najmočnejši) … 1, kot DP dvojic 2026. */
const PARI_25 = Array.from({ length: 25 }, (_, i) => ({ id: `P${String(i + 1).padStart(2, '0')}`, seed: 25 - i }))
/** 1 skupina po 4 + 7 po 3 (kot na DP dvojic 2026: 25 parov, 8 skupin). */
const SKUPINE_25 = [4, 3, 3, 3, 3, 3, 3, 3]

describe('žreb v živo — DP dvojic (25 parov, 8 skupin)', () => {
  const nacrt = nacrtZivegaZreba(PARI_25, SKUPINE_25)

  test('trije bobni: 8 + 8 + 9, napolnjeni po rang lestvici', () => {
    expect(nacrt.bobni.map(b => b.length)).toEqual([8, 8, 9])
    expect(nacrt.bobni[0]).toEqual(PARI_25.slice(0, 8).map(p => p.id))
    expect(nacrt.bobni[1]).toEqual(PARI_25.slice(8, 16).map(p => p.id))
    expect(nacrt.bobni[2]).toEqual(PARI_25.slice(16).map(p => p.id))
  })

  test('iz bobnov 1 in 2 dobi vsaka skupina po en par, iz bobna 3 velika dva', () => {
    expect(nacrt.kapacitete[0]).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
    expect(nacrt.kapacitete[1]).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
    expect(nacrt.kapacitete[2]).toEqual([2, 1, 1, 1, 1, 1, 1, 1])
  })

  test('vrstni red žrebanja gre po bobnih, po rangu', () => {
    expect(nacrt.vrstniRed).toEqual(PARI_25.map(p => p.id))
    expect(nacrt.bobenPara.get('P01')).toBe(0)
    expect(nacrt.bobenPara.get('P17')).toBe(2)
    expect(nacrt.bobenPara.get('P25')).toBe(2)
  })

  test('skupina, ki je par iz bobna že dobila, iz istega bobna ne more dobiti drugega', () => {
    const dodelitve: ZrebDodelitev[] = [{ id: 'P01', boben: 0, skupina: 7, sedez: 3 }]
    expect(prosteSkupine(nacrt, 0, dodelitve)).toEqual([0, 1, 2, 3, 4, 5, 6])
    // Za boben 2 je skupina H še vedno prosta.
    expect(prosteSkupine(nacrt, 1, dodelitve)).toContain(7)
  })

  test('velika skupina sprejme dva para iz bobna 3', () => {
    const dodelitve: ZrebDodelitev[] = [{ id: 'P17', boben: 2, skupina: 0, sedez: 4 }]
    expect(prosteSkupine(nacrt, 2, dodelitve)).toContain(0)
    dodelitve.push({ id: 'P18', boben: 2, skupina: 0, sedez: 3 })
    expect(prosteSkupine(nacrt, 2, dodelitve)).not.toContain(0)
  })

  test('mesto v skupini se žreba med prostimi — tudi nosilec lahko dobi mesto 3', () => {
    expect(prostaMesta(SKUPINE_25, 7, [])).toEqual([1, 2, 3])
    const dodelitve: ZrebDodelitev[] = [{ id: 'P01', boben: 0, skupina: 7, sedez: 3 }]
    expect(prostaMesta(SKUPINE_25, 7, dodelitve)).toEqual([1, 2])
    expect(prostaMesta(SKUPINE_25, 0, [])).toEqual([1, 2, 3, 4])
  })
})

describe('žreb v živo — robni primeri', () => {
  test('enako velike skupine: po en boben na nivo, kapaciteta povsod 1', () => {
    const pari = Array.from({ length: 12 }, (_, i) => ({ id: `E${i}`, seed: 12 - i }))
    const nacrt = nacrtZivegaZreba(pari, [3, 3, 3, 3])
    expect(nacrt.bobni.map(b => b.length)).toEqual([4, 4, 4])
    expect(nacrt.kapacitete.every(k => k.every(c => c === 1))).toBe(true)
  })

  test('napačno število ekip vrže napako', () => {
    expect(() => nacrtZivegaZreba(PARI_25.slice(0, 24), SKUPINE_25)).toThrow(/ne sede/)
  })

  test('izenačen rang se razvrsti deterministično (po id)', () => {
    const pari = [
      { id: 'B', seed: 5 }, { id: 'A', seed: 5 }, { id: 'C', seed: 5 },
      { id: 'D', seed: 1 }, { id: 'E', seed: 1 }, { id: 'F', seed: 1 },
    ]
    const { bobni } = nacrtZivegaZreba(pari, [3, 3])
    expect(bobni[0]).toEqual(['A', 'B'])
  })
})
