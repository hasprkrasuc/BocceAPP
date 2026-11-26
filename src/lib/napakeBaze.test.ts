import { describe, it, expect } from 'vitest'
import { sporociloNapake, brezUcinka } from './napakeBaze'

// Ti testi pripnejo prav tisto, kar je 22. 11. 2026 padlo v ligi U14 2026/27:
// brisanje discipline, na katero so vezani odigrani rezultati, mora adminu
// povedati RAZLOG, ne pa tiho ne narediti nič.

describe('sporociloNapake', () => {
  it('pri brisanju razloži tuji ključ kot vezane zapise', () => {
    const s = sporociloNapake(
      { code: '23503', message: 'update or delete on table "league_season_disciplines" violates foreign key constraint' },
      'Discipline "DVOJKA"',
      'brisanje',
    )
    expect(s).toContain('Discipline "DVOJKA"')
    expect(s).toContain('vezani drugi zapisi')
    // Surovo angleško besedilo baze ne sme pricurljati na zaslon.
    expect(s).not.toContain('foreign key constraint')
  })

  it('isto kodo pri dodajanju razloži obrnjeno', () => {
    const s = sporociloNapake({ code: '23503', message: 'x' }, 'Discipline', 'dodajanje')
    expect(s).toContain('sklicuje se na zapis, ki ne obstaja')
    expect(s).not.toContain('vezani drugi zapisi')
  })

  it('namig pri brisanju nadomesti splošno razlago, ne pa je podvoji', () => {
    const s = sporociloNapake(
      { code: '23503' },
      'Prijave',
      'brisanje',
      'Igralec je že v žrebani skupini — najprej razveljavi žreb.',
    )
    expect(s).toContain('najprej razveljavi žreb')
    // Splošna razlaga govori o rezultatih tekem in bi tu zavajala.
    expect(s).not.toContain('vpisani rezultati tekem')
  })

  it('namig na drugih kodah ničesar ne spremeni', () => {
    const z = sporociloNapake({ code: '23505' }, 'Prijave', 'brisanje', 'namig')
    expect(z).not.toContain('namig')
  })

  it('pozna podvojitev, omejitev in manjkajoč podatek', () => {
    expect(sporociloNapake({ code: '23505' }, 'Ekipe', 'dodajanje')).toContain('že obstaja')
    expect(sporociloNapake({ code: '23514' }, 'Sezone', 'urejanje')).toContain('ne ustreza pravilom')
    expect(sporociloNapake({ code: '23502' }, 'Sezone', 'urejanje')).toContain('manjka obvezen podatek')
  })

  it('zavrnitev pravic pove, kaj naj admin naredi', () => {
    for (const koda of ['42501', 'PGRST301']) {
      const s = sporociloNapake({ code: koda }, 'Discipline', 'brisanje')
      expect(s).toContain('nimaš pravic')
      expect(s).toContain('znova prijavi')
    }
  })

  it('neznano kodo pokaže z izvirnim besedilom, da se sled ne izgubi', () => {
    const s = sporociloNapake({ code: 'XX000', message: 'nekaj je šlo narobe' }, 'Discipline', 'urejanje')
    expect(s).toContain('nekaj je šlo narobe')
  })

  it('shaja brez kode in brez besedila', () => {
    expect(sporociloNapake({}, 'Discipline', 'brisanje')).toContain('neznana napaka')
  })

  it('vsako sporočilo je opozorilo in omenja predmet', () => {
    const kode = ['23503', '23505', '23514', '23502', '42501', 'PGRST301', 'XX000', undefined]
    for (const code of kode) {
      for (const akcija of ['brisanje', 'dodajanje', 'urejanje'] as const) {
        const s = sporociloNapake({ code, message: 'm' }, 'Discipline "X"', akcija)
        expect(s.startsWith('⚠ ')).toBe(true)
        expect(s.length).toBeGreaterThan(20)
      }
    }
  })
})

describe('brezUcinka', () => {
  it('loči brisanje od shranjevanja in omeni pravice', () => {
    expect(brezUcinka('Discipline "X"', 'brisanje')).toContain('izbrisati')
    expect(brezUcinka('Discipline "X"', 'urejanje')).toContain('shraniti')
    expect(brezUcinka('Discipline "X"', 'brisanje')).toContain('pravic')
  })
})
