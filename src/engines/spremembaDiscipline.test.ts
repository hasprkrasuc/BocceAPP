import { describe, it, expect } from 'vitest'
import {
  oznakaDiscipline, posledicaSpremembeDiscipline, vprasanjeZaPotrditev,
  type StanjeTekmovanja, type OkolicaSpremembe, type DrugoPrvenstvo,
} from './spremembaDiscipline'

function stanje(p: Partial<StanjeTekmovanja> = {}): StanjeTekmovanja {
  return {
    format: 'groups',
    disciplina: null,
    kind: 'tournament',
    kategorija: 'men',
    datum: '2026-06-01',
    stPrijav: 0,
    stPrijavSPartnerjem: 0,
    imaSkupine: false,
    imaIzide: false,
    stUvrstitev: 0,
    ...p,
  }
}

function okolica(p: Partial<OkolicaSpremembe> = {}): OkolicaSpremembe {
  return { stTekemNadNovoMejo: 0, drugaPrvenstva: [], ...p }
}

function prvenstvo(p: Partial<DrugoPrvenstvo> = {}): DrugoPrvenstvo {
  return { ime: 'Drugo', disciplina: 'posamezno', datum: '2026-01-01', stUvrstitev: 0, imaIzide: true, ...p }
}

describe('oznakaDiscipline', () => {
  it('pozna zapise iz baze', () => {
    expect(oznakaDiscipline('krog')).toBe('Igra v krog')
    expect(oznakaDiscipline('igra v krog')).toBe('Igra v krog')
    expect(oznakaDiscipline('dvojka')).toBe('Dvojice')
  })

  it('nevpisano pove z besedo, neznano pusti pri miru', () => {
    expect(oznakaDiscipline(null)).toBe('ni vpisana')
    expect(oznakaDiscipline('  ')).toBe('ni vpisana')
    expect(oznakaDiscipline('balinanje po novem')).toBe('balinanje po novem')
  })
})

describe('kdaj spremembe sploh ni', () => {
  it('ista disciplina', () => {
    expect(posledicaSpremembeDiscipline(stanje({ disciplina: 'krog' }), 'krog').spremenjeno).toBe(false)
  })

  it('drug zapis iste discipline ni sprememba', () => {
    const p = posledicaSpremembeDiscipline(stanje({ disciplina: 'igra v krog' }), 'krog')
    expect(p.spremenjeno).toBe(false)
    expect(p.opozorila).toEqual([])
  })

  it('brez prijav in brez izidov je vpis discipline neškodljiv', () => {
    const p = posledicaSpremembeDiscipline(stanje({ disciplina: null }), 'krog', okolica())
    expect(p.spremenjeno).toBe(true)
    expect(p.opozorila).toEqual([])
    expect(vprasanjeZaPotrditev(stanje(), 'krog', okolica())).toBeNull()
  })
})

describe('prehod iz parne v posamično disciplino', () => {
  const parno = stanje({ disciplina: 'dvojka', stPrijav: 20, stPrijavSPartnerjem: 20 })

  it('pove, da se partnerji NE počistijo', () => {
    // Prva različica je trdila nasprotno. `teamDisplayName` se odloča po
    // vsebini prijave in discipline ne vpraša nikoli.
    const t = posledicaSpremembeDiscipline(parno, 'posamezno', okolica()).opozorila.join(' ')
    expect(t).toMatch(/NE bo počistil/)
    expect(t).toMatch(/Novak \/ Kovač/)
  })

  it('pove, da točke dobita oba igralca', () => {
    // tournamentPlacement.ts:238-241 potisne točke p1 IN p2 ne glede na disciplino.
    expect(posledicaSpremembeDiscipline(parno, 'posamezno', okolica()).opozorila.join(' '))
      .toMatch(/OBA igralca/)
  })

  it('pove, da partnerja ni mogoče odstraniti', () => {
    expect(posledicaSpremembeDiscipline(parno, 'posamezno', okolica()).opozorila.join(' '))
      .toMatch(/ni mogoče odstraniti/)
  })

  it('ednina je ednina', () => {
    const p = posledicaSpremembeDiscipline(
      stanje({ disciplina: 'dvojka', stPrijav: 1, stPrijavSPartnerjem: 1 }), 'posamezno', okolica())
    expect(p.opozorila.join(' ')).toMatch(/1 potrjena prijava ima partnerja/)
  })

  it('brez prijav ni česa opozarjati', () => {
    expect(posledicaSpremembeDiscipline(stanje({ disciplina: 'dvojka' }), 'posamezno', okolica()).opozorila)
      .toEqual([])
  })

  it('znotraj iste vrste discipline opozorila o paru ni', () => {
    // dvojka -> stafeta: obe sta parni.
    const p = posledicaSpremembeDiscipline(
      stanje({ disciplina: 'dvojka', stPrijav: 20, stPrijavSPartnerjem: 20 }), 'stafeta', okolica())
    expect(p.opozorila.join(' ')).not.toMatch(/partner/i)
  })
})

