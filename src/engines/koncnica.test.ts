import { describe, it, expect } from 'vitest'
import {
  serija, polfinale, finale, zmagovalecSerije, serijaOdlocena,
  prvoKoloPolfinala, prvoKoloFinala,
  type IzidTekme,
} from './koncnica'

const TOP4 = [
  { id: 'prvi', position: 1 },
  { id: 'drugi', position: 2 },
  { id: 'tretji', position: 3 },
  { id: 'cetrti', position: 4 },
]

const odigrana = (home: string, away: string, hs: number, as_: number): IzidTekme =>
  ({ home_team_id: home, away_team_id: away, home_score: hs, away_score: as_, status: 'completed' })
const nerazporejena = (home: string, away: string): IzidTekme =>
  ({ home_team_id: home, away_team_id: away, home_score: null, away_score: null, status: 'scheduled' })

describe('serija — prednost domačega', () => {
  const s = serija('visji', 'nizji', 'F', 22)

  it('tri tekme v zaporednih kolih', () => {
    expect(s.map(t => t.round_number)).toEqual([22, 23, 24])
    expect(s.map(t => t.tekma)).toEqual([1, 2, 3])
  })

  it('1. pri višje uvrščenem, 2. pri nižje, 3. spet pri višje', () => {
    expect(s.map(t => t.home_team_id)).toEqual(['visji', 'nizji', 'visji'])
    expect(s.map(t => t.away_team_id)).toEqual(['nizji', 'visji', 'nizji'])
  })

  it('višje uvrščeni ima dve domači tekmi od treh', () => {
    expect(s.filter(t => t.home_team_id === 'visji')).toHaveLength(2)
    expect(s.filter(t => t.home_team_id === 'nizji')).toHaveLength(1)
  })

  it('vse tri nosijo oznako faze', () => {
    expect(s.every(t => t.group_label === 'F')).toBe(true)
  })

  it('ekipa ne more igrati sama s sabo', () => {
    expect(() => serija('a', 'a', 'F', 22)).toThrow(/sama s sabo/)
  })
})

describe('polfinale — pari 1-4 in 2-3', () => {
  const pf = polfinale(TOP4, 19)

  it('šest tekem: dve seriji po tri', () => {
    expect(pf).toHaveLength(6)
    expect(pf.filter(t => t.group_label === 'SF1')).toHaveLength(3)
    expect(pf.filter(t => t.group_label === 'SF2')).toHaveLength(3)
  })

  it('SF1 je 1. proti 4., SF2 je 2. proti 3.', () => {
    const sf1 = pf.filter(t => t.group_label === 'SF1')
    const sf2 = pf.filter(t => t.group_label === 'SF2')
    expect(new Set(sf1.flatMap(t => [t.home_team_id, t.away_team_id]))).toEqual(new Set(['prvi', 'cetrti']))
    expect(new Set(sf2.flatMap(t => [t.home_team_id, t.away_team_id]))).toEqual(new Set(['drugi', 'tretji']))
  })

  it('prvouvrščeni začne doma, četrtouvrščeni v gosteh', () => {
    const sf1 = pf.filter(t => t.group_label === 'SF1')
    expect(sf1.map(t => t.home_team_id)).toEqual(['prvi', 'cetrti', 'prvi'])
  })

  it('obe seriji tečeta v istih kolih (19-21)', () => {
    expect([...new Set(pf.map(t => t.round_number))].sort()).toEqual([19, 20, 21])
    for (const kolo of [19, 20, 21]) {
      expect(pf.filter(t => t.round_number === kolo)).toHaveLength(2)
    }
  })

  it('za tretje mesto se ne igra — nobene druge faze ni', () => {
    expect(new Set(pf.map(t => t.group_label))).toEqual(new Set(['SF1', 'SF2']))
  })

  it.each([
    [[{ id: 'a', position: 1 }], /natanko 4 ekipe/],
    [[{ id: 'a', position: 1 }, { id: 'b', position: 1 }, { id: 'c', position: 3 }, { id: 'd', position: 4 }], /podvojena uvrstitev/],
    [[{ id: 'a', position: 0 }, { id: 'b', position: 2 }, { id: 'c', position: 3 }, { id: 'd', position: 4 }], /1\.\.4/],
    [[{ id: 'a', position: 1 }, { id: 'a', position: 2 }, { id: 'c', position: 3 }, { id: 'd', position: 4 }], /večkrat/],
  ])('zavrne neveljavno četverico', (vhod, napaka) => {
    expect(() => polfinale(vhod, 19)).toThrow(napaka)
  })
})

