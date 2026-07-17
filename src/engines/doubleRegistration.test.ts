import { describe, it, expect } from 'vitest'
import { isFemale, eligibleSecondaryTeams, isAgeEligible, calcAge, latestSeasonsOnly, primaryTeams, birthYearOf, teamsCompatible, seasonStartYear } from './doubleRegistration'

describe('isFemale', () => {
  it('prepozna "Ž" kot žensko', () => {
    expect(isFemale('Ž')).toBe(true)
  })
  it('"M" ni ženska', () => {
    expect(isFemale('M')).toBe(false)
  })
  it('null/prazno ni ženska', () => {
    expect(isFemale(null)).toBe(false)
    expect(isFemale(undefined)).toBe(false)
    expect(isFemale('')).toBe(false)
  })
})

describe('eligibleSecondaryTeams', () => {
  const teams = [
    { id: 'w1', club_name: 'ŽBK Hrast',    tier: '1_liga',     category: 'women' },
    { id: 'ws', club_name: 'Skala Sežana', tier: 'super_liga', category: 'women' },
    { id: 'm1', club_name: 'Čirče',        tier: '1_liga',     category: 'men' },
    { id: 'ms', club_name: 'QAP Postojna', tier: 'super_liga', category: 'men' },
  ]

  it('ženska: dovoljena je samo 1. liga – članice', () => {
    const my = [{ id: 'ws', tier: 'super_liga' }]
    const res = eligibleSecondaryTeams('Ž', my, teams)
    expect(res.map(t => t.id)).toEqual(['w1'])
  })

  it('ženska: izloči ekipo, kjer je že vpisana', () => {
    const my = [{ id: 'w1', tier: '1_liga' }]
    const res = eligibleSecondaryTeams('Ž', my, teams)
    expect(res).toEqual([])
  })

  it('ženska: ne ponudi moških ekip', () => {
    const my = [{ id: 'ws', tier: 'super_liga' }]
    const res = eligibleSecondaryTeams('Ž', my, teams)
    expect(res.some(t => t.category === 'men')).toBe(false)
  })

  it('moški: super liga → 1. liga (združljiv tier), brez ženskih ekip', () => {
    const my = [{ id: 'ms', tier: 'super_liga' }]
    const res = eligibleSecondaryTeams('M', my, teams)
    expect(res.map(t => t.id)).toEqual(['m1'])
  })

  it('moški: 1. liga ne more v 2. ligo (isti termin), lahko pa v super ligo', () => {
    const extra = { id: 'm2', club_name: 'Loka', tier: '2_liga_zahod', category: 'men' }
    const my = [{ id: 'm1', tier: '1_liga' }]
    const res = eligibleSecondaryTeams('M', my, [...teams, extra])
    expect(res.map(t => t.id)).toEqual(['ms'])
  })
})

describe('teamsCompatible — terminske skupine', () => {
  const youth = { category: 'u18', tier: null }
  const u14 =   { category: 'u14', tier: null }
  const sup =   { category: 'men', tier: 'super_liga' }
  const l1 =    { category: 'men', tier: '1_liga' }
  const l2 =    { category: 'men', tier: '2_liga_zahod' }
  it('youth ↔ super in youth ↔ nižja = združljivo', () => {
    expect(teamsCompatible(youth, sup)).toBe(true)
    expect(teamsCompatible(youth, l1)).toBe(true)
  })
  it('super ↔ nižja = združljivo', () => {
    expect(teamsCompatible(sup, l1)).toBe(true)
  })
  it('1. liga ↔ 2. liga = NI (isti termin)', () => {
    expect(teamsCompatible(l1, l2)).toBe(false)
  })
  it('ista kategorija = NI (super↔super, U-18↔U-18)', () => {
    expect(teamsCompatible(sup, sup)).toBe(false)
    expect(teamsCompatible(youth, youth)).toBe(false)
  })
  it('različni mladinski kategoriji (U-14 ↔ U-18) = DA (igra navzgor)', () => {
    expect(teamsCompatible(u14, youth)).toBe(true)  // youth=u18
  })
})

describe('eligibleSecondaryTeams — igra navzgor (U-14 → U-18)', () => {
  const teams = [
    { id: 'u18a', tier: null,          category: 'u18' },
    { id: 'sup',  tier: 'super_liga',  category: 'men' },
    { id: 'l1',   tier: '1_liga',      category: 'men' },
  ]
  it('U-14 matična → ponudi U-18 (navzgor) + članske lige', () => {
    const my = [{ id: 'u14', tier: null, category: 'u14' }]
    expect(eligibleSecondaryTeams('M', my, teams).map(t => t.id).sort()).toEqual(['l1', 'sup', 'u18a'])
  })
  it('U-18 matična → NE ponudi U-14 (ni igre navzdol), le članske', () => {
    const teams2 = [
      { id: 'u14a', tier: null,         category: 'u14' },
      { id: 'sup',  tier: 'super_liga', category: 'men' },
    ]
    const my = [{ id: 'u18', tier: null, category: 'u18' }]
    expect(eligibleSecondaryTeams('M', my, teams2).map(t => t.id)).toEqual(['sup'])
  })
  it('že v U-18 → ne ponudi druge U-18 ekipe (ista kategorija trči)', () => {
    const teams3 = [{ id: 'u18b', tier: null, category: 'u18' }]
    const my = [{ id: 'u14', tier: null, category: 'u14' }, { id: 'u18a', tier: null, category: 'u18' }]
    expect(eligibleSecondaryTeams('M', my, teams3).map(t => t.id)).toEqual([])
  })
})

