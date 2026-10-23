import { describe, test, expect } from 'vitest'
import {
  DISCIPLINE_TEKMOVANJ, DISCIPLINE_MLADINSKE, NI_ZA_TEKMOVANJA,
  OZNAKE_DISCIPLIN, OZNAKE_LIGA, oznakaZaLigo, normalizirajDisciplino,
} from '../engines/tournamentPlacement'
import { DISCIPLINE_TYPE_LABELS } from '../engines/leagueStatsViews'
import type { DisciplineType } from '../types'

/**
 * EN BESEDNJAK DISCIPLIN ZA VSO APLIKACIJO.
 *
 * Seznami so bili PET: obrazec za tekmovanja, mladinske serije, ligaški
 * admin, ligaška statistika in tip. Vsak je povedal nekaj drugega — obrazec
 * ni ponujal bližanj, mladinske serije ne trojk, ligaški admin je pisal
 * »Hitrostno zbijanje« tam, kjer statistika piše »Hitrostno izbijanje«.
 *
 * To ni kozmetika. Disciplina določa, ali se prijavlja par ali posameznik,
 * kje je meja rezultata in katera izdaja prvenstva je to na rang lestvici.
 * Disciplina, ki je obrazec ne ponuja, je disciplina, ki je ni mogoče
 * pravilno vpisati — 23. 10. 2026 je prav to zaklenilo sodnika.
 *
 * Večino dela opravi TYPECHECK: `Record<DisciplineType, string>` zahteva
 * oznako za vsako disciplino, `DISCIPLINE_TEKMOVANJ` pa je iz oznak
 * IZPELJAN. Prva različica tega testa je to trdila po krivem, ker je bil tip
 * deklariran dvakrat in je jamstvo veljalo le za en izvod.
 *
 * Tu so trditve, ki jih prevajalnik ne zmore.
 */

describe('besednjak disciplin je skladen sam s sabo', () => {
  const vsi = Object.keys(OZNAKE_DISCIPLIN) as DisciplineType[]

  test('vsaka ponujena disciplina se normalizira sama vase', () => {
    // NAJPOMEMBNEJŠA trditev. Disciplino, ki jo obrazec ponudi,
    // `normalizirajDisciplino` pa je ne prepozna, bi obrazec vpisal v bazo,
    // nato pa bi TIHO odpovedalo troje: `jeParnoTekmovanje` bi padlo na
    // privzetek po sistemu, `rezultatTekme` bi izgubilo mejo 13 točk in
    // `kljucPrvenstva` bi se zateklo na surovi niz, zato izdaja prvenstva ne
    // bi izrinila starejše.
    for (const d of vsi) {
      expect(normalizirajDisciplino(d), `disciplina ${d} ni med znanimi zapisi`).toBe(d)
    }
  })

  test('ponujeni seznam je izpeljan iz oznak, ne prepisan', () => {
    const pricakovano = new Set(vsi.filter(d => !NI_ZA_TEKMOVANJA.includes(d)))
    expect(new Set(DISCIPLINE_TEKMOVANJ)).toEqual(pricakovano)
  })

  test('vrstni red pokrije vse discipline', () => {
    // Vrstni red je namenski; test skrbi le, da ob novi disciplini kdo ne
    // pozabi dopolniti seznama in bi ta tiho izpadla iz obrazca.
    const vRedu = new Set([...DISCIPLINE_TEKMOVANJ, ...NI_ZA_TEKMOVANJA])
    expect(vRedu).toEqual(new Set(vsi))
  })

  test('mladinske serije so ta seznam brez trojk', () => {
    expect(DISCIPLINE_MLADINSKE).toEqual(DISCIPLINE_TEKMOVANJ.filter(d => d !== 'trojka'))
  })

  test('podaljšek ni disciplina tekmovanj, oznako pa ima', () => {
    expect(DISCIPLINE_TEKMOVANJ).not.toContain('podaljsek')
    expect(OZNAKE_DISCIPLIN.podaljsek, 'rabijo jo ligaški zasloni').toBeTruthy()
  })

  test('dve disciplini se ne bereta enako', () => {
    expect(new Set(Object.values(OZNAKE_DISCIPLIN)).size).toBe(vsi.length)
    expect(new Set(vsi.map(oznakaZaLigo)).size).toBe(vsi.length)
  })

  test('ligaški odstopi so izjeme od skupnih oznak, ne drug seznam', () => {
    for (const d of Object.keys(OZNAKE_LIGA) as DisciplineType[]) {
      expect(vsi, `${d} ni disciplina`).toContain(d)
    }
    // Ligaška statistika ne sme imeti svojega prepisa.
    for (const d of vsi) {
      expect(DISCIPLINE_TYPE_LABELS[d], `ligaška oznaka za ${d} se je razšla`).toBe(oznakaZaLigo(d))
    }
  })
})

/**
 * Druga mreža: da si zaslon seznama ne napiše spet sam.
 *
 * Pregled teče po VSEH zaslonih iz globa in ne po ročno naštetih poteh —
 * prva različica je naštela tri in prav zato spregledala `LeagueAdmin`, ki
 * je imel vseh deset disciplin zabitih z lastnimi oznakami.
 *
 * Komentarje odrežemo, nize pa pustimo: projekt v komentarjih redno citira
 * staro kodo, vrednost možnosti `value="dvojka"` pa je prav niz, ki ga
 * iščemo.
 */
const zasloni = import.meta.glob(['./**/*.tsx', '../components/*.tsx'], {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

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

describe('noben zaslon si disciplin ne našteje sam', () => {
  test('glob je res prebral zaslone', () => {
    expect(Object.keys(zasloni).length, 'nobenega zaslona ni med prebranimi').toBeGreaterThan(10)
    expect(zasloni['./admin/LeagueAdmin.tsx'], 'LeagueAdmin mora biti v pregledu').toBeDefined()
  })

  test('zabitih možnosti z disciplinami ni', () => {
    const krsitve: string[] = []
    for (const [pot, vir] of Object.entries(zasloni)) {
      const koda = brezKomentarjev(vir)
      for (const m of koda.matchAll(/<option\s+[^>]*value=(?:"([^"]*)"|'([^']*)')/g)) {
        const v = (m[1] ?? m[2] ?? '').trim()
        if (v && v in OZNAKE_DISCIPLIN) krsitve.push(`${pot} → <option value="${v}">`)
      }
    }
    expect(krsitve, [
      'Te možnosti so zapisane v zaslonu namesto prebrane iz skupnega seznama.',
      'Seznami se razidejo tiho: disciplina, ki je obrazec ne ponuja, je',
      'disciplina, ki je ni mogoče vpisati. Uporabi DISCIPLINE_TEKMOVANJ',
      '(oziroma DISCIPLINE_MLADINSKE) z OZNAKE_DISCIPLIN ali oznakaZaLigo.',
      '',
      ...krsitve.map(k => `  ✗ ${k}`),
    ].join('\n')).toEqual([])
  })
})