describe('zmagovalecSerije — na dve dobljeni', () => {
  it('2:0 odloči serijo, tretja ni potrebna', () => {
    const t = [odigrana('a', 'b', 13, 9), odigrana('b', 'a', 8, 14), nerazporejena('a', 'b')]
    expect(zmagovalecSerije(t)).toBe('a')
    expect(serijaOdlocena(t)).toBe(true)
  })

  it('po eni tekmi serija še ni odločena', () => {
    const t = [odigrana('a', 'b', 13, 9), nerazporejena('b', 'a'), nerazporejena('a', 'b')]
    expect(zmagovalecSerije(t)).toBeNull()
    expect(serijaOdlocena(t)).toBe(false)
  })

  it('1:1 še ni odločeno, tretja odloči', () => {
    const dve = [odigrana('a', 'b', 13, 9), odigrana('b', 'a', 15, 11)]
    expect(zmagovalecSerije(dve)).toBeNull()
    expect(zmagovalecSerije([...dve, odigrana('a', 'b', 16, 10)])).toBe('a')
    expect(zmagovalecSerije([...dve, odigrana('a', 'b', 10, 16)])).toBe('b')
  })

  it('zmaga v gosteh šteje enako kot doma', () => {
    const t = [odigrana('a', 'b', 9, 13), odigrana('b', 'a', 13, 9)]
    expect(zmagovalecSerije(t)).toBe('b')
  })

  it('neodločena tekma se ne šteje nikomur', () => {
    const t = [odigrana('a', 'b', 13, 13), odigrana('b', 'a', 13, 13), odigrana('a', 'b', 13, 13)]
    expect(zmagovalecSerije(t)).toBeNull()
  })

  it('prazna serija nima zmagovalca', () => {
    expect(zmagovalecSerije([])).toBeNull()
  })
})

describe('finale — prednost po rednem delu, ne po poti skozi polfinale', () => {
  it('zmagovalec SF2 z boljšo uvrstitvijo dobi prednost domačega', () => {
    // 2. mesto premaga 3., 4. mesto premaga 1. → v finalu je višji drugouvrščeni
    const f = finale('cetrti', 'drugi', TOP4, 22)
    expect(f.map(t => t.home_team_id)).toEqual(['drugi', 'cetrti', 'drugi'])
  })

  it('prvouvrščeni obdrži prednost, če se prebije', () => {
    const f = finale('prvi', 'tretji', TOP4, 22)
    expect(f.map(t => t.home_team_id)).toEqual(['prvi', 'tretji', 'prvi'])
  })

  it('kola 22-24 in oznaka F', () => {
    const f = finale('prvi', 'drugi', TOP4, 22)
    expect(f.map(t => t.round_number)).toEqual([22, 23, 24])
    expect(f.every(t => t.group_label === 'F')).toBe(true)
  })

  it('zavrne zmagovalca, ki ni med najboljšimi štirimi', () => {
    expect(() => finale('peti', 'drugi', TOP4, 22)).toThrow(/ni med najboljšimi štirimi/)
  })
})

describe('številčenje kol', () => {
  it('pri 18 kolih rednega dela gre polfinale v 19-21, finale v 22-24', () => {
    expect(prvoKoloPolfinala(18)).toBe(19)
    expect(prvoKoloFinala(18)).toBe(22)
    expect(polfinale(TOP4, prvoKoloPolfinala(18)).map(t => t.round_number))
      .toEqual([19, 20, 21, 19, 20, 21])
    expect(finale('prvi', 'drugi', TOP4, prvoKoloFinala(18)).map(t => t.round_number))
      .toEqual([22, 23, 24])
  })

  it('se prilagodi drugačnemu rednemu delu', () => {
    expect(prvoKoloPolfinala(22)).toBe(23)
    expect(prvoKoloFinala(22)).toBe(26)
  })
})

// Zgodovinska preverba: Super liga 2025/26 je bila odigrana natanko po tem
// pravilu. Lestvica po 18 kolih: 1. QAP, 2. Termoplasti, 3. Skala, 4. Trata.
describe('ujemanje s Super ligo 2025/26', () => {
  const lestvica2526 = [
    { id: 'QAP', position: 1 },
    { id: 'Termoplasti', position: 2 },
    { id: 'Skala', position: 3 },
    { id: 'Trata', position: 4 },
  ]

  it('polfinalna para se ujemata z odigranimi', () => {
    const pf = polfinale(lestvica2526, 19)
    const sf1 = pf.filter(t => t.group_label === 'SF1')
    const sf2 = pf.filter(t => t.group_label === 'SF2')
    expect(new Set(sf1.flatMap(t => [t.home_team_id, t.away_team_id]))).toEqual(new Set(['QAP', 'Trata']))
    expect(new Set(sf2.flatMap(t => [t.home_team_id, t.away_team_id]))).toEqual(new Set(['Termoplasti', 'Skala']))
  })

  it('dom/gost se ujema z odigranimi tekmami 19.-21. kola', () => {
    const pf = polfinale(lestvica2526, 19)
    const kdoDoma = (faza: string, kolo: number) =>
      pf.find(t => t.group_label === faza && t.round_number === kolo)!.home_team_id
    // 19. kolo: QAP – Trata in Termoplasti – Skala
    expect(kdoDoma('SF1', 19)).toBe('QAP')
    expect(kdoDoma('SF2', 19)).toBe('Termoplasti')
    // 20. kolo: Trata – QAP in Skala – Termoplasti
    expect(kdoDoma('SF1', 20)).toBe('Trata')
    expect(kdoDoma('SF2', 20)).toBe('Skala')
    // 21. kolo: QAP – Trata in Termoplasti – Skala
    expect(kdoDoma('SF1', 21)).toBe('QAP')
    expect(kdoDoma('SF2', 21)).toBe('Termoplasti')
  })

  it('QAP je polfinale dobil z 2:0, zato tretja tekma ni bila potrebna', () => {
    const serija1 = [
      odigrana('QAP', 'Trata', 14, 12),
      odigrana('Trata', 'QAP', 0, 16),
      nerazporejena('QAP', 'Trata'),
    ]
    expect(zmagovalecSerije(serija1)).toBe('QAP')
  })
})
