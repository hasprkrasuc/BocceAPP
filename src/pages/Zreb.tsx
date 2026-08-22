import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  zacniZreb, izvleciUdelezenca, izvleciStevilko, jeKoncano, preveri, preostale,
  type ZrebStanje,
} from '../engines/zreb'
import { ligaskiOpis, preveriIzvedljivost, preveriLigaski } from '../engines/zrebLiga'
import {
  naloziLigaskiZreb, spremembe, shraniLigaskiZreb,
  type LigaskoIzhodisce, type Sprememba,
} from '../lib/zrebShrani'

/** Enakomerno naključno celo število iz [0, n) z zavrnitvenim vzorčenjem. */
function kriptoRandInt(n: number): number {
  if (!Number.isInteger(n) || n <= 0) throw new Error('n mora biti celo število, večji od 0')
  const meja = Math.floor(0x100000000 / n) * n
  const buf = new Uint32Array(1)
  let v: number
  do { crypto.getRandomValues(buf); v = buf[0] } while (v >= meja)
  return v % n
}

/** Oblika zapisa v localStorage: vrstni red nosilcev + celotna zgodovina stanj. */
interface ShranjenoStanje {
  mesta: Record<string, number>
  zgodovina: ZrebStanje[]
}

export default function Zreb() {
  const { seasonId } = useParams<{ seasonId: string }>()
  const [izhodisce, setIzhodisce] = useState<LigaskoIzhodisce | null>(null)
  const [napaka, setNapaka] = useState('')
  const [zacet, setZacet] = useState(false)
  const [zgodovina, setZgodovina] = useState<ZrebStanje[]>([])
  const [predstavitev, setPredstavitev] = useState(false)
  const [shranjeno, setShranjeno] = useState(false)
  const [shranjujem, setShranjujem] = useState(false)
  const [napakaZapisa, setNapakaZapisa] = useState('')
  /**
   * Ali je bil zapis v bazo že POSKUŠAN (uspešno ali ne). Ločeno od `shranjeno`
   * (uspešen zapis), ker mora razveljavitev obredu onemogočiti TAKOJ ob prvem
   * poskusu — če je zapis na pol poti spodletel, so nekatere vrstice morda že
   * v bazi, razveljavitev in nov žreb bi dal drugačen izid, kot je delno že
   * zapisan. Gumb za zapis ostane omogočen, da je ponovitev mogoča.
   */
  const [zapisPoskusan, setZapisPoskusan] = useState(false)
  /** id ekipe → mesto po lanski lestvici (1..N); samo za format 'groups'. */
  const [mesta, setMesta] = useState<Record<string, number>>({})
  /** Število potez shranjenega delnega žreba, najdenega ob nalaganju (samo za obvestilo). */
  const [najdenoNadaljevanje, setNajdenoNadaljevanje] = useState<number | null>(null)

  const kljuc = `zreb-liga-${seasonId}`

  useEffect(() => {
    if (!seasonId) return
    naloziLigaskiZreb(seasonId).then(setIzhodisce).catch(e => setNapaka(e.message))
  }, [seasonId])

  // Ob nalaganju sezone preveri, ali obstaja shranjen delni žreb — in če da,
  // vnaprej napolni mesta (nosilni vrstni red), da gumb »Nadaljuj žreb« ni
  // nesmiselno blokiran, ker vnos mest še ni izpolnjen. Sam žreb (zgodovina)
  // se obnovi šele ob kliku na gumb, po potrditvi.
  useEffect(() => {
    if (!izhodisce) return
    try {
      const shr = localStorage.getItem(kljuc)
      if (!shr) return
      const p = JSON.parse(shr) as ShranjenoStanje
      if (p && Array.isArray(p.zgodovina) && p.zgodovina.length > 1) {
        setMesta(p.mesta ?? {})
        setNajdenoNadaljevanje(p.zgodovina[p.zgodovina.length - 1].dnevnik.length)
      }
    } catch { /* pokvarjen zapis ignoriramo */ }
    // Namerno samo `izhodisce`: prefill mest naj se zgodi enkrat ob nalaganju
    // sezone, ne ob vsakem vnosu operaterja v polja spodaj.
  }, [izhodisce])

  /**
   * Nosilni vrstni red, kot ga je vnesel operater. VEDNO se posreduje
   * `ligaskiOpis` in `preveriIzvedljivost` — brez tega bi `ligaskiOpis` tiho
   * padel nazaj na abecedni vrstni red iz baze, kar je za format 'groups'
   * napačna seznanitev nosilcev (glej dokumentacijo `preveriIzvedljivost`).
   */
  const nosilniVrstniRed = useMemo(() => {
    if (!izhodisce || izhodisce.nastavitve.format !== 'groups') return []
    return izhodisce.ekipe
      .filter(e => mesta[e.id])
      .sort((a, b) => mesta[a.id] - mesta[b.id])
      .map(e => e.id)
  }, [izhodisce, mesta])

  const opis = useMemo(
    () => (izhodisce ? ligaskiOpis(izhodisce.nastavitve, izhodisce.ekipe, nosilniVrstniRed) : null),
    [izhodisce, nosilniVrstniRed],
  )

  /**
   * Izvedljivost žreba S TRENUTNIM nosilnim vrstnim redom. Gumb »Začni žreb«
   * je onemogočen, dokler ta seznam ni prazen — to je edino mesto, kjer se
   * past iz `preveriIzvedljivost` (prazen/krnjen vrstni red pade nazaj na
   * abecedni red brez opozorila) dejansko zapre.
   */
  const izvedljivost = useMemo(
    () => (izhodisce ? preveriIzvedljivost(izhodisce.ekipe, izhodisce.nastavitve, nosilniVrstniRed) : []),
    [izhodisce, nosilniVrstniRed],
  )

  const potrebenRed = izhodisce?.nastavitve.format === 'groups'
  const izpolnjenaMesta = izhodisce
    ? izhodisce.ekipe.map(e => mesta[e.id]).filter((v): v is number => !!v)
    : []
  const redPoln = !potrebenRed || (
    izhodisce != null &&
    izpolnjenaMesta.length === izhodisce.ekipe.length &&
    new Set(izpolnjenaMesta).size === izhodisce.ekipe.length &&
    izpolnjenaMesta.every(v => v >= 1 && v <= izhodisce.ekipe.length)
  )
  const moreZaceti = redPoln && izvedljivost.length === 0

  const stanje = zgodovina[zgodovina.length - 1] ?? null
  const koncano = opis && stanje ? jeKoncano(opis, stanje) : false

  /**
   * Samodejne dodelitve zadnje poteze — torej tiste na samem REPU dnevnika.
   * Ekipa lahko soigriščnemu paru vsili številko, ne da bi operater to ekipo
   * sam izvlekel (glej `zadnja` spodaj, ki jih namerno preskoči za glavni
   * prikaz) — občinstvo pa mora vseeno videti, komu in zakaj je bila številka
   * dodeljena. Ker gledamo dobesedni rep polja (ne `reverse().find(...)` čez
   * celotno zgodovino), se seznam sam izprazni takoj, ko naslednja poteza
   * doda karkoli — nov izvlek ekipe ali številke — brez posebnega efekta.
   */
  const zadnjeSamodejne = useMemo(() => {
    const dn = stanje?.dnevnik ?? []
    const rezultat: typeof dn = []
    for (let i = dn.length - 1; i >= 0; i--) {
      const v = dn[i]
      if (v.tip === 'stevilka' && v.samodejno) rezultat.unshift(v)
      else break
    }
    return rezultat
  }, [stanje])

  /** ?ozadje=prosojno v naslovu → prosojno ozadje predstavitve, za brskalnikov vir v OBS. */
  const prosojno = useMemo(
    () => new URLSearchParams(window.location.search).get('ozadje') === 'prosojno',
    [],
  )

  /**
   * Prosojna predstavitev mora resnično prekriti navigacijo in nogo ter
   * odstraniti sivo ozadje ogrodja (glej App.tsx: Layout ovije vsako stran v
   * `bg-gray-50` #app-shell z lepljivim Navbarjem na z-50) — sicer OBS namesto
   * praznega prosojnega okvirja ujame zeleno vrstico in siv rob. Razred
   * `zreb-prosojno` (pravila v index.css) se doda šele, ko je hkrati
   * predstavitev IN zahtevana prosojnost, in se POSPRAVI ob izhodu iz
   * predstavitve ter ob odjavi komponente — da ostali admin zasloni niso
   * prizadeti.
   */
  useEffect(() => {
    if (!predstavitev || !prosojno) return
    document.body.classList.add('zreb-prosojno')
    return () => { document.body.classList.remove('zreb-prosojno') }
  }, [predstavitev, prosojno])

  useEffect(() => {
    if (zgodovina.length) {
      try {
        localStorage.setItem(kljuc, JSON.stringify({ mesta, zgodovina } satisfies ShranjenoStanje))
      } catch { /* ni nujno */ }
    }
  }, [zgodovina, kljuc, mesta])

  function zacni() {
    if (!opis) return
    try {
      const shr = localStorage.getItem(kljuc)
      if (shr) {
        const p = JSON.parse(shr) as ShranjenoStanje
        if (
          p && Array.isArray(p.zgodovina) && p.zgodovina.length > 1 &&
          window.confirm(`Najden je začet žreb (${p.zgodovina[p.zgodovina.length - 1].dnevnik.length} potez). Nadaljujem?`)
        ) {
          setZgodovina(p.zgodovina); setZacet(true); return
        }
      }
    } catch { /* pokvarjen zapis ignoriramo */ }
    setZgodovina([zacniZreb(opis)]); setZacet(true)
  }

  function poteza() {
    if (!opis || !stanje || koncano) return
    setNapaka('')
    try {
      const novo = stanje.cakajoca
        ? izvleciStevilko(opis, stanje, kriptoRandInt)
        : izvleciUdelezenca(opis, stanje, kriptoRandInt)
      const napake = [
        ...preveri(opis, novo),
        ...preveriLigaski(
          izhodisce!.nastavitve, izhodisce!.ekipe, nosilniVrstniRed,
          novo, jeKoncano(opis, novo),
        ),
      ]
      if (napake.length) throw new Error(napake.join(' | '))
      setZgodovina(z => [...z, novo])
    } catch (e) {
      setNapaka(`${e instanceof Error ? e.message : String(e)} — pritisnite Razveljavi in poskusite znova`)
    }
  }

  function razveljavi() {
    // Zaklenjeno tudi po zgolj POSKUŠANEM (ne le uspešnem) zapisu — če je ta
    // na pol poti spodletel, so nekatere vrstice morda že v bazi in bi
    // razveljavitev z novim žrebom dala izid, ki se z bazo ne bi več ujemal.
    if (shranjeno || zapisPoskusan) return
    setNapaka('')
    // Razveljavitev lahko žreb spet postavi pred konec — brez tega bi
    // morebitno staro sporočilo o neuspelem zapisu ostalo v stanju in se
    // znova prikazalo, ko obred kasneje spet doseže konec.
    setNapakaZapisa('')
    setZgodovina(z => (z.length > 1 ? z.slice(0, -1) : z))
  }

  function ponastavi() {
    if (!opis || shranjeno) return
    if (!window.confirm('Ponastavim žreb? Vse dosedanje poteze bodo izgubljene.')) return
    setNapaka('')
    setNapakaZapisa('')
    // Popolna ponastavitev začne povsem nov žreb brez lastne zgodovine zapisa
    // — zaklep razveljavitve iz prejšnjega (morda spodletelega) poskusa zanjo
    // ne velja več.
    setZapisPoskusan(false)
    setZgodovina([zacniZreb(opis)])
  }

  /**
   * Zapiše izid v bazo. Kliče se šele ob izrecni potrditvi, po predogledu
   * spodaj. `shraniLigaskiZreb` piše vrstico za vrstico — če zapis prekine
   * napaka na pol poti, so nekatere ekipe že zapisane, druge še ne. Zapis je
   * IDEMPOTENTEN (isti klic znova le ponovi isto vrednost), zato ob napaki
   * pustimo gumb omogočen in zapis v localStorage NEODSTRANJEN — ponovni klik
   * stanje popravi, izguba lokalnega zapisa pa bi ob napaki pomenila, da
   * obreda ni več mogoče ponoviti iz zaslona.
   */
  async function zapisi() {
    if (!izhodisce || !stanje) return
    const sp: Sprememba[] = spremembe(izhodisce, stanje)
    if (!window.confirm(`Zapišem ${sp.length} vrstic v bazo?`)) return
    setNapakaZapisa('')
    // Zaklene razveljavitev TAKOJ ob poskusu, ne šele ob uspehu — glej
    // razveljavi() zgoraj.
    setZapisPoskusan(true)
    setShranjujem(true)
    try {
      await shraniLigaskiZreb(sp)
      setShranjeno(true)
      try { localStorage.removeItem(kljuc) } catch { /* ni nujno */ }
    } catch (e) {
      setNapakaZapisa(
        `${e instanceof Error ? e.message : String(e)} — nekatere vrstice so morda že zapisane, ` +
        `razveljavitev zato ni več na voljo. Zapis je varno ponoviti: pritisnite gumb še enkrat.`,
      )
    } finally {
      setShranjujem(false)
    }
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!zacet) return
      if (e.code === 'Space') { e.preventDefault(); poteza() }
      if (e.key === 'z' || e.key === 'Z') razveljavi()
      if (e.key === 'p' || e.key === 'P') setPredstavitev(v => !v)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  if (napaka && !izhodisce) return <div className="p-8 text-red-700">{napaka}</div>
  if (!izhodisce || !opis) return <div className="p-8">Nalagam …</div>

  if (!zacet) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-2">Žreb — {izhodisce.imeSezone}</h1>
        <p className="mb-4 text-gray-600">
          {izhodisce.ekipe.length} ekip · format {izhodisce.nastavitve.format}
        </p>
        <ul className="mb-6 text-sm">
          {izhodisce.ekipe.map(e => (
            <li key={e.id}>{e.ime}{e.shared_venue_key ? ` — igrišče: ${e.shared_venue_key}` : ''}</li>
          ))}
        </ul>

        {potrebenRed && (
          <div className="mb-6">
            <h2 className="font-semibold mb-1">Vrstni red po lanski lestvici</h2>
            <p className="text-sm text-gray-600 mb-2">
              Pari zaporednih nosilcev (1-2, 3-4 …) se razdelijo v različni skupini.
              Vpiši mesta 1–{izhodisce.ekipe.length}.
            </p>
            {izhodisce.ekipe.map(e => (
              <div key={e.id} className="flex items-center gap-2 mb-1">
                <input type="number" min={1} max={izhodisce.ekipe.length}
                  value={mesta[e.id] ?? ''}
                  onChange={ev => setMesta(m => ({ ...m, [e.id]: Number(ev.target.value) }))}
                  className="w-16 border rounded px-2 py-1" />
                <span>{e.ime}</span>
              </div>
            ))}
            {!redPoln && (
              <p className="text-amber-700 mt-2">
                Vsaka ekipa mora imeti svoje mesto 1–{izhodisce.ekipe.length}, brez podvojitev.
              </p>
            )}
          </div>
        )}

        {izvedljivost.length > 0 && (
          <div className="mb-6">
            <h2 className="font-bold text-red-700 mb-1">Žreb se ne more začeti</h2>
            <ul className="list-disc pl-6 text-red-700 text-sm">
              {izvedljivost.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}

        {najdenoNadaljevanje != null && (
          <p className="text-sm text-gray-600 mb-2">
            Najden je shranjen delni žreb ({najdenoNadaljevanje} potez) — gumb spodaj ga bo ponudil za nadaljevanje.
          </p>
        )}

        <button onClick={zacni} disabled={!moreZaceti}
          className="px-6 py-3 bg-bocce-green text-white rounded disabled:opacity-40">
          Začni žreb
        </button>
      </div>
    )
  }

  // Zadnja DEJANSKO izžrebana (ne samodejna posledica) številka — to je
  // tista, ki jo je operater pravkar izvlekel. Brez filtra na `samodejno`
  // bi se ob soigriščnem paru na velikem zaslonu prikazala partnerjeva
  // samodejna dodelitev namesto tiste, ki jo je občinstvo pravkar videlo.
  const zadnja = [...(stanje?.dnevnik ?? [])].reverse().find(v => v.tip === 'stevilka' && !v.samodejno)
  const trenutniKorak = opis.koraki[stanje!.korak]
  const trenutneSpremembe = spremembe(izhodisce, stanje!)
  const predogled = koncano ? trenutneSpremembe : []

  if (predstavitev) {
    return (
      // z-[60] je NAD Navbarjevim sticky z-50 (App.tsx) — brez tega bi zelena
      // vrstica ostala nad prekrivnim slojem, tudi v neprosojnem načinu.
      // Pri ?ozadje=prosojno samo z-index ne zadošča: prosojno ozadje ne
      // POBRIŠE tega, kar je pod njim, zato razred `zreb-prosojno` (glej
      // zgornji efekt in index.css) navigacijo in nogo dejansko skrije.
      <div
        className={`fixed inset-0 z-[60] flex flex-col items-center justify-center ${prosojno ? '' : 'bg-white'}`}
        style={prosojno ? { background: 'transparent' } : undefined}
      >
        <p className="text-2xl text-gray-500 mb-6">{koncano ? 'ŽREB JE KONČAN' : trenutniKorak?.naziv}</p>
        <p className="text-6xl font-bold mb-4">
          {stanje!.cakajoca
            ? opis.udelezenci.find(u => u.id === stanje!.cakajoca)?.ime
            : zadnja ? opis.udelezenci.find(u => u.id === zadnja.udelezenecId)?.ime : ' '}
        </p>
        <p className="text-[10rem] leading-none font-bold text-bocce-green">
          {stanje!.cakajoca ? ' ' : (zadnja?.stevilka ?? ' ')}
        </p>
        {zadnjeSamodejne.length > 0 && (
          <div className="mt-6 text-xl text-gray-400 text-center">
            {zadnjeSamodejne.map((v, i) => (
              <p key={i}>
                {opis.udelezenci.find(u => u.id === v.udelezenecId)?.ime}: {v.stevilka}
                {v.razlog ? ` — ${v.razlog}` : ''}
              </p>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 grid gap-6 md:grid-cols-3">
      <section>
        <p className="text-sm font-semibold text-gray-600 mb-2">
          {koncano ? 'ŽREB JE KONČAN' : trenutniKorak?.naziv}
        </p>
        <p className="text-3xl font-bold min-h-[2.5rem]">
          {stanje!.cakajoca ? opis.udelezenci.find(u => u.id === stanje!.cakajoca)?.ime : ' '}
        </p>
        <p className="text-7xl font-bold text-bocce-green min-h-[5rem]">
          {stanje!.cakajoca ? ' ' : (zadnja?.stevilka ?? ' ')}
        </p>
        {zadnjeSamodejne.length > 0 && (
          <div className="mt-1 mb-2 text-sm text-gray-500">
            {zadnjeSamodejne.map((v, i) => (
              <p key={i}>
                Samodejno: {opis.udelezenci.find(u => u.id === v.udelezenecId)?.ime} → {v.stevilka}
                {v.razlog ? ` (${v.razlog})` : ''}
              </p>
            ))}
          </div>
        )}
        <button onClick={poteza} disabled={koncano}
          className="px-6 py-3 bg-bocce-green text-white rounded disabled:opacity-40">
          {stanje!.cakajoca ? 'Izvleci številko' : 'Izvleci ekipo'}
        </button>
        {napaka && <p className="mt-3 text-red-700 font-semibold">{napaka}</p>}
        <div className="mt-4 flex gap-2 flex-wrap">
          <button onClick={razveljavi} disabled={zgodovina.length < 2 || shranjeno || zapisPoskusan}
            title={zapisPoskusan && !shranjeno
              ? 'Zapis v bazo je bil že poskušan — razveljavitev ni več na voljo. Poskusite znova z gumbom »Zapiši v bazo«.'
              : undefined}
            className="px-3 py-2 border rounded disabled:opacity-40">Razveljavi</button>
          <button onClick={ponastavi} disabled={shranjeno}
            className="px-3 py-2 border rounded disabled:opacity-40">Ponastavi</button>
          <button onClick={() => setPredstavitev(true)} className="px-3 py-2 border rounded">Predstavitev</button>
        </div>

        {koncano && (
          <div className="mt-6">
            <h2 className="font-semibold mb-2">Predogled zapisa</h2>
            <table className="w-full text-sm mb-3">
              <thead>
                <tr className="text-left text-gray-500">
                  <th>Ekipa</th><th>Skupina</th><th>Številka</th>
                </tr>
              </thead>
              <tbody>
                {predogled.map(s => (
                  <tr key={s.id} className="border-b">
                    <td>{s.ime}</td>
                    <td className="text-center">{s.group_label ?? ''}</td>
                    <td className="text-center font-bold">{s.draw_number}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={zapisi} disabled={shranjeno || shranjujem}
              className="px-3 py-2 border rounded disabled:opacity-40">
              {shranjeno ? 'Zapisano' : shranjujem ? 'Zapisujem …' : 'Zapiši v bazo'}
            </button>
            {napakaZapisa && <p className="mt-3 text-red-700 font-semibold">{napakaZapisa}</p>}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold mb-2">Stanje</h2>
        <table className="w-full text-sm">
          <tbody>
            {izhodisce.ekipe.map(e => {
              const sp = trenutneSpremembe.find(x => x.id === e.id)
              return (
                <tr key={e.id} className="border-b">
                  <td>{e.ime}</td>
                  <td className="text-center">{sp?.group_label ?? ''}</td>
                  <td className="text-center font-bold">{sp?.draw_number ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Preostale številke</h2>
        <p className="mb-4">{preostale(opis, stanje!).join(', ') || '—'}</p>
        <h2 className="font-semibold mb-2">Dnevnik</h2>
        <ol className="text-xs max-h-64 overflow-y-auto">
          {[...stanje!.dnevnik].reverse().map((v, i) => (
            <li key={i}>
              {opis.udelezenci.find(u => u.id === v.udelezenecId)?.ime}
              {v.tip === 'stevilka' ? ` → ${v.stevilka}` : ' — na vrsti'}
              {v.samodejno ? ` (${v.razlog})` : ''}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