describe('eligibleSecondaryTeams — trojna registracija mladincev', () => {
  const men = [
    { id: 'sup', tier: 'super_liga',    category: 'men' },
    { id: 'l1',  tier: '1_liga',        category: 'men' },
    { id: 'l2',  tier: '2_liga_zahod',  category: 'men' },
  ]
  it('mladinec (U-18) → katerakoli članska liga', () => {
    const my = [{ id: 'u18', tier: null, category: 'u18' }]
    expect(eligibleSecondaryTeams('M', my, men).map(t => t.id).sort()).toEqual(['l1', 'l2', 'sup'])
  })
  it('mladinec + Super → le nižja liga', () => {
    const my = [
      { id: 'u18', tier: null,          category: 'u18' },
      { id: 'sup', tier: 'super_liga',  category: 'men' },
    ]
    expect(eligibleSecondaryTeams('M', my, men).map(t => t.id).sort()).toEqual(['l1', 'l2'])
  })
  it('mladinec + Super + 1. liga → nič (2. liga trči z 1.)', () => {
    const my = [
      { id: 'u18', tier: null,          category: 'u18' },
      { id: 'sup', tier: 'super_liga',  category: 'men' },
      { id: 'l1',  tier: '1_liga',      category: 'men' },
    ]
    expect(eligibleSecondaryTeams('M', my, men).map(t => t.id)).toEqual([])
  })
  it('prazen seznam ekip → nič (brez matične ni dvojne)', () => {
    expect(eligibleSecondaryTeams('M', [], men)).toEqual([])
  })
})

describe('isAgeEligible (≤23 velja za oba spola)', () => {
  const yearsAgo = (n: number) => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - n)
    return d.toISOString().slice(0, 10)
  }
  it('23 let je upravičen', () => {
    expect(isAgeEligible(yearsAgo(23))).toBe(true)
  })
  it('24 let ni upravičen', () => {
    expect(isAgeEligible(yearsAgo(24))).toBe(false)
  })
})

describe('isAgeEligible — po sezoni (letnik, ne dnevna starost)', () => {
  it('letnik 2002 JE upravičen za sezono 2025/26 (ref 2025): 2025−2002=23', () => {
    expect(isAgeEligible('2002-01-12', 2025)).toBe(true)
  })
  it('letnik 2002 NI upravičen za sezono 2026/27 (ref 2026): 2026−2002=24', () => {
    expect(isAgeEligible('2002-01-12', 2026)).toBe(false)
  })
  it('letnik 2003 je upravičen za ref 2026', () => {
    expect(isAgeEligible('2003-05-01', 2026)).toBe(true)
  })
  it('pikčasti datum + referenčno leto', () => {
    expect(isAgeEligible('12.1.2002', 2025)).toBe(true)
  })
})

describe('seasonStartYear', () => {
  it('vrne začetno leto iz imena sezone', () => {
    expect(seasonStartYear('Super liga 2025/26')).toBe(2025)
    expect(seasonStartYear('2025/26')).toBe(2025)
  })
  it('null / brez letnice → null', () => {
    expect(seasonStartYear(null)).toBeNull()
    expect(seasonStartYear('brez letnice')).toBeNull()
  })
})

