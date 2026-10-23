import { describe, test, expect } from 'vitest'

/**
 * Javna prijava na tekmovanje mora upoštevati disciplino.
 *
 * Obrazec je nekoč zahteval partnerja VEDNO in vedno vpisal `player2_id`.
 * Na Državnem prvenstvu posamezno se zato ni bilo mogoče prijaviti drugače
 * kot v paru — na posamični disciplini nesmisel. Admin je isto razliko že
 * poznal (`isPairDiscipline` v TournamentEdit), javna stran pa ne.
 *
 * Drugič je ista težava prišla po drugi poti: obrazec za ustvarjanje
 * tekmovanja discipline sploh ni ponujal, zato je bil `discipline_type` NULL,
 * stran pa je ob praznem privzela par. Prvenstva v hitrostnem izbijanju so
 * spet zahtevala partnerja, čeprav tekmovalec nastopa sam. Odtlej o tem
 * odloča `jeParnoTekmovanje`, ki pozna tudi sistem tekmovanja, ne le
 * discipline — zato test zahteva NJO in ne več golega `isPairDiscipline`.
 */

const viri = import.meta.glob('./*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const STRAN = './Tournament.tsx'

describe('prijava na tekmovanje loči posamično od dvojic', () => {
  test('glob je res kaj prebral', () => {
    expect(viri[STRAN], `datoteke ${STRAN} ni med prebranimi`).toBeDefined()
  })

  test('stran vpraša po disciplini IN sistemu', () => {
    expect(viri[STRAN], 'Tournament.tsx ne uporablja jeParnoTekmovanje — prijava ne loči posamičnih tekmovanj od dvojic')
      .toMatch(/jeParnoTekmovanje\s*\(/)
  })

  test('privzetek se ne odloča samo po disciplini', () => {
    // Past: `discipline_type ? isPairDiscipline(...) : true` je ob prazni
    // disciplini VEDNO dalo par — tudi pri izbijanju, kjer tekmovalec nastopa
    // sam. Vzorec ne sme več obstajati.
    expect(viri[STRAN], 'privzetek »brez discipline = par« mora iti skozi jeParnoTekmovanje')
      .not.toMatch(/discipline_type\s*\?[\s\S]{0,80}:\s*true/)
  })

  test('partner ni brezpogojna zahteva', () => {
    // Stara koda: `if (!regForm.partner) { setRegError('Izberi partnerja'); return }`
    // takoj na začetku handleRegister, brez pogoja o disciplini.
    const telo = viri[STRAN].slice(
      viri[STRAN].indexOf('async function handleRegister'),
      viri[STRAN].indexOf('async function handleSaveScore'),
    )
    expect(telo.length, 'handleRegister ni bilo mogoče najti').toBeGreaterThan(0)
    expect(telo, 'zahteva po partnerju mora biti pogojena z disciplino')
      .toMatch(/if\s*\(\s*jeDvojka\s*\)/)
    expect(telo, 'player2_id se mora pri posamični disciplini vpisati kot null')
      .toMatch(/player2_id:\s*jeDvojka\s*\?/)
  })
})

/**
 * PREDOGLED IZLOČILNIH BOJEV.
 *
 * Dokler mreže ni, stran pokaže načrt iz žreba skupin. Vsako od teh mest bi
 * ob opustitvi dalo tiho napačen izid in ne zloma.
 */
const stranT = viri[STRAN]

describe('predogled izločilnih bojev', () => {
  test('predogled se izriše, dokler mreže ni', () => {
    expect(stranT).toMatch(/knockoutMatches\.length === 0 && groups\.length > 0/)
    expect(stranT).toMatch(/<IzlocilniPredogled/)
  })

  test('prava mreža se izrisuje kot doslej', () => {
    // Brž ko izločilne tekme obstajajo, se mora izvesti ista koda kot prej —
    // KnockoutBracket riše žive boje vseh turnirjev.
    expect(stranT).toMatch(/<KnockoutBracket/)
  })

  test('imena beremo iz vdelanih relacij, ne z novo poizvedbo', () => {
    // Posodobitev v živo nese samo stolpce; vdelane relacije ostanejo prazne,
    // zato bi ime ekipe, ki je med gledanjem napredovala, izpadlo.
    expect(stranT).toMatch(/imenaEkip/)
    expect(stranT, 'predogled ne sme sprožiti svoje poizvedbe group_teams')
      .not.toMatch(/from\('group_teams'\)/)
  })
})

/**
 * VAROVALO PRED MREŽO NAPAČNE VELIKOSTI.
 *
 * Gumb je preverjal, ali je število ZNANIH napredovalcev potenca 2 — ne pa,
 * ali jih je toliko, kolikor jih mora biti. Pri DP Igra v krog 2026 (4
 * skupine, 8 pričakovanih, 2 znana) bi pritisk ustvaril eno samo »finale«.
 * Ker insertKnockoutBracket najprej pobriše vse izločilne tekme, bi napačen
 * pritisk povozil tudi že pravilno mrežo.
 */
const adminVir = import.meta.glob('./admin/TournamentEdit.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('ustvarjanje izločilnega dela', () => {
  const vir = adminVir['./admin/TournamentEdit.tsx']

  test('datoteka je prebrana', () => {
    expect(vir, 'TournamentEdit.tsx ni med prebranimi').toBeDefined()
  })

  test('pred ustvarjanjem preveri POPOLNOST napredovalcev', () => {
    expect(vir, 'pravilo mora priti iz motorja').toMatch(/pripravljenostIzlocilnih\(/)
    expect(vir).toMatch(/napredovalciSoPopolni\(/)
  })

  test('varovalo velja za OBE veji — z predkolom in brez', () => {
    // Veja s predkolom je prej preverjala samo »manj kot dva«, kar je še
    // ohlapneje od potence 2.
    const klici = vir.match(/if \(!napredovalciSoPopolni\(quals\)\) return/g) ?? []
    expect(klici.length, 'varovalo manjka v eni od vej').toBe(2)
  })

  test('potenca 2 sama po sebi ne zadošča več', () => {
    // Stara preverba sme ostati kot dodatna, ne sme pa biti edina — zato
    // zahtevamo, da je klic varovala PRED njo.
    const i = vir.indexOf('napredovalciSoPopolni(quals)')
    const j = vir.indexOf('ni potenca 2')
    expect(i, 'varovala ni').toBeGreaterThan(-1)
    expect(j, 'stare preverbe ni').toBeGreaterThan(-1)
    expect(i, 'varovalo mora teči pred preverbo potence 2').toBeLessThan(j)
  })
})

/**
 * MEJA REZULTATA PRIPADA DISCIPLINI, NE OBRAZCU.
 *
 * `ScoreModal` je imel vgrajeno `a > 13 && b > 13`. 23. 10. 2026 sredi DP
 * Igra v krog sodnik ni mogel vpisati 18:19 — meja 13 je pravilo balinanja,
 * ne pravilo vseh disciplin. Odtlej odloča `engines/rezultatTekme`.
 *
 * Test varuje oboje: da obrazec pravilo res vpraša IN da stran disciplino res
 * poda. Brez drugega bi modal vsako tekmovanje imel za balinanje in sodnik bi
 * obtičal natanko tako kot prej.
 *
 * Prva različica teh trditev je bila prešibka in bi točno to spustila skozi:
 * iskala je samo besedilo `preveriRezultat(` in `discipline=`, ne pa, s čim
 * sta klicana. `preveriRezultat(a, b, 'dvojka')` v modalu, ki disciplino
 * prezre, je bil zelen. Zato trditve spodaj preverjajo ARGUMENT in tečejo
 * nad kodo brez komentarjev.
 */
const modalVir = import.meta.glob('../components/ScoreModal.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MODAL = '../components/ScoreModal.tsx'

/**
 * Koda brez komentarjev — vrstičnih, blokovnih in JSX.
 *
 * Z navadnim regularnim izrazom ni šlo: znak za vrstični komentar se pojavi
 * tudi sredi niza (vsak naslov `https://…`), zato je izraz požrl preostanek
 * PRAVE vrstice in trdo zakodirana meja bi se skrila za URL-jem. Zato beremo
 * znak za znakom in nize preskočimo.
 *
 * (Isti razlog, zakaj ta opis ne sme vsebovati zaporedja, ki konča blokovni
 * komentar — prva različica ga je in je datoteka nehala biti razčlenljiva.)
 */
function brezKomentarjev(s: string): string {
  let out = ''
  let i = 0
  let narekovaj: string | null = null
  while (i < s.length) {
    const c = s[i], d = s[i + 1]
    if (narekovaj) {
      if (c === '\\') { out += c + (d ?? ''); i += 2; continue }
      if (c === narekovaj) narekovaj = null
      out += c; i++; continue
    }
    if (c === '"' || c === "'" || c === '`') { narekovaj = c; out += c; i++; continue }
    if (c === '/' && d === '/') { while (i < s.length && s[i] !== '\n') i++; continue }
    if (c === '/' && d === '*') {
      i += 2
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++
      i += 2; continue
    }
    out += c; i++
  }
  return out
}

/** Besedilo elementa `<ScoreModal … />`, brez komentarjev in brez sosedov. */
function elementScoreModal(src: string): string {
  const koda = brezKomentarjev(src)
  const i = koda.indexOf('<ScoreModal')
  if (i < 0) return ''
  const j = koda.indexOf('/>', i)
  return j < 0 ? '' : koda.slice(i, j + 2)
}

describe('meja rezultata pozna disciplino', () => {
  const vir = modalVir[MODAL]

  test('datoteka je prebrana', () => {
    expect(vir, `datoteke ${MODAL} ni med prebranimi`).toBeDefined()
  })

  test('obrazec pravilo vpraša in mu poda SVOJO disciplino', () => {
    const koda = brezKomentarjev(vir)
    // Ne zadošča, da je `preveriRezultat` omenjen — pomemben je tretji
    // argument. `preveriRezultat(a, b, 'dvojka')` bi spet omejil vse na 13.
    expect(koda, 'preveriRezultat mora dobiti lastnost `discipline`, ne zabite discipline')
      .toMatch(/preveriRezultat\s*\(\s*a\s*,\s*b\s*,\s*discipline\s*\)/)
    expect(koda, 'najvisjiRezultat mora dobiti lastnost `discipline`')
      .toMatch(/najvisjiRezultat\s*\(\s*discipline\s*\)/)
  })

  test('obrazec nima svoje meje 13', () => {
    // Iščemo 13 v vlogi MEJE (primerjava, prireditev, `max`), ne vsake
    // trinajstice: `mb-13` v razredu Tailwind ni pravilo tekmovanja.
    const koda = brezKomentarjev(vir)
    expect(koda, 'v kodi obrazca ne sme biti več svoje meje 13')
      .not.toMatch(/(?:[<>!=]=?|max=)\s*"?13\b/)
    expect(koda, 'tudi obrnjena primerjava ne').not.toMatch(/\b13\s*[<>]/)
  })

  test('zgornja meja vnosnega polja pride iz motorja', () => {
    const koda = brezKomentarjev(vir)
    const polja = [...koda.matchAll(/max=\{?"?([^\s"}]+)"?\}?/g)].map(m => m[1])
    expect(polja.length, 'vnosni polji morata imeti max').toBe(2)
    for (const v of polja) {
      expect(v, 'max polja mora priti iz najvisjiRezultat, ne biti zabit').toBe('najvec')
    }
  })

  test('stran modalu poda disciplino', () => {
    const el = elementScoreModal(stranT)
    expect(el.length, 'elementa <ScoreModal … /> ni bilo mogoče najti').toBeGreaterThan(0)
    // Trditev velja NAD ELEMENTOM, ne nad oknom znakov: prejšnji vzorec je
    // segal čez konec elementa in bi ga zadovoljila že pojavitev pri
    // naslednji komponenti ali zakomentirana vrstica.
    expect(el, 'brez discipline modal vsako tekmovanje šteje za balinanje')
      .toMatch(/discipline=\{tournament\.discipline_type\}/)
  })
})

/**
 * Napis o prijavljenih sledi istemu pravilu kot prijava: v paru sta samo
 * štafeta in dvojica, drugod tekmovalec nastopa sam.
 */
describe('napis o prijavljenih', () => {
  test('»parov« samo tam, kjer tekmujejo pari', () => {
    expect(stranT, 'napis mora biti pogojen z jeDvojka')
      .toMatch(/jeDvojka\s*\?\s*'prijavljenih parov'/)
  })
})
