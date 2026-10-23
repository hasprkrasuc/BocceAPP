import { useMemo } from 'react'
import {
  nacrtIzlocilnih, napredovalciPoMestih, izpisMesta,
  type SkupinaZId, type SkupinskaTekma,
} from '../engines/izlocilniNacrt'
import { stageLabel } from '../engines/tournament'

/**
 * PREDOGLED IZLOČILNIH BOJEV — pajek, preden je ustvarjen.
 *
 * Pokaže se tam, kjer doslej ni bilo ničesar: od žreba skupin do trenutka, ko
 * admin ustvari pravo mrežo. Mesta so sprva oznake (»Zmagovalec S3«) in se
 * zamenjajo z imeni, brž ko je napredovalec znan.
 *
 * Samo za branje. Pravo mrežo še naprej riše `KnockoutBracket` — te komponente
 * se predogled NE dotakne, ker ta te dni riše žive izločilne boje vseh
 * turnirjev in sredi sezone ni kraj za poskuse.
 *
 * Zakaj »predvideno«: načrt velja za SAMODEJNI razpored. Admin lahko ob
 * ustvarjanju izbere žreb ali ročni razpored in takrat bo končna mreža druga.
 * Lastnik projekta je izbral, da ostanejo vsi trije načini, zato predogled
 * tega ne sme obljubiti kot dokončnega.
 */

interface Props {
  skupine: SkupinaZId[]
  skupinskeTekme: SkupinskaTekma[]
  /** Ime ekipe po id-ju iz `group_teams`; nedoločeno, dokler ni znano. */
  imeEkipe: (teamId: string) => string | undefined
}

export default function IzlocilniPredogled({ skupine, skupinskeTekme, imeEkipe }: Props) {
  const nacrt = useMemo(() => nacrtIzlocilnih(skupine), [skupine])
  const napredovali = useMemo(
    () => napredovalciPoMestih(skupine, skupinskeTekme),
    [skupine, skupinskeTekme],
  )

  if (!nacrt.napovedljivo) {
    return (
      <div className="text-center py-12 text-gray-400 italic">
        {nacrt.razlog ?? 'Izločilni del še ni začet'}
      </div>
    )
  }

  // Krogi v vrstnem redu, kot jih je sestavil načrt.
  const krogi = [...new Set(nacrt.tekme.map(t => t.stage))]

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
        <p className="font-semibold mb-0.5">Predvideni izločilni boji</p>
        <p className="text-amber-700">
          Mesta se polnijo sama, ko so znani napredovalci skupin. Razpored je predviden po
          samodejnem križanju (prvi iz skupine proti drugemu iz nasprotne); dokončen postane,
          ko se izločilni del ustvari.
        </p>
      </div>

      {krogi.map(stage => {
        const tekme = nacrt.tekme.filter(t => t.stage === stage)
        // Proste prehode skrijemo: ekipa brez nasprotnika ni tekma, njeno
        // mesto v naslednjem krogu pa je že izpisano.
        const prave = tekme.filter(t => !t.isBye)
        if (!prave.length) return null

        return (
          <section key={stage}>
            <h3 className="text-sm font-bold text-bocce-green uppercase tracking-wide mb-3">
              {stageLabel(stage)}
              <span className="ml-2 text-xs font-normal text-gray-400 normal-case tracking-normal">
                {prave.length === 1 ? '1 tekma' : `${prave.length} tekem`}
              </span>
            </h3>
            <div className="grid md:grid-cols-2 gap-3">
              {prave.map(t => (
                <div key={`${t.stage}-${t.matchNumber}`}
                  className="bg-white border border-gray-200 rounded-xl px-4 py-3 space-y-1.5">
                  {[t.teamA, t.teamB].map((kljuc, i) => {
                    const izpis = izpisMesta(kljuc, napredovali, imeEkipe)
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {izpis === null ? (
                          <span className="text-gray-300 italic">čaka prejšnji krog</span>
                        ) : izpis.znano ? (
                          <span className="font-medium text-gray-800">{izpis.besedilo}</span>
                        ) : (
                          <span className="text-gray-400">{izpis.besedilo}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
