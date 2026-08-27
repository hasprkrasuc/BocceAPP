import { describe, test, expect } from 'vitest'
import clubMemberSource from '../../api/club-member.ts?raw'
import credentialsSource from '../../api/user-credentials.ts?raw'
import migracija from '../../supabase/migrations/20260827_02_klubski_skrbnik.sql?raw'

// api/ ne sme uvažati vrednosti iz src/, med seboj pa datotek namenoma ne
// povezujemo (Vercel vsako zapakira posebej). Generator gesel zato obstaja v
// dveh izvodih; ta test ju drži skupaj.
//
// Poleg tega tu zaklenemo obe varnostni jedri — v kodi in v shemi. To niso
// slogovna pravila: brez njih klubski tajnik doseže tuje člane ali prevzame
// skrbniški račun.

/** Telo funkcije med zavitima oklepajema, ki se začneta po `marker`. */
function telo(source: string, marker: string, oznaka: string): string {
  const idx = source.indexOf(marker)
  if (idx === -1) throw new Error(`Ni markerja "${marker}" v ${oznaka}`)
  const zac = source.indexOf('{', idx)
  let globina = 0
  let i = zac
  for (; i < source.length; i++) {
    if (source[i] === '{') globina++
    else if (source[i] === '}') { globina--; if (globina === 0) break }
  }
  if (globina !== 0) throw new Error(`Nezaključen blok po "${marker}" v ${oznaka}`)
  return source.slice(zac + 1, i).replace(/\s+/g, ' ').trim()
}

const vrstica = (source: string, ime: string): string => {
  const m = new RegExp(`const ${ime} = (.+)`).exec(source)
  if (!m) throw new Error(`Ni najdene konstante ${ime}`)
  return m[1].trim()
}

describe('generator gesel je v obeh strežniških poteh enak', () => {
  test('abeceda in dolžina', () => {
    for (const ime of ['ABECEDA', 'ZNAKOV']) {
      expect(
        vrstica(clubMemberSource, ime),
        `${ime} se je razšel med api/club-member.ts in api/user-credentials.ts`,
      ).toBe(vrstica(credentialsSource, ime))
    }
  })

  test('telo ustvariGeslo', () => {
    const marker = 'function ustvariGeslo(): string'
    expect(
      telo(clubMemberSource, marker, 'api/club-member.ts'),
      'Generator gesel se je razšel — eno od poti bi lahko izdajala šibkejša gesla',
    ).toBe(telo(credentialsSource, marker, 'api/user-credentials.ts'))
  })

  test('abeceda izpušča znake, ki se ob nareku zamenjujejo', () => {
    const abeceda = vrstica(clubMemberSource, 'ABECEDA')
    for (const znak of ['I', 'O', '0', '1']) {
      expect(abeceda, `${znak} je v abecedi — gesla se narekujejo po telefonu`).not.toContain(`${znak}`)
    }
  })
})

describe('varnostni jedri klubskega skrbnika', () => {
  test('skrbništvo se preveri proti klubu TARČE, ne klicatelja', () => {
    // Brez `.eq('club_id', cilj.club_id)` bi skrbnik enega kluba dosegel člane
    // vseh klubov, katerih skrbnik je kdorkoli.
    expect(
      clubMemberSource,
      'preverba skrbništva ne veže kluba tarče — skrbnik bi dosegel tuje člane',
    ).toContain(".eq('club_id', cilj.club_id)")
  })

  test('skrbniškega računa klubski skrbnik ne more doseči', () => {
    expect(
      clubMemberSource,
      'manjka zavrnitev tarče z vlogo admin/super_admin',
    ).toMatch(/!globalniAdmin && \['admin', 'super_admin'\]\.includes/)
  })

  test('pot ne zapiše vloge, EMŠO, licence ne članstva v klubu', () => {
    // Iščemo po celotni datoteki: ta polja se ne smejo pojaviti v nobenem update.
    for (const polje of ['role:', 'emso:', 'license_number:', 'club_id:', 'date_of_birth:']) {
      expect(
        clubMemberSource,
        `api/club-member.ts zapisuje ${polje} — to presega dogovorjeni obseg vloge`,
      ).not.toContain(polje)
    }
  })
})

describe('shema klubskega skrbnika', () => {
  test('tabelo club_admins sme pisati samo globalni admin', () => {
    expect(migracija, 'manjka politika za is_admin nad club_admins')
      .toMatch(/Admin upravlja klubske skrbnike[\s\S]*?for all to authenticated[\s\S]*?is_admin/)
  })

  test('pogled ne razkriva EMŠO, datuma rojstva, licence in naslova', () => {
    const pogled = migracija.slice(migracija.indexOf('create view public.club_members'))
    for (const stolpec of ['emso', 'date_of_birth', 'license_number', 'address_street', 'address_city']) {
      expect(
        pogled,
        `pogled club_members razkriva ${stolpec} — klubski tajnik tega ne potrebuje`,
      ).not.toContain(stolpec)
    }
  })

  test('pogled je security_barrier', () => {
    expect(migracija).toContain('security_barrier = true')
  })
})
