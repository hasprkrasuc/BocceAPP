/**
 * ADMIN — Uvoz igralcev iz BZS registracijskega obrazca (Excel)
 * Naloži .xlsx → predogled statusov (nov/posodobi/prestop/napaka) → potrditev → uvoz.
 */

import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { parseRegistrationFile } from '../../lib/playerImport/parseRegistrationXlsx'
import { computeStatuses } from '../../lib/playerImport/matchPlayers'
import type { ExistingUser, ImportReport, ImportRow, ParseResult } from '../../lib/playerImport/types'

interface SeasonOption { id: string; name: string }
interface TeamOption { id: string; club_name: string }

const STATUS_LABELS: Record<ImportRow['status'], string> = {
  new: 'nov',
  update: 'posodobi',
  transfer: 'prestop',
  error: 'napaka',
}

const STATUS_CLASSES: Record<ImportRow['status'], string> = {
  new: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  transfer: 'bg-yellow-100 text-yellow-700',
  error: 'bg-red-100 text-red-700',
}

// users ima več tisoč vrstic — privzeta Supabase omejitev je 1000 na klic.
// Brez paginacije bi ujemanje tiho zgrešilo igralce in bi vsi izpadli kot "novi".
async function fetchAllExistingUsers(): Promise<ExistingUser[]> {
  const all: ExistingUser[] = []
  let from = 0
  const PAGE = 1000
  for (;;) {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, emso, club_id, date_of_birth')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const page = (data ?? []) as ExistingUser[]
    all.push(...page)
    if (page.length < PAGE) break
    from += PAGE
  }
  return all
}

