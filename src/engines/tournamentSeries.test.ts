import { describe, test, expect } from 'vitest'
import { seriesStandings } from './tournamentSeries'

describe('seriesStandings', () => {
  test('sešteje vse rezultate, ko countBest = null', () => {
    const rows = [
      { player_id: 'a', points: 16 },
      { player_id: 'a', points: 10 },
      { player_id: 'b', points: 8 },
    ]
    const s = seriesStandings(rows, null)
    expect(s[0]).toMatchObject({ player_id: 'a', total: 26, tournaments_played: 2 })
    expect(s[1]).toMatchObject({ player_id: 'b', total: 8, tournaments_played: 1 })
  })

  test('upošteva samo najboljših N in odbije najslabše', () => {
    const rows = [
      { player_id: 'a', points: 16 },
      { player_id: 'a', points: 3 },
      { player_id: 'a', points: 10 },
    ]
    const s = seriesStandings(rows, 2)
    expect(s[0].counted.slice().sort((x, y) => y - x)).toEqual([16, 10])
    expect(s[0].dropped).toEqual([3])
    expect(s[0].total).toBe(26)
    expect(s[0].tournaments_played).toBe(3)
  })

  test('razvrsti padajoče po skupnih točkah', () => {
    const rows = [
      { player_id: 'a', points: 7 },
      { player_id: 'b', points: 16 },
      { player_id: 'c', points: 10 },
    ]
    const s = seriesStandings(rows, null)
    expect(s.map(r => r.player_id)).toEqual(['b', 'c', 'a'])
  })

  test('countBest večji od števila rezultatov šteje vse', () => {
    const rows = [{ player_id: 'a', points: 8 }]
    const s = seriesStandings(rows, 4)
    expect(s[0].total).toBe(8)
    expect(s[0].dropped).toEqual([])
  })
})
