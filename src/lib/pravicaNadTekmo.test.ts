import { describe, test, expect } from 'vitest'
import { jeAdminTeLige, smeUrejatiZapisnik } from './pravicaNadTekmo'

const SEZONA = 'sezona-1'
const DRUGA = 'sezona-2'

describe('jeAdminTeLige', () => {
  test('globalni admin upravlja vsako ligo', () => {
    expect(jeAdminTeLige({ isAdmin: true, managedSeasonIds: [], seasonId: SEZONA })).toBe(true)
  })

  test('ligaški admin upravlja SVOJO ligo', () => {
    expect(jeAdminTeLige({ isAdmin: false, managedSeasonIds: [SEZONA], seasonId: SEZONA })).toBe(true)
  })

  test('ligaški admin ne upravlja tuje lige', () => {
    expect(jeAdminTeLige({ isAdmin: false, managedSeasonIds: [DRUGA], seasonId: SEZONA })).toBe(false)
  })

  test('navaden uporabnik ne upravlja ničesar', () => {
    expect(jeAdminTeLige({ isAdmin: false, managedSeasonIds: [], seasonId: SEZONA })).toBe(false)
  })

  test('dokler sezona ni znana, pravice ni — razen za globalnega admina', () => {
    // Tekma se naloži šele po prvem izrisu; do tedaj je season_id undefined.
    expect(jeAdminTeLige({ isAdmin: false, managedSeasonIds: [SEZONA], seasonId: undefined })).toBe(false)
    expect(jeAdminTeLige({ isAdmin: false, managedSeasonIds: [SEZONA], seasonId: null })).toBe(false)
    expect(jeAdminTeLige({ isAdmin: true, managedSeasonIds: [], seasonId: undefined })).toBe(true)
  })
})

describe('smeUrejatiZapisnik', () => {
  const osnova = { isAdmin: false, managedSeasonIds: [], seasonId: SEZONA }

  test('glavni sodnik sme urejati svojo tekmo', () => {
    expect(smeUrejatiZapisnik({ ...osnova, userId: 'u1', chiefJudgeId: 'u1' })).toBe(true)
  })

  test('sodnik tuje tekme ne sme', () => {
    expect(smeUrejatiZapisnik({ ...osnova, userId: 'u1', chiefJudgeId: 'u2' })).toBe(false)
  })

  test('ligaški admin sme, tudi če ni sodnik te tekme', () => {
    expect(smeUrejatiZapisnik({
      ...osnova, managedSeasonIds: [SEZONA], userId: 'u1', chiefJudgeId: 'u2',
    })).toBe(true)
  })

  test('brez prijave ne sme nihče', () => {
    expect(smeUrejatiZapisnik({ ...osnova, userId: null, chiefJudgeId: null })).toBe(false)
  })

  test('nedoločen glavni sodnik ne odpre vrat vsem', () => {
    // Past: prazen chief_judge_id in prazen userId sta oba "prazna" — ne smeta
    // se ujeti kot enaka.
    expect(smeUrejatiZapisnik({ ...osnova, userId: undefined, chiefJudgeId: '' })).toBe(false)
    expect(smeUrejatiZapisnik({ ...osnova, userId: 'u1', chiefJudgeId: '' })).toBe(false)
  })
})

describe('zapisnik uporablja skupno pravilo', () => {
  const viri = import.meta.glob('../pages/admin/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const STRAN = '../pages/admin/LeagueMatchScoresheet.tsx'

  test('glob je res kaj prebral', () => {
    expect(viri[STRAN], `datoteke ${STRAN} ni med prebranimi`).toBeDefined()
  })

  test('pravico računa iz pravicaNadTekmo, ne iz golega isAdmin', () => {
    const v = viri[STRAN]
    expect(v, 'zapisnik ne uporablja jeAdminTeLige').toMatch(/jeAdminTeLige\s*\(/)
    expect(v, 'zapisnik ne uporablja smeUrejatiZapisnik').toMatch(/smeUrejatiZapisnik\s*\(/)
  })

  test('delegacija sodnikov ni več vezana samo na globalnega admina', () => {
    const v = viri[STRAN]
    // Stara koda: `{isAdmin && (` tik pred blokom Delegacija sodnikov.
    expect(v, 'blok delegacije se še vedno pogojuje z isAdmin')
      .not.toMatch(/\{isAdmin && \(\s*\n\s*<div[^>]*>\s*\n\s*<p[^>]*>\s*Delegacija sodnikov/)
    expect(v, 'delegacija naj se pogojuje z upravljaLigo').toMatch(/\{upravljaLigo && \(/)
  })
})