export default function PlayerImport() {
  const [seasons, setSeasons] = useState<SeasonOption[]>([])
  const [seasonId, setSeasonId] = useState('')
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [teamId, setTeamId] = useState('')
  const [newTeamName, setNewTeamName] = useState('')

  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)

  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => { loadSeasons() }, [])
  useEffect(() => { if (seasonId) loadTeams(seasonId); else { setTeams([]); setTeamId('') } }, [seasonId])

  async function loadSeasons() {
    const { data } = await supabase.from('league_seasons').select('id, name').order('name', { ascending: false })
    setSeasons((data ?? []) as SeasonOption[])
  }

  async function loadTeams(sId: string) {
    const { data } = await supabase.from('league_teams').select('id, club_name').eq('season_id', sId).order('club_name')
    setTeams((data ?? []) as TeamOption[])
    setTeamId('')
  }

  function resetParsed() {
    setParsed(null)
    setRows([])
    setReport(null)
    setSubmitError(null)
  }

  async function onFileSelected(file: File) {
    resetParsed()
    setParseError(null)
    setParsing(true)
    try {
      const result = await parseRegistrationFile(file)
      const existing = await fetchAllExistingUsers()

      const { data: club } = await supabase
        .from('clubs').select('id').ilike('name', result.club.name).maybeSingle()
      const targetClubId = club?.id || '___none___'

      setParsed(result)
      setRows(computeStatuses(result.players, existing, targetClubId))
      setNewTeamName(prev => prev || result.club.name)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e))
    } finally {
      setParsing(false)
    }
  }

  const counts = rows.reduce(
    (acc, r) => { acc[r.status]++; return acc },
    { new: 0, update: 0, transfer: 0, error: 0 } as Record<ImportRow['status'], number>
  )

  async function confirmImport() {
    if (!parsed) return
    setBusy(true)
    setSubmitError(null)
    setReport(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const playersToImport = rows.filter(r => r.status !== 'error').map(r => r.player)

      const res = await fetch('/api/import-players', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          club: parsed.club,
          target: {
            seasonId,
            teamId: teamId || null,
            newTeamClubName: teamId ? null : (newTeamName || parsed.club.name),
          },
          players: playersToImport,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Uvoz ni uspel')
      setReport(json as ImportReport)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Uvoz igralcev (Excel)</h1>
      <p className="text-sm text-gray-500 mb-8">
        Naloži BZS registracijski obrazec kluba → igralci se dodajo v klub in ligaško ekipo.
      </p>

      {/* Sezona in ekipa */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sezona</label>
          <select
            value={seasonId}
            onChange={e => setSeasonId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">— izberi sezono —</option>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {seasonId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ligaška ekipa</label>
            <select
              value={teamId}
              onChange={e => setTeamId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">➕ nova ekipa</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.club_name}</option>)}
            </select>
            {!teamId && (
              <input
                type="text"
                value={newTeamName}
                onChange={e => setNewTeamName(e.target.value)}
                placeholder="Ime nove ekipe (klub)"
                className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Excel datoteka (.xlsx)</label>
          <input
            type="file"
            accept=".xlsx"
            disabled={!seasonId || parsing}
            onChange={e => { const f = e.target.files?.[0]; if (f) onFileSelected(f) }}
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-bocce-green file:text-white file:text-sm disabled:opacity-50"
          />
          {!seasonId && <p className="text-xs text-gray-400 mt-1">Najprej izberi sezono.</p>}
          {parsing && <p className="text-xs text-gray-400 mt-1">Berem datoteko …</p>}
        </div>
      </div>

      {parseError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">
          {parseError}
        </div>
      )}

      {parsed && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <div>
              <h2 className="font-semibold text-gray-800">{parsed.club.name}</h2>
              <p className="text-sm text-gray-500">
                {seasons.find(s => s.id === seasonId)?.name} · {parsed.players.length} igralcev
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {(['new', 'update', 'transfer', 'error'] as const).map(st => (
                counts[st] > 0 && (
                  <span key={st} className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_CLASSES[st]}`}>
                    {STATUS_LABELS[st]}: {counts[st]}
                  </span>
                )
              ))}
            </div>
          </div>

          {parsed.warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg px-3 py-2 mb-4 text-xs space-y-0.5">
              {parsed.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-3">Ime</th>
                  <th className="py-2 pr-3">EMŠO</th>
                  <th className="py-2 pr-3">Rojen</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 pr-3">{r.player.fullName}</td>
                    <td className="py-2 pr-3 text-gray-500">{r.player.emso || '—'}</td>
                    <td className="py-2 pr-3 text-gray-500">{r.player.birthDate || '—'}</td>
                    <td className="py-2 pr-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASSES[r.status]}`}>
                        {STATUS_LABELS[r.status]}
                      </span>
                      {r.status === 'error' && r.error && (
                        <span className="text-xs text-red-600 ml-2">{r.error}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={confirmImport}
              disabled={busy || rows.length === 0}
              className="bg-bocce-green text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {busy ? 'Uvažam …' : 'Potrdi in uvozi'}
            </button>
          </div>
        </div>
      )}

      {submitError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">
          {submitError}
        </div>
      )}

      {report && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="font-semibold text-gray-800 mb-3">Rezultat uvoza</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {report.clubCreated && <span className="text-xs px-2 py-1 rounded-full bg-bocce-lime/20 text-gray-700">Klub ustvarjen</span>}
            {report.teamCreated && <span className="text-xs px-2 py-1 rounded-full bg-bocce-lime/20 text-gray-700">Ekipa ustvarjena</span>}
            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">novih: {report.created}</span>
            <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">posodobljenih: {report.updated}</span>
            <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">prestopov: {report.transferred}</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">dodanih v ekipo: {report.addedToTeam}</span>
          </div>

          {report.skipped.length > 0 && (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-red-700 mb-2">
                ⚠ Preskočeni igralci ({report.skipped.length}) — niso bili uvoženi
              </p>
              <ul className="space-y-1">
                {report.skipped.map((s, i) => (
                  <li key={i} className="text-sm text-red-700">
                    <span className="font-medium">{s.player}</span>: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