describe('prehod iz posamične v parno disciplino', () => {
  it('opozori na prijave brez partnerja', () => {
    const p = posledicaSpremembeDiscipline(
      stanje({ disciplina: 'krog', stPrijav: 10, stPrijavSPartnerjem: 0 }), 'dvojka', okolica())
    expect(p.opozorila.join(' ')).toMatch(/10 potrjenih prijav pa je brez partnerja/)
  })

  it('že žrebane skupine dobijo svojo vrstico o nosilcih', () => {
    const z = posledicaSpremembeDiscipline(
      stanje({ disciplina: 'krog', stPrijav: 10, imaSkupine: true }), 'dvojka', okolica())
    expect(z.opozorila.join(' ')).toMatch(/nosilni žreb sešteva/i)
  })
})

describe('meja rezultata', () => {
  it('znižanje meje navede število prizadetih tekem', () => {
    // Resnični primer: DP Igra v krog Člani 2025 ima 16 tekem nad 13.
    const p = posledicaSpremembeDiscipline(
      stanje({ disciplina: 'krog' }), 'dvojka', okolica({ stTekemNadNovoMejo: 16 }))
    expect(p.opozorila.join(' ')).toMatch(/pade z 200 na 13, 16 odigranih tekem presega/)
    expect(p.opozorila.join(' ')).toMatch(/popraviti ali znova shraniti pa jih ne bo mogoče/)
  })

  it('znižanje brez prizadetih tekem opozori krajše', () => {
    const t = posledicaSpremembeDiscipline(
      stanje({ disciplina: 'krog' }), 'dvojka', okolica()).opozorila.join(' ')
    expect(t).toMatch(/pade z 200 na 13/)
    expect(t).not.toMatch(/odigranih tekem presega/)
  })

  it('zvišanje meje ne opozarja', () => {
    const t = posledicaSpremembeDiscipline(
      stanje({ disciplina: 'dvojka' }), 'krog', okolica()).opozorila.join(' ')
    expect(t).not.toMatch(/Meja rezultata/)
  })

  it('med disciplinama iste meje opozorila ni', () => {
    const t = posledicaSpremembeDiscipline(
      stanje({ disciplina: 'krog' }), 'hitrostno', okolica()).opozorila.join(' ')
    expect(t).not.toMatch(/Meja rezultata/)
  })
})

