import { describe, test, expect } from 'vitest'
import { zacniZreb, izvleciUdelezenca, izvleciStevilko, jeKoncano, preveri } from './zreb'
import { mulberry32, randIntIz } from './zreb.test'
import { veljavniPariIgrisc } from './berger'
import { ligaskiOpis, preveriIzvedljivost, soigriscniPari, jeDvokrozno, type LigaEkipa, type LigaNastavitve } from './zrebLiga'

const ekipe = (n: number, skupno: Record<string, string> = {}): LigaEkipa[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    ime: `Ekipa ${i + 1}`,
    shared_venue_key: skupno[`t${i + 1}`] ?? null,
  }))

/** Vse ekipe v soigriščnih parih (t1+t2, t3+t4, ...) — najhujši primer za sestopanje. */
const ekipeVseVParih = (n: number): LigaEkipa[] =>
  Array.from({ length: n }, (_, i) => {
    const idx = i + 1
    const parIdx = idx % 2 === 1 ? idx : idx - 1
    return { id: `t${idx}`, ime: `Ekipa ${idx}`, shared_venue_key: `igrisce${parIdx}` }
  })

const odigraj = (opis: ReturnType<typeof ligaskiOpis>, seme: number) => {
  const r = randIntIz(mulberry32(seme))
  let s = zacniZreb(opis)
  while (!jeKoncano(opis, s)) s = izvleciStevilko(opis, izvleciUdelezenca(opis, s, r), r)
  return s
}

describe('ligaški opis — flat in split', () => {
  test('flat ima dva koraka (soigriščni pari, nato ostali) in številke 1..N', () => {
    const o = ligaskiOpis({ format: 'flat', double_round: true, berger_mirror: false }, ekipe(12), [])
    expect(o.koraki).toHaveLength(2)
    expect(o.koraki[0].stevilke(zacniZreb(o))).toEqual([1,2,3,4,5,6,7,8,9,10,11,12])
    expect(o.koraki[1].stevilke(zacniZreb(o))).toEqual([1,2,3,4,5,6,7,8,9,10,11,12])
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
    expect(o.koraki).toHaveLength(2)
    expect(o.koraki[0].stevilke(zacniZreb(o))).toHaveLength(10)
  })
})

describe('ligaški opis — soigriščni pari se razporejajo s sestopanjem', () => {
  // Pri pohlepni izbiri partnerske številke (prejšnja različica koraka
  // soigriščnih parov) se je žreb pri dveh ali več soigriščnih parih zataknil
  // v približno polovici primerov, čeprav je veljavna razporeditev vedno
  // obstajala — pohlepna izbira je le naključno zaprla edino še preostalo pot.
  // Izmerjeno pred popravkom (glej poročilo): N=4/2 para ~50 %, N=6/3 pari ~48 %
  // od 200 semen. Sestopanje mora to popolnoma odpraviti.
  test('žreb z več soigriščnimi pari se vedno dokonča in vsak par dobi veljavno razliko', () => {
    for (const n of [4, 6] as const) {
      const nastavitve = { format: 'flat' as const, double_round: false, berger_mirror: true }
      const ekipeTega = ekipeVseVParih(n)
      const pari = soigriscniPari(ekipeTega)
      const veljavni = veljavniPariIgrisc(n, jeDvokrozno(nastavitve), nastavitve.berger_mirror)
      const dovoljene = new Set(veljavni.map(([a, b]) => `${a}-${b}`))
      const o = ligaskiOpis(nastavitve, ekipeTega, [])

      for (let seme = 1; seme <= 200; seme++) {
        const r = randIntIz(mulberry32(seme))
        let s = zacniZreb(o)
        while (!jeKoncano(o, s)) {
          s = izvleciUdelezenca(o, s, r)
          const korak = o.koraki[s.korak]
          // ob vsaki potezi mora obstajati vsaj ena veljavna številka
          expect(korak.veljavne(s, s.cakajoca as string).length).toBeGreaterThan(0)
          s = izvleciStevilko(o, s, r)
        }
        expect(preveri(o, s)).toEqual([])

        const st = s.dodeljene[0]
        for (const [a, b] of pari) {
          const x = st[a], y = st[b]
          const kljuc = x < y ? `${x}-${y}` : `${y}-${x}`
          expect(dovoljene.has(kljuc)).toBe(true)
        }
      }
    }
  })
})

describe('preveriIzvedljivost — izčrpno preveri soigriščne pare pred obredom', () => {
  test('sprejme izvedljivo razporeditev (tudi tako, ki je pri pohlepni izbiri pogosto obveljala za tvegano)', () => {
    const nastavitve: LigaNastavitve = { format: 'flat', double_round: false, berger_mirror: true }
    expect(preveriIzvedljivost(ekipeVseVParih(4), nastavitve)).toEqual([])
    expect(preveriIzvedljivost(ekipeVseVParih(6), nastavitve)).toEqual([])
  })

  test('2 ekipi zavrne pred obredom z jasnim sporočilom', () => {
    const nastavitve: LigaNastavitve = { format: 'flat', double_round: false, berger_mirror: false }
    const napake = preveriIzvedljivost(ekipe(2), nastavitve)
    expect(napake.length).toBeGreaterThan(0)
    expect(napake.some(x => /3 do 12/.test(x) && /2 ekipe|2\./.test(x))).toBe(true)
  })
})
