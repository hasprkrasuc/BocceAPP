import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Tournament, TournamentCategory, TournamentStatus } from '../../types'

/**
 * MOJA TEKMOVANJA — razpotje za glavnega sodnika / vodjo tekmovanja.
 *
 * Vodja ni admin aplikacije in do `/admin` nima dostopa, zato do grafikona,
 * kamor vpisuje izide, pride samo po povezavi iz navigacije. Dokler je vodil
 * eno samo tekmovanje, je ta peljala naravnost nanj; pri petih prvenstvih v
 * hitrostnem izbijanju pa je peljala na prvo, do ostalih pa se je moral
 * prebijati prek javnih strani.
 *
 * Seznam bere `chief_judge_id` in ne `managedTournamentIds` iz konteksta:
 * dolg `.in('id', […])` je v tem projektu že zrušil poizvedbo zaradi dolžine
 * naslova, en `eq` pa je tudi krajši zapis istega.
 */

const CATEGORY_LABELS: Record<TournamentCategory, string> = {
  men: 'Moški', women: 'Ženske', u18: 'U18', mixed: 'Mešano',
  u18_women: 'U18 Ženske', u15: 'U15', u14: 'U14', u12: 'U12',
}
const STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: 'Osnutek', registration_open: 'Prijave odprte', in_progress: 'V teku', completed: 'Zaključen',
}
const STATUS_BARVE: Record<TournamentStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  registration_open: 'bg-green-100 text-green-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-blue-100 text-blue-700',
}

/** Sistem tekmovanja v besedi — vodji pove, kaj ga čaka v zaslonu. */
const FORMAT_LABELS: Record<Tournament['format'], string> = {
  groups: 'Skupine',
  knockout: 'Izločilni',
  round_robin: 'Vsak z vsakim',
  izbijanje: 'Izbijanje',
}

export default function MojaTekmovanja() {
  const { user } = useAuth()
  const [tekmovanja, setTekmovanja] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)
  const [napaka, setNapaka] = useState('')

  useEffect(() => {
    if (!user) return
    let odpovedano = false
    supabase.from('tournaments').select('*')
      .eq('chief_judge_id', user.id)
      .order('date', { ascending: false })
      .then(({ data, error }) => {
        if (odpovedano) return
        // Napako pokažemo. Zavrnjena poizvedba se sicer bere kot prazen seznam
        // in »nimaš tekmovanj« je pri sodniku, ki jih ima, zavajajoče.
        if (error) setNapaka(error.message)
        else setTekmovanja((data ?? []) as Tournament[])
        setLoading(false)
      })
    return () => { odpovedano = true }
  }, [user])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-bocce-green" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Moja tekmovanja</h1>
      <p className="text-sm text-gray-500 mb-6">
        Tekmovanja, na katerih si glavni sodnik oziroma vodja. Vpisuješ izide in končni vrstni red.
      </p>

      {napaka && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          Seznama ni bilo mogoče prebrati: {napaka}
        </div>
      )}

      {!napaka && tekmovanja.length === 0 ? (
        <div className="text-center py-12 text-gray-400 italic">
          Nimaš dodeljenega nobenega tekmovanja.
        </div>
      ) : (
        <div className="space-y-3">
          {tekmovanja.map(t => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="font-semibold text-gray-800">{t.name.trim()}</h2>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                      {CATEGORY_LABELS[t.category] ?? t.category}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {FORMAT_LABELS[t.format] ?? t.format}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {t.date}{t.location ? ` · ${t.location}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BARVE[t.status]}`}>
                    {STATUS_LABELS[t.status]}
                  </span>
                  <Link to={`${t.kind === 'championship' ? '/prvenstva' : '/turnirji'}/${t.id}`}
                    className="text-xs text-bocce-green hover:underline">
                    Ogled
                  </Link>
                  <Link to={`/admin/turnir/${t.id}`}
                    className="text-xs bg-bocce-green text-white px-2.5 py-1 rounded-lg hover:bg-bocce-green-light transition-colors">
                    Vpiši izide
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