describe('izdaja prvenstva na rang lestvici', () => {
  // Resnična nastavitev v bazi (23. 10. 2026), kategorija women:
  //   DP Dvojice Članice 2026   17. 5. 2026, 20 uvrstitev
  //   DP Posamezno Članice 2026 27. 6. 2026, 14 uvrstitev
  const dvojiceClanice = stanje({
    kind: 'championship', kategorija: 'women', disciplina: 'dvojka',
    datum: '2026-05-17', imaIzide: true, stUvrstitev: 20,
  })
  const posamezno2026 = prvenstvo({
    ime: 'DP Posamezno Članice 2026', disciplina: 'posamezno', datum: '2026-06-27', stUvrstitev: 14,
  })

  it('starejša izdaja ob trku izpade in to pove s številkami', () => {
    const t = posledicaSpremembeDiscipline(dvojiceClanice, 'posamezno',
      okolica({ drugaPrvenstva: [posamezno2026] })).opozorila.join(' ')
    expect(t).toMatch(/DP Posamezno Članice 2026/)
    expect(t).toMatch(/TO prvenstvo izpadlo z rang lestvice in 20 uvrstitev izgubi točke/)
  })

  it('novejša izdaja ob trku izrine drugo', () => {
    const novejse = stanje({
      kind: 'championship', kategorija: 'women', disciplina: 'dvojka',
      datum: '2026-09-01', imaIzide: true, stUvrstitev: 8,
    })
    const t = posledicaSpremembeDiscipline(novejse, 'posamezno',
      okolica({ drugaPrvenstva: [posamezno2026] })).opozorila.join(' ')
    expect(t).toMatch(/in ga izrine — 14 uvrstitev tistega prvenstva izgubi točke/)
  })

  it('izdaja, ki jo je prvenstvo izrivalo, se vrne', () => {
    const lanska = prvenstvo({
      ime: 'DP Dvojice Članice 2025', disciplina: 'dvojka', datum: '2025-05-17', stUvrstitev: 18,
    })
    const t = posledicaSpremembeDiscipline(dvojiceClanice, 'krog',
      okolica({ drugaPrvenstva: [lanska] })).opozorila.join(' ')
    expect(t).toMatch(/DP Dvojice Članice 2025.*doslej ni štelo/)
    expect(t).toMatch(/spet nosilo točke za 18 uvrstitev/)
  })

  it('prvenstvo brez izidov ne premakne ničesar', () => {
    const brez = stanje({ kind: 'championship', kategorija: 'women', disciplina: 'dvojka', datum: '2026-05-17' })
    const t = posledicaSpremembeDiscipline(brez, 'posamezno',
      okolica({ drugaPrvenstva: [posamezno2026] })).opozorila.join(' ')
    expect(t).not.toMatch(/rang lestvic/)
  })

  it('prvenstvo brez izidov med drugimi se ne upošteva', () => {
    const t = posledicaSpremembeDiscipline(dvojiceClanice, 'posamezno',
      okolica({ drugaPrvenstva: [prvenstvo({ ...posamezno2026, imaIzide: false })] })).opozorila.join(' ')
    expect(t).not.toMatch(/DP Posamezno Članice 2026/)
  })

  it('turnir se po tem ključu ne točkuje', () => {
    const turnir = stanje({ kind: 'tournament', kategorija: 'women', disciplina: 'dvojka',
      datum: '2026-05-17', imaIzide: true, stUvrstitev: 20 })
    const t = posledicaSpremembeDiscipline(turnir, 'posamezno',
      okolica({ drugaPrvenstva: [posamezno2026] })).opozorila.join(' ')
    expect(t).not.toMatch(/izpadlo z rang lestvice/)
  })

  it('brez okolice o izdajah ne ugiba', () => {
    const t = posledicaSpremembeDiscipline(dvojiceClanice, 'posamezno').opozorila.join(' ')
    expect(t).not.toMatch(/rang lestvic/)
  })
})

describe('vprasanjeZaPotrditev', () => {
  it('pove staro in novo disciplino ter vsa opozorila', () => {
    const t = vprasanjeZaPotrditev(
      stanje({
        kind: 'championship', kategorija: 'women', disciplina: 'dvojka', datum: '2026-05-17',
        stPrijav: 20, stPrijavSPartnerjem: 20, imaIzide: true, stUvrstitev: 20,
      }),
      'posamezno',
      okolica({
        stTekemNadNovoMejo: 0,
        drugaPrvenstva: [prvenstvo({ ime: 'DP Posamezno Članice 2026', datum: '2026-06-27', stUvrstitev: 14 })],
      }),
    )
    expect(t).not.toBeNull()
    expect(t!).toMatch(/Disciplina: Dvojice → Posamezno/)
    expect(t!).toMatch(/NE bo počistil/)
    expect(t!).toMatch(/DP Posamezno Članice 2026/)
    expect(t!).toMatch(/Nadaljujem\?$/)
  })

  it('brez posledic ne sprašuje', () => {
    expect(vprasanjeZaPotrditev(stanje({ disciplina: 'krog' }), 'krog', okolica())).toBeNull()
  })
})
