import { useMemo } from 'react'
import {
  sistemIzbijanja, napredovali, koncniVrstniRed, jeNastopil, IME_KROGA,
  type KrogIzbijanja, type Nastop,
} from '../engines/izbijanje'

/**
 * Grafikon izbijanja — hitrostno, natančno, štafetno.
 *
 * Ista tabela služi javni strani (samo branje) in administraciji (vnos izidov);
 * razlikuje ju le to, ali je podan `shrani`. Tako se prikaz ne more raziti od
 * vnosa, kar je bila pri zapisniku tekme že enkrat težava.
 *
 * Pravila — koliko serij, kdo napreduje, kakšen je končni vrstni red — so v
 * `src/engines/izbijanje.ts`. Tu ni nobenega tekmovalnega pravila, samo izris.
 */

export interface PrijavaIzbijanja {
  id: string
  /** Žrebana številka; NULL, dokler žreba ni — takrat velja vrstni red prijave. */
  draw_number: number | null
  ime: string
  klub: string | null
}

export interface IzbijanjeIzid {
  registration_id: string
  krog: KrogIzbijanja
  zadetki: number
}

interface Props {
  prijave: PrijavaIzbijanja[]
  izidi: IzbijanjeIzid[]
  /** Kadar je podan, so izidi urejljivi. Brez njega je tabela samo za branje. */
  shrani?: (registrationId: string, krog: KrogIzbijanja, zadetki: number | null) => void
  /** Id prijave, ki se ravno shranjuje — polje je medtem onemogočeno. */
  zaposlen?: string | null
}

export default function IzbijanjeTabela({ prijave, izidi, shrani, zaposlen }: Props) {
  const { sistem, nastopi, red, dovoljeni, izenacenja, poId } = useMemo(() => {
    const sistem = sistemIzbijanja(Math.max(prijave.length, 1))

    const poId = new Map(prijave.map(p => [p.id, p]))
    const izidPo = new Map(izidi.map(i => [`${i.registration_id}|${i.krog}`, i.zadetki]))
    const nastopi: Nastop[] = prijave.map((p, i) => ({
      id: p.id,
      // Brez žreba velja vrstni red prijave — številka mora biti stabilna,
      // sicer bi se izenačeni tekmovalci ob vsakem izrisu prerazporedili.
      stZreba: p.draw_number ?? i + 1,
      izidi: Object.fromEntries(
        sistem.krogi
          .map(k => [k, izidPo.get(`${p.id}|${k}`) ?? null])
          .filter(([, v]) => v !== null),
      ) as Nastop['izidi'],
    }))

    // Kdo sme nastopiti v katerem krogu: v prvem vsi, v naslednjih le tisti,
    // ki so se uvrstili iz prejšnjega.
    const dovoljeni = new Map<KrogIzbijanja, Set<string>>()
    const izenacenja = new Map<KrogIzbijanja, string[]>()
    dovoljeni.set(sistem.krogi[0], new Set(prijave.map(p => p.id)))
    sistem.krogi.forEach((krog, i) => {
      if (i === 0) return
      const { napreduje, izenaceni } = napredovali(
        nastopi, sistem.krogi[i - 1], sistem.napreduje[i - 1], sistem)
      dovoljeni.set(krog, new Set(napreduje))
      if (izenaceni.length) izenacenja.set(sistem.krogi[i - 1], izenaceni)
    })

    return { sistem, nastopi, red: koncniVrstniRed(nastopi, sistem), dovoljeni, izenacenja, poId }
  }, [prijave, izidi])

  if (prijave.length === 0) {
    return <p className="text-gray-400 italic text-center py-8">Potrjenih prijav še ni.</p>
  }

  const nastopPo = new Map(nastopi.map(n => [n.id, n]))
  const opisSistema = sistem.krogi
    .map((k, i) => i === 0 ? IME_KROGA[k] : `${IME_KROGA[k]} (${sistem.napreduje[i - 1]})`)
    .join(' → ')

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {prijave.length} tekmovalcev · {opisSistema}
      </p>

      {[...izenacenja.entries()].map(([krog, ids]) => (
        <div key={krog} className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
          ⚠ Izenačenje na meji napredovanja po seriji <strong>{IME_KROGA[krog]}</strong>:{' '}
          {ids.map(id => poId.get(id)?.ime ?? id).join(', ')}. Potrebno je dodatno izbijanje —
          vpiši popravljen izid, sicer je vrstni red le začasen.
        </div>
      ))}

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-bocce-green text-white text-xs uppercase tracking-wide">
              <th className="px-3 py-3 text-center w-12" title="Končno mesto">Mesto</th>
              <th className="px-3 py-3 text-center w-14" title="Žrebana številka">Žreb</th>
              <th className="px-3 py-3 text-left">Tekmovalec</th>
              <th className="px-3 py-3 text-left">Klub</th>
              {sistem.krogi.map(k => (
                <th key={k} className="px-3 py-3 text-center w-24">{IME_KROGA[k]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {red.map((u, i) => {
              const p = poId.get(u.id)
              const nastop = nastopPo.get(u.id)
              const naStopnicah = u.zadnjiKrog !== null && i < 3
              return (
                <tr key={u.id} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                  <td className="px-3 py-2 text-center">
                    {i === 0 && <span title="1. mesto">🥇</span>}
                    {i === 1 && <span title="2. mesto">🥈</span>}
                    {i === 2 && <span title="3. mesto">🥉</span>}
                    {!naStopnicah && <span className="text-gray-400">{u.mesto}</span>}
                  </td>
                  <td className="px-3 py-2 text-center text-gray-400 font-mono text-xs">
                    {nastop?.stZreba}
                  </td>
                  <td className="px-3 py-2 text-gray-800">{p?.ime ?? u.id}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{p?.klub ?? ''}</td>
                  {sistem.krogi.map(krog => {
                    const sme = dovoljeni.get(krog)?.has(u.id) ?? false
                    const vrednost = nastop && jeNastopil(nastop, krog) ? nastop.izidi[krog] : null
                    if (!shrani) {
                      return (
                        <td key={krog} className="px-3 py-2 text-center font-mono">
                          {vrednost ?? <span className="text-gray-300">—</span>}
                        </td>
                      )
                    }
                    return (
                      <td key={krog} className="px-3 py-2 text-center">
                        <input
                          type="number" min={0} inputMode="numeric"
                          defaultValue={vrednost ?? ''}
                          disabled={!sme || zaposlen === u.id}
                          title={sme ? 'Število zadetkov' : 'Tekmovalec se v to serijo ni uvrstil'}
                          onBlur={e => {
                            const t = e.target.value.trim()
                            const nova = t === '' ? null : Number(t)
                            if (nova !== null && (!Number.isInteger(nova) || nova < 0)) {
                              e.target.value = vrednost === null ? '' : String(vrednost)
                              return
                            }
                            if (nova !== vrednost) shrani(u.id, krog, nova)
                          }}
                          className="w-16 text-center border border-gray-300 rounded-lg px-2 py-1
                                     disabled:bg-gray-100 disabled:text-gray-300
                                     focus:outline-none focus:ring-2 focus:ring-bocce-green/40"
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed">
        Uvrstitev odloči najdaljša dosežena serija: finalisti zasedejo mesta 1–4 po finalnem izidu,
        četrtfinalisti brez finala 5–8 po četrtfinalnem, ostali od 9 naprej po kvalifikacijskem.
        Prejšnje serije se ne seštevajo. Ob istem izidu odloči prejšnja serija, nazadnje žrebana številka.
      </p>
    </div>
  )
}
