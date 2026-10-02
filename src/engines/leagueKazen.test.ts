import { describe, test, expect } from 'vitest'
import { calculateStandings, calculateGroupStandings, calculateSplitStandings } from './league'
import type { LeagueTeam, LeagueFixture, LeagueSeason } from '../types'

/**
 * ODBITEK TOČK ZA KAZEN.
 *
 * Kazen ni okras prikaza — po pravilu spremeni MESTO na lestvici. Zato se
 * odšteje, preden se lestvica razvrsti, in zato mora delovati v vseh treh
 * vrstah lestvic: navadni, skupinski in razdelitveni. Če bi delovala le v
 * eni, bi se vrstni red razlikoval od lige do lige, ne da bi se kaj zlomilo.
 */

const sezona = (o?: Partial<LeagueSeason>): LeagueSeason => ({
  id: 's1', name: 'Test', year: 2026, category: 'men',
  status: 'active', tier: 'super_liga', obz_name: null, rounds_count: 99,
  win_points: 2, draw_points: 1, loss_points: 0, format: 'flat',
  berger_mirror: false, double_round: false,
  ...o,
})

const ekipa = (id: string, ime: string, kazen = 0): LeagueTeam => ({
  id, season_id: 's1', club_name: ime, short_name: null, captain_id: null,
  club_id: null, draw_number: null, group_label: null,
  penalty_points: kazen,
})

const tekma = (
  id: string, dom: string, gost: string, dz: number, gz: number,
  skupina: string | null = null, krog = 1,
): LeagueFixture => ({
  id, season_id: 's1', round_number: krog,
  home_team_id: dom, away_team_id: gost,
  home_score: dz, away_score: gz, status: 'completed',
  scheduled_date: null, chief_judge_id: null, judge_ids: [],
  venue: null, group_label: skupina,
})

describe('navadna lestvica', () => {
  test('brez kazni se nič ne spremeni', () => {
    const l = calculateStandings([ekipa('a', 'A'), ekipa('b', 'B')], [tekma('f1', 'a', 'b', 6, 2)], sezona())
    expect(l[0].team.id).toBe('a')
    expect(l[0].points).toBe(2)
    expect(l[0].penaltyPoints).toBe(0)
  })

  test('odbitek zniža točke in je viden posebej', () => {
    const l = calculateStandings([ekipa('a', 'A', 2), ekipa('b', 'B')], [tekma('f1', 'a', 'b', 6, 2)], sezona())
    const a = l.find(s => s.team.id === 'a')!
    expect(a.points).toBe(0)           // 2 osvojeni − 2 kazni
    expect(a.penaltyPoints).toBe(2)
    expect(a.pointsFor, 'surova vsota match točk se ne sme spremeniti').toBe(6)
  })

  test('kazen spremeni MESTO, ne le številke', () => {
    // A ima dve zmagi (4 točke), B eno (2). Z odbitkom treh pade A pod B.
    const ekipe = [ekipa('a', 'A', 3), ekipa('b', 'B'), ekipa('c', 'C')]
    const tekme = [
      tekma('f1', 'a', 'c', 8, 0),
      tekma('f2', 'a', 'b', 8, 0, null, 2),
      tekma('f3', 'b', 'c', 8, 0, null, 3),
    ]
    const brez = calculateStandings([ekipa('a', 'A'), ekipa('b', 'B'), ekipa('c', 'C')], tekme, sezona())
    expect(brez.map(s => s.team.id), 'brez kazni je A prvi').toEqual(['a', 'b', 'c'])

    // Odbitek 3: A ima 1, B 2, C 0 — A pade z prvega na drugo mesto.
    const z = calculateStandings(ekipe, tekme, sezona())
    expect(z.map(s => s.team.id)).toEqual(['b', 'a', 'c'])
    expect(z.find(s => s.team.id === 'a')!.points).toBe(1)   // 4 − 3

    // Odbitek 5: A ima −1 in pade za C-jevo ničlo, torej na zadnje mesto.
    const hud = calculateStandings(
      [ekipa('a', 'A', 5), ekipa('b', 'B'), ekipa('c', 'C')], tekme, sezona())
    expect(hud.map(s => s.team.id)).toEqual(['b', 'c', 'a'])
    expect(hud.find(s => s.team.id === 'a')!.points).toBe(-1)
  })

  test('odbitek lahko potisne točke pod nič', () => {
    // Pravilo odbitka ne omejuje na osvojene točke; negativna vrednost je
    // zato veljavna in mora ostati, sicer bi se dve različni kazni na dnu
    // lestvice zlili v isto.
    const l = calculateStandings([ekipa('a', 'A', 5), ekipa('b', 'B', 9)], [tekma('f1', 'a', 'b', 6, 2)], sezona())
    expect(l.find(s => s.team.id === 'a')!.points).toBe(-3)
    expect(l.find(s => s.team.id === 'b')!.points).toBe(-9)
    expect(l[0].team.id, 'manj kaznovana je višje').toBe('a')
  })

  test('negativna vrednost v podatkih ne doda točk', () => {
    // Stolpec ima CHECK >= 0, a motor se nanj ne zanaša: odbitek, zapisan kot
    // −2, ekipi ne sme PRIŠTETI dveh točk.
    const l = calculateStandings([ekipa('a', 'A', -2), ekipa('b', 'B')], [tekma('f1', 'a', 'b', 6, 2)], sezona())
    expect(l.find(s => s.team.id === 'a')!.points).toBe(2)
    expect(l.find(s => s.team.id === 'a')!.penaltyPoints).toBe(0)
  })

  test('manjkajoč stolpec se bere kot brez kazni', () => {
    // Starejše poizvedbe stolpca morda ne izberejo; takrat je undefined.
    const brezStolpca = { ...ekipa('a', 'A'), penalty_points: undefined }
    const l = calculateStandings([brezStolpca, ekipa('b', 'B')], [tekma('f1', 'a', 'b', 6, 2)], sezona())
    expect(l.find(s => s.team.id === 'a')!.points).toBe(2)
  })
})

