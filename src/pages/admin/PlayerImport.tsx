/**
 * ADMIN — Uvoz igralcev iz BZS registracijskega obrazca (Excel)
 * Naloži .xlsx → predogled statusov (nov/posodobi/prestop/napaka) → potrditev → uvoz.
 */

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import { parseRegistrationFile } from '../../lib/playerImport/parseRegistrationXlsx'
import { computeStatuses, normalizeName } from '../../lib/playerImport/matchPlayers'
import { parseBirthDate } from '../../lib/playerImport/parseDate'
import { isValidEmso, normalizeEmso } from '../../lib/playerImport/emso'
import type { ExistingUser, ImportReport, ImportRequest, ImportRow, ParseResult, ParsedPlayer, Gender } from '../../lib/playerImport/types'

interface SeasonOption { id: string; name: string }
interface TeamOption { id: string; club_name: string }
interface ClubOption { id: string; name: string }

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

// Vodilna predpona tipa kluba (BK, BD, ŠD, KK …) — klubi so v bazi poimenovani
// izjemno neenotno ("BK BEGUNJE" vs "BEGUNJE"), zato jo pri ujemanju odstranimo
// z obeh strani, preden primerjamo normalizirani imeni.
const CLUB_PREFIX_RE = /^(b\.?k\.?|bd|šd|sd|kk|bšk|šk|dbk|balin(ski)? klub)\s+/i

function stripClubPrefix(raw: string): string {
  return raw.replace(CLUB_PREFIX_RE, '').trim()
}

// Predlaga klub za samodejno izbiro (admin lahko vedno povozi) — nikoli ne odloča
// namesto admina, le olajša izbiro. Prioriteta: ime izbrane ekipe > ime iz Excela,
// najprej brez odstranjene predpone, nato še z odstranjeno predpono na obeh straneh.
function suggestClubId(clubs: ClubOption[], teamClubName: string | null, excelClubName: string | null): string {
  const candidates = [teamClubName, excelClubName].filter((s): s is string => Boolean(s && s.trim()))
  if (candidates.length === 0 || clubs.length === 0) return ''

  for (const raw of candidates) {
    const target = normalizeName(raw)
    const hit = clubs.find(c => normalizeName(c.name) === target)
    if (hit) return hit.id
  }
  for (const raw of candidates) {
    const target = normalizeName(stripClubPrefix(raw))
    const hit = clubs.find(c => normalizeName(stripClubPrefix(c.name)) === target)
    if (hit) return hit.id
  }
  return ''
}