describe('calcAge — BZS pikčasti format datuma (DD.MM.YYYY)', () => {
  // 450 profilov v bazi ima datum kot "7.2.2006". new Date() tak niz bodisi
  // zavrne bodisi ga NAROBE prebere kot ameriški M.D.YYYY (7.2. → 2. julij!).
  const pad = (x: number) => String(x).padStart(2, '0')
  const mk = (offsetDays: number, yearsBack: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    d.setFullYear(d.getFullYear() - yearsBack)
    return {
      dotted: `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`,
      padded: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`,
      iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    }
  }

  it('pikčasti datum vrne ISTO starost kot isti datum v ISO (D.M.YYYY in DD.MM.YYYY)', () => {
    // več odmikov okoli rojstnega dne — ujame zamenjavo dan/mesec in neparsiranje
    for (const off of [-100, -30, +30, +100]) {
      const { dotted, padded, iso } = mk(off, 20)
      const expected = calcAge(iso)
      expect(expected).not.toBeNull()
      expect(calcAge(dotted), `dotted ${dotted}`).toBe(expected)
      expect(calcAge(padded), `padded ${padded}`).toBe(expected)
    }
  })

  it('isAgeEligible dela s pikčastim datumom (≤23)', () => {
    expect(isAgeEligible(mk(-30, 19).dotted)).toBe(true)
    expect(isAgeEligible(mk(-30, 30).dotted)).toBe(false)
  })

  it('neveljaven datum vrne null', () => {
    expect(calcAge('20.8..1959')).toBeNull()
    expect(calcAge('ni datum')).toBeNull()
    // datum + EMŠO zlepljena skupaj (tipična napaka pri vnosu). Sintetični podatek:
    // v javen repo ne sodijo resnični EMŠO (nacionalna ID številka).
    expect(calcAge('1.1.1990.0101990500011')).toBeNull()
  })
})

describe('latestSeasonsOnly — najnovejša sezona po kategoriji+tier (tudi zaključena)', () => {
  const teams = [
    { id: 'm-new',  season: { year: 2026, category: 'men', tier: 'super_liga', status: 'completed' } },  // zaključena!
    { id: 'm-old',  season: { year: 2025, category: 'men', tier: 'super_liga', status: 'completed' } },
    { id: 'w-new',  season: { year: 2025, category: 'women', tier: '1_liga', status: 'active' } },
    { id: 'w-old',  season: { year: 2024, category: 'women', tier: '1_liga', status: 'completed' } },
    { id: 'brez',   season: null },
  ]
  it('obdrži le ekipe iz najnovejšega leta znotraj svoje kategorije+tier', () => {
    const res = latestSeasonsOnly(teams)
    expect(res.map(t => t.id).sort()).toEqual(['m-new', 'w-new'])
  })
  it('zaključena sezona NI izločena (šteje le leto)', () => {
    const res = latestSeasonsOnly(teams)
    expect(res.some(t => t.id === 'm-new')).toBe(true)  // completed, a najnovejša
  })
  it('prazen seznam vrne prazen seznam', () => {
    expect(latestSeasonsOnly([])).toEqual([])
  })
  it('prehod sezon: nova Super liga NE izloči 1./2. lige prejšnjega leta (max po tier-u)', () => {
    // admin ustvari Super ligo 2026/27, 1. liga moških je še 2025/26
    const rollover = [
      { id: 'sl-2027', season: { year: 2027, category: 'men', tier: 'super_liga', status: 'draft' } },
      { id: 'sl-2026', season: { year: 2026, category: 'men', tier: 'super_liga', status: 'completed' } },
      { id: '1l-2026', season: { year: 2026, category: 'men', tier: '1_liga', status: 'active' } },
    ]
    const res = latestSeasonsOnly(rollover)
    expect(res.map(t => t.id).sort()).toEqual(['1l-2026', 'sl-2027'])  // 1. liga OSTANE
  })
})

describe('primaryTeams — primarna ekipa za dvojno registracijo', () => {
  it('ženska: šteje KATERAKOLI njena ekipa, tudi U18 (klub pogosto nima ženske ekipe)', () => {
    // Realen primer: Veronika Vrabec (Ž, 2008) — edina ekipa Pliskovica U18
    const teams = [{ id: 'u18', season: { year: 2025, category: 'u18', tier: null as string | null } }]
    expect(primaryTeams('Ž', teams).map(t => t.id)).toEqual(['u18'])
  })
  it('ženska: ženska ekipa prav tako šteje', () => {
    const teams = [
      { id: 'w', season: { year: 2025, category: 'women', tier: '1_liga' } },
      { id: 'brez', season: null },
    ]
    expect(primaryTeams('Ž', teams).map(t => t.id)).toEqual(['w'])
  })
  it('moški: štejejo moške IN mladinske ekipe (trojna registracija mladincev)', () => {
    const teams = [
      { id: 'm', season: { year: 2026, category: 'men', tier: 'super_liga' } },
      { id: 'u18', season: { year: 2025, category: 'u18', tier: null as string | null } },
    ]
    expect(primaryTeams('M', teams).map(t => t.id).sort()).toEqual(['m', 'u18'])
  })
})

describe('birthYearOf — letnica rojstva za prikaz', () => {
  it('ISO datum', () => {
    expect(birthYearOf('2008-05-23')).toBe('2008')
  })
  it('pikčasti BZS datum (slice(0,4) bi vrnil "23.0")', () => {
    expect(birthYearOf('23.05.2008')).toBe('2008')
    expect(birthYearOf('7.2.2006')).toBe('2006')
  })
  it('neveljaven/manjkajoč datum vrne null', () => {
    expect(birthYearOf('ni datum')).toBeNull()
    expect(birthYearOf(null)).toBeNull()
    expect(birthYearOf(undefined)).toBeNull()
  })
})