describe('skupinska lestvica', () => {
  test('odbitek velja tudi v skupini', () => {
    const ekipe = [ekipa('a', 'A', 2), ekipa('b', 'B'), ekipa('c', 'C'), ekipa('d', 'D')]
    const tekme = [
      tekma('f1', 'a', 'b', 8, 0, 'A'),
      tekma('f2', 'c', 'd', 8, 0, 'B'),
    ]
    const l = calculateGroupStandings(ekipe, tekme, sezona({ format: 'groups' }))
    expect(l.hasGroups).toBe(true)
    const a = l.phase1.A.find(s => s.team.id === 'a')!
    expect(a.points).toBe(0)
    expect(a.penaltyPoints).toBe(2)
    // Kazen ene ekipe ne sme pricurljati v drugo skupino.
    expect(l.phase1.B.find(s => s.team.id === 'c')!.points).toBe(2)
  })
})

describe('razdelitvena lestvica', () => {
  test('odbitek se v fazi 2 upošteva ENKRAT, ne dvakrat', () => {
    // Faza 2 prenese statistiko faze 1 in točke znova izpelje. Če bi se
    // odbitek upošteval v obeh korakih, bi bil dvojen.
    const ekipe = [ekipa('a', 'A', 2), ekipa('b', 'B')]
    const faza1 = [tekma('f1', 'a', 'b', 8, 0)]
    const faza2 = [tekma('f2', 'a', 'b', 8, 0, '1-5', 10)]
    const l = calculateSplitStandings(ekipe, [...faza1, ...faza2], sezona({ format: 'split' }))
    expect(l.hasSplit).toBe(true)
    expect(l.phase1.find(s => s.team.id === 'a')!.points).toBe(0)   // 2 − 2
    const vFazi2 = l.phase2!['1-5'].find(s => s.team.id === 'a')!
    expect(vFazi2.points, 'dve zmagi (4) minus ena kazen (2)').toBe(2)
    expect(vFazi2.penaltyPoints).toBe(2)
  })
})