// Skupna pot do /api/import-players za oba obrazca (masovni uvoz in ročni vnos).
async function postImport(body: ImportRequest): Promise<ImportReport> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token

  const res = await fetch('/api/import-players', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Uvoz ni uspel')
  return json as ImportReport
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
  const [clubs, setClubs] = useState<ClubOption[]>([])
  const [clubId, setClubId] = useState('')

  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [existingUsers, setExistingUsers] = useState<ExistingUser[]>([])
  const [rows, setRows] = useState<ImportRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  // zadnja samodejno izpolnjena vrednost za newTeamName; če je admin ni ročno
  // spremenil, jo ob branju druge datoteke smemo povoziti
  const lastAutofillRef = useRef('')
  // enak vzorec za samodejno predlagan klub — admin lahko predlog kadarkoli
  // povozi z izbiro v spustnem seznamu, česar potem ne smemo prepisati
  const clubIdAutoRef = useRef('')

  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => { loadSeasons() }, [])
  useEffect(() => { loadClubs() }, [])
  useEffect(() => { if (seasonId) loadTeams(seasonId); else { setTeams([]); setTeamId('') } }, [seasonId])

  // Samodejni predlog kluba: ob spremembi izbrane ekipe ali prebrane datoteke
  // znova izračunamo predlog, admin pa ga vedno lahko ročno povozi (glej
  // clubIdAutoRef zgoraj — enak vzorec kot lastAutofillRef za newTeamName).
  useEffect(() => {
    const teamClubName = teams.find(t => t.id === teamId)?.club_name ?? null
    const excelClubName = parsed?.club.name ?? null
    const suggestion = suggestClubId(clubs, teamClubName, excelClubName)
    setClubId(prev => {
      if (prev !== clubIdAutoRef.current) return prev
      clubIdAutoRef.current = suggestion
      return suggestion
    })
  }, [clubs, teams, teamId, parsed])

  // Status vsake vrstice (nov/posodobi/prestop) je odvisen od IZBRANEGA kluba —
  // druga izbira spremeni, kdo šteje za prestop. Preračunamo ob vsaki spremembi
  // kluba, ne le ob branju datoteke.
  useEffect(() => {
    if (!parsed) { setRows([]); return }
    const targetClubId = clubId || '___none___'
    setRows(computeStatuses(parsed.players, existingUsers, targetClubId))
  }, [parsed, existingUsers, clubId])

  async function loadSeasons() {
    const { data } = await supabase.from('league_seasons').select('id, name').order('name', { ascending: false })
    setSeasons((data ?? []) as SeasonOption[])
  }

  async function loadClubs() {
    // 144 vrstic — privzeta Supabase omejitev 1000 na klic tu (za zdaj) ni ovira;
    // če se seznam klubov znatno poveča, bo treba dodati paginacijo kot pri fetchAllExistingUsers.
    const { data } = await supabase.from('clubs').select('id, name').order('name')
    setClubs((data ?? []) as ClubOption[])
  }

  async function loadTeams(sId: string) {
    const { data } = await supabase.from('league_teams').select('id, club_name').eq('season_id', sId).order('club_name')
    setTeams((data ?? []) as TeamOption[])
    setTeamId('')
  }

  function resetParsed() {
    setParsed(null)
    setExistingUsers([])
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

      setParsed(result)
      setExistingUsers(existing)
      // Povozimo le, če je polje prazno ali še vsebuje prejšnje samodejno
      // izpolnjeno ime — ročnega popravka admina ne povozimo.
      setNewTeamName(prev => {
        if (prev === '' || prev === lastAutofillRef.current) {
          lastAutofillRef.current = result.club.name
          return result.club.name
        }
        return prev
      })
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
  const warningCount = rows.filter(r => r.warning).length

  const importableCount = rows.length - counts.error

  const selectedClub = clubs.find(c => c.id === clubId) ?? null

  // Ime kluba za ročni vnos: IZBRAN klub (odloča clubId) → izbrana obstoječa ekipa
  // → natipkana nova ekipa → klub iz prebrane datoteke. Ko je izbrana obstoječa
  // ekipa, je newTeamName prazen (polje je skrito), zato se ne smemo zanašati nanj.
  const selectedTeamName = teams.find(t => t.id === teamId)?.club_name ?? null
  const resolvedClubName = selectedClub?.name || (teamId ? selectedTeamName : newTeamName) || parsed?.club.name || ''

  async function confirmImport() {
    if (!parsed) return
    setSubmitError(null)
    setReport(null)

    // Sezono se da po branju datoteke ponastaviti nazaj na prazno — brez tega
    // bi poslali target.seasonId: ''
    if (!seasonId) {
      setSubmitError('Izberi sezono.')
      return
    }

    const playersToImport = rows.filter(r => r.status !== 'error').map(r => r.player)
    if (playersToImport.length === 0) {
      setSubmitError('Ni igralcev za uvoz (vse vrstice so napaka).')
      return
    }

    setBusy(true)
    try {
      const result = await postImport({
        club: parsed.club,
        target: {
          seasonId,
          clubId: clubId || null,
          teamId: teamId || null,
          newTeamClubName: teamId ? null : (newTeamName || parsed.club.name),
        },
        players: playersToImport,
      })
      setReport(result)
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

        {seasonId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Klub</label>
            <select
              value={clubId}
              onChange={e => setClubId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">➕ nov klub (ustvari)</option>
              {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Ime kluba v Excelu je le predlog — klub vedno izberi izrecno (imena v bazi so neenotna).
            </p>
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
              <h2 className="font-semibold text-gray-800">
                {selectedClub ? (
                  <>Klub: {selectedClub.name}{' '}
                    <span className="text-xs font-medium text-green-700">✅ obstoječi klub</span>
                  </>
                ) : (
                  <>Klub: ➕ nov klub{' '}
                    <span className="text-xs font-medium text-yellow-800">⚠️ nov klub (bo ustvarjen)</span>
                  </>
                )}
              </h2>
              {selectedClub && parsed.club.name && normalizeName(parsed.club.name) !== normalizeName(selectedClub.name) && (
                <p className="text-xs text-gray-500">
                  V Excelu: "{parsed.club.name}" → uvažam v "{selectedClub.name}"
                </p>
              )}
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
              {warningCount > 0 && (
                <span className="text-xs px-2 py-1 rounded-full font-medium bg-yellow-100 text-yellow-800">
                  opozorila: {warningCount}
                </span>
              )}
            </div>
          </div>

          {!selectedClub && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg px-3 py-2 mb-4 text-xs">
              Nov klub »{parsed.club.name}« bo ustvarjen. Preveri, da ime ni
              tipkarska napaka — morda klub že obstaja v bazi pod drugim imenom
              (izberi ga zgoraj). Ker je klub nov, bodo že obstoječi igralci
              prikazani kot »prestop« (prehajajo iz svojega dosedanjega kluba).
            </div>
          )}

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
                      {r.warning && (
                        <span className="text-xs text-yellow-700 ml-2" title={r.warning}>
                          ⚠ {r.warning}
                        </span>
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
              disabled={busy || !seasonId || importableCount === 0}
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

      <AddSinglePlayer
        seasonId={seasonId}
        teamId={teamId}
        newTeamName={newTeamName}
        clubId={clubId}
        clubName={resolvedClubName}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ročni vnos enega igralca med sezono (klub se registrira po začetku sezone)
// ---------------------------------------------------------------------------

interface AddSinglePlayerProps {
  seasonId: string
  teamId: string
  newTeamName: string
  clubId: string
  clubName: string
}

function AddSinglePlayer({ seasonId, teamId, newTeamName, clubId, clubName }: AddSinglePlayerProps) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [emso, setEmso] = useState('')
  const [birthDateInput, setBirthDateInput] = useState('')
  const [gender, setGender] = useState<Gender>('M')

  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)

  // Neveljavna kontrolna števka NE blokira (glej onSubmit) — le opozorimo, da lahko
  // admin preveri pri klubu. Prikažemo šele, ko je oblika pravilna (13 števk), sicer
  // bi med tipkanjem opozarjali na "napako", ki je zgolj nedokončan vnos.
  const emsoDigits = normalizeEmso(emso.trim())
  const emsoChecksumWarning =
    emso.trim() && /^\d{13}$/.test(emsoDigits) && !isValidEmso(emsoDigits)
      ? '⚠ Neveljavna kontrolna števka EMŠO — preveri pri klubu (vseeno lahko dodaš)'
      : null

  function resetForm() {
    setFirstName('')
    setLastName('')
    setEmso('')
    setBirthDateInput('')
    setGender('M')
  }

  async function onSubmit() {
    setFormError(null)
    setReport(null)

    if (!seasonId || !lastName.trim()) {
      setFormError('Izberi sezono in vpiši priimek.')
      return
    }
    if (!clubName.trim()) {
      setFormError('Najprej izberi ekipo ali vpiši ime kluba.')
      return
    }

    const emsoTrimmed = emso.trim()
    const dateTrimmed = birthDateInput.trim()

    let normalizedBirthDate: string | null = null
    if (dateTrimmed) {
      normalizedBirthDate = parseBirthDate(dateTrimmed)
      if (!normalizedBirthDate) {
        setFormError('Neveljaven datum (uporabi npr. 6.5.2010)')
        return
      }
    }

    // Blokiramo le OBLIKO (13 števk) — napačna kontrolna števka je pri realnih podatkih
    // pogosto le tipkarska napaka kluba na uradnem obrazcu, zato jo (enako kot masovni
    // uvoz) le označimo z opozorilom ob polju in dovolimo vnos.
    if (emsoTrimmed && !/^\d{13}$/.test(normalizeEmso(emsoTrimmed))) {
      setFormError('EMŠO mora imeti 13 števk')
      return
    }

    if (!emsoTrimmed && !dateTrimmed) {
      setFormError('Vpiši vsaj EMŠO ali datum rojstva (sicer igralca ne morem varno ujeti in bi ga ob ponovnem uvozu podvojil).')
      return
    }

    const fullName = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim()

    const player: ParsedPlayer = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      fullName,
      gender,
      birthDate: normalizedBirthDate,
      emso: emsoTrimmed ? normalizeEmso(emsoTrimmed) : null,
      birthCity: null,
      birthCountry: null,
      citizenship: null,
      addressStreet: null,
      addressHouse: null,
      addressPostal: null,
      addressCity: null,
      sportNumber: null,
      rowIndex: 0,
    }

    setBusy(true)
    try {
      const result = await postImport({
        club: {
          name: clubName,
          season: null,
          regId: null,
          taxId: null,
          mailAddress: null,
          contactName: null,
          phone: null,
          email: null,
        },
        target: {
          seasonId,
          clubId: clubId || null,
          teamId: teamId || null,
          // clubName je že razrešen (nova ekipa → datoteka), zato se ujema s club.name
          newTeamClubName: teamId ? null : (newTeamName || clubName),
        },
        players: [player],
      })
      setReport(result)

      const succeeded = (result.created > 0 || result.addedToTeam > 0) && result.skipped.length === 0
      if (succeeded) resetForm()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 mt-6">
      <h2 className="font-semibold text-gray-800 mb-1">Dodaj posameznega igralca</h2>
      <p className="text-sm text-gray-500 mb-4">
        Za registracijo enega igralca med sezono (klub se je pridružil pozneje).
        {clubName
          ? <> Klub: <span className="font-medium text-gray-700">{clubName}</span></>
          : <> Najprej izberi ekipo ali vpiši ime kluba.</>}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ime</label>
          <input
            type="text"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            className="w-full border rounded p-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Priimek</label>
          <input
            type="text"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            className="w-full border rounded p-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">EMŠO</label>
          <input
            type="text"
            value={emso}
            onChange={e => setEmso(e.target.value)}
            placeholder="13 števk"
            className="w-full border rounded p-2 text-sm"
          />
          {emsoChecksumWarning && (
            <p className="mt-1 text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
              {emsoChecksumWarning}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Datum rojstva</label>
          <input
            type="text"
            value={birthDateInput}
            onChange={e => setBirthDateInput(e.target.value)}
            placeholder="npr. 6.5.2010"
            className="w-full border rounded p-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Spol</label>
          <select
            value={gender}
            onChange={e => setGender(e.target.value as Gender)}
            className="w-full border rounded p-2 text-sm"
          >
            <option value="M">M</option>
            <option value="Ž">Ž</option>
          </select>
        </div>
      </div>

      {formError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
          {formError}
        </div>
      )}

      {report && (
        <div className="mb-4">
          {report.skipped.length > 0 ? (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-red-700">
                ⚠ Igralec NI bil dodan
              </p>
              {report.skipped.map((s, i) => (
                <p key={i} className="text-sm text-red-700 mt-1">
                  <span className="font-medium">{s.player}</span>: {s.reason}
                </p>
              ))}
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
              Igralec dodan (novih: {report.created}, dodanih v ekipo: {report.addedToTeam}).
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onSubmit}
          disabled={busy}
          className="bg-bocce-green text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {busy ? 'Dodajam …' : 'Dodaj igralca'}
        </button>
      </div>
    </div>
  )
}
