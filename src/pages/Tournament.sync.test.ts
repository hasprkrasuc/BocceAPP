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
