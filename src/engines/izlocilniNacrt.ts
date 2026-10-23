import type { GroupSize } from '../types'
import {
  buildBracketFromFirstRound, crossPairs, preRoundFirstRoundPairs, pairsFromSeededTeams,
  knockoutPropagation, type PlannedMatch, type KoMatchRow,
} from './knockout'
import { suggestGroupDistribution, GROUP_QUALIFIERS } from './tournament'

/**
 * NAČRT IZLOČILNIH BOJEV — pajek, znan že ob žrebu skupin.
 *
 * Doslej je izločilna mreža nastala šele, ko je admin po odigranih skupinah
 * pritisnil gumb. Do takrat je ni bilo nikjer: ne v bazi ne na strani.
 *
 * Pokazati jo je mogoče vnaprej, ker razporeditev napredovalcev NI odvisna od
 * rezultatov. Mesto v mreži določata samo ŠTEVILKA SKUPINE in MESTO (1./2.):
 *
 *   - napredovalec skupine je zmagovalec DOLOČENE tekme v skupini
 *     (GROUP_QUALIFIERS: tekmi 3 in 5 pri skupinah po 3 in 4, 7 in 9 pri 5),
 *   - par prvega kroga je »prvi iz skupine i proti drugemu iz skupine G+1−i«
 *     (crossPairs), oziroma pri predkolu direktna ekipa proti zmagovalcu
 *     predtekme (preRoundFirstRoundPairs),
 *   - oblika mreže (velikost, imena krogov, ali je predkolo) je odvisna samo
 *     od ŠTEVILA skupin (suggestGroupDistribution).
 *
 * Rang točke in uspešnost se pri turnirjih s skupinami ne uporabljajo nikjer;
 * nastopijo šele pri čistem izločilnem sistemu brez skupin (`drawKnockout`).
 *
 * KAKO JE NAREJENO
 *
 * Namesto id-jev ekip po mreži pošljemo KLJUČE MEST (»S3:1« = zmagovalec
 * skupine 3). Mreža je tako ista koda, ki jo pritisk gumba uporabi zares —
 * `buildBracketFromFirstRound` in `knockoutPropagation` sta glede vsebine
 * slotov slepa. Isti prijem uporablja `engines/pokal.ts` s sintetičnimi id-ji.
 *
 * Posledica, ki je pomembnejša od prihranka: predogled in končna mreža nista
 * »preverjeno enaka«, ampak enaka PO KONSTRUKCIJI. Druga kopija pravila bi se
 * ob prvi spremembi razšla in nihče tega ne bi opazil do turnirja.
 *
 * ČESA NAČRT NE VE
 *
 * Tekme za 3. mesto ni v načrtu. Ali bo obstajala, odloči admin ob ustvarjanju
 * mreže (`koThirdPlace`) in to se nikamor ne shrani, zato bi jo načrt lahko
 * obljubil po nepotrebnem.
 *
 * Načrt velja za SAMODEJNI razpored. Če admin ob ustvarjanju izbere žreb ali
 * ročni razpored, bo končna mreža druga — zato se predogled označi kot
 * predviden in ne kot dokončen.
 */

/** Skupina, kolikor je je potrebno za načrt: številka in velikost. */
export interface SkupinaNacrta {
  stevilka: number
  velikost: GroupSize
}

/** Mesto v skupini, ki se uvrsti naprej. */
export interface MestoSkupine {
  skupina: number
  /** 1 = zmagovalec skupine, 2 = drugouvrščeni. */
  mesto: 1 | 2
}

/** Ključ mesta, kakor potuje po mreži namesto id-ja ekipe. */
export function kljucMesta(m: MestoSkupine): string {
  return `S${m.skupina}:${m.mesto}`
}

/** Nazaj iz ključa; `null`, kadar niz ni ključ mesta (npr. pravi id ekipe). */
export function razberiMesto(kljuc: string | null | undefined): MestoSkupine | null {
  if (!kljuc) return null
  const m = /^S(\d+):([12])$/.exec(kljuc)
  if (!m) return null
  return { skupina: Number(m[1]), mesto: Number(m[2]) as 1 | 2 }
}

/** Oznaka za izpis na praznem mestu: »Zmagovalec S3« oziroma »2. mesto S3«. */
export function oznakaMesta(m: MestoSkupine): string {
  return m.mesto === 1 ? `Zmagovalec S${m.skupina}` : `2. mesto S${m.skupina}`
}

export interface NacrtIzlocilnih {
  /** Ali je mrežo sploh mogoče določiti vnaprej. */
  napovedljivo: boolean
  /** Zakaj ne, kadar ni — besedilo za izpis. */
  razlog?: string
  /** Ali konfiguracija vsebuje predkolo (število skupin ni potenca 2). */
  jePredkolo: boolean
  /**
   * Mreža, v kateri so `teamA`/`teamB` KLJUČI MEST in ne id-ji ekip.
   * Prosti prehodi (bye) so že razrešeni naprej, enako kot pri pravi mreži.
   */
  tekme: PlannedMatch[]
}

/** Prazen načrt z razlogom — da klicatelj nima česa narisati narobe. */
function brezNacrta(razlog: string): NacrtIzlocilnih {
  return { napovedljivo: false, razlog, jePredkolo: false, tekme: [] }
}

/**
 * Načrt izločilnih bojev iz samega žreba skupin.
 *
 * Potrebuje le številke in velikosti skupin — nobenega rezultata.
 */
export function nacrtIzlocilnih(skupine: SkupinaNacrta[]): NacrtIzlocilnih {
  if (skupine.length < 2) {
    return brezNacrta('Za izločilne boje sta potrebni vsaj dve skupini.')
  }

  const urejene = [...skupine].sort((a, b) => a.stevilka - b.stevilka)
  const G = urejene.length
  const skupnoEkip = urejene.reduce((n, s) => n + s.velikost, 0)
  // Oblika mreže je odvisna samo od ŠTEVILA skupin; število ekip podamo zato,
  // ker ga podpis zahteva, na target/directStage/extraStage pa ne vpliva.
  const dist = suggestGroupDistribution(skupnoEkip, G)

  const mesto = (s: SkupinaNacrta, m: 1 | 2) => kljucMesta({ skupina: s.stevilka, mesto: m })

  let pari: Array<[string | null, string | null]>
  const jePredkolo = dist.extraStage !== null

  if (!jePredkolo) {
    // Število skupin je potenca 2 — križanje po skupinah, brez predkola.
    pari = crossPairs(urejene.map(s => mesto(s, 1)), urejene.map(s => mesto(s, 2)))
  } else {
    /*
      Predkolo. Skupine po 3 so »dodatne« — njihovi napredovalci predkolo
      odigrajo med sabo; skupine po 4 in 5 so »direktne« in dobijo prosti
      prehod. Vrstni red je isti kot v adminu (`splitQualifiers` in
      `defaultPreSlots`): najprej zmagovalci po številki skupine, nato
      drugouvrščeni.
    */
    const direktne = urejene.filter(s => s.velikost !== 3)
    const dodatne = urejene.filter(s => s.velikost === 3)
    const dW = direktne.map(s => mesto(s, 1))
    const dR = direktne.map(s => mesto(s, 2))
    const eW = dodatne.map(s => mesto(s, 1))
    const eR = dodatne.map(s => mesto(s, 2))
    const M = direktne.length * 2   // tekem naslednjega kroga = direktnih napredovalcev
    const krizanje = M >= 2 && M % 2 === 0 && dodatne.length * 2 === 2 * M && dW.length === dR.length

    if (krizanje) {
      const slots = []
      for (let k = 0; k < M; k++) {
        slots.push({
          direct: k < dW.length ? dW[k] : (dR[M - 1 - k] ?? null),
          extraA: eW[k] ?? null,
          extraB: eR[M - 1 - k] ?? null,
        })
      }
      pari = preRoundFirstRoundPairs(slots)
    } else {
      // Struktura ne dopušča križanja (npr. ročno vsiljeno število skupin) —
      // admin takrat uporabi nosilni razpored. Ta je prav tako STRUKTUREN:
      // nosilno vrednost jemlje iz vrstnega reda polja, ne iz rezultatov.
      pari = pairsFromSeededTeams([...dW, ...dR, ...eW, ...eR])
    }
  }

  let tekme: PlannedMatch[]
  try {
    tekme = buildBracketFromFirstRound(pari, { thirdPlace: false })
  } catch (err) {
    return brezNacrta(`Mreže za ${G} skupin ni mogoče sestaviti: ${(err as Error).message}`)
  }

  return { napovedljivo: true, jePredkolo, tekme: razresiProste(tekme) }
}

/**
 * Razreši proste prehode naprej po mreži.
 *
 * `buildBracketFromFirstRound` nadaljnje kroge pusti prazne; pri pravi mreži
 * jih napolni `propagateKnockout` po vpisu v bazo. Pri predkolu je to BISTVENO
 * in ne podrobnost: direktna ekipa ima prosti prehod, zato je njeno mesto v
 * drugem krogu znano TAKOJ. Brez tega bi pri večini državnih prvenstev
 * (3, 6, 12 ali 24 skupin) polovica mreže pisala »zmagovalec prve tekme«,
 * kjer je ta tekma prosta — gledalcu nesmisel.
 */
function razresiProste(nacrt: PlannedMatch[]): PlannedMatch[] {
  const vrstice: KoMatchRow[] = nacrt.map(m => ({
    id: `${m.stage}-${m.matchNumber}`,
    stage: m.stage,
    match_number: m.matchNumber,
    team_a_id: m.teamA,
    team_b_id: m.teamB,
    winner_id: m.winner,
    is_bye: m.isBye,
  }))
  const poId = new Map(vrstice.map(v => [v.id, v]))

  // Več krogov ne more biti kot vrstic; trda meja namesto `while (true)`.
  for (let obhod = 0; obhod < vrstice.length; obhod++) {
    const posodobitve = knockoutPropagation(vrstice)
    if (posodobitve.length === 0) break
    for (const u of posodobitve) {
      const cilj = poId.get(u.id)
      if (!cilj) continue
      if (u.slot === 'team_a_id') cilj.team_a_id = u.teamId
      else cilj.team_b_id = u.teamId
    }
  }

  return vrstice.map(v => ({
    stage: v.stage,
    matchNumber: v.match_number,
    teamA: v.team_a_id,
    teamB: v.team_b_id,
    isBye: v.is_bye,
    winner: v.winner_id,
  }))
}

/** Skupinska tekma, kolikor je je potrebno za izpeljavo napredovalcev. */
export interface SkupinskaTekma {
  group_id: string
  match_number: number
  winner_id: string | null
}

/** Skupina z id-jem — za vez med tekmo in številko skupine. */
export interface SkupinaZId extends SkupinaNacrta {
  id: string
}

/**
 * Kdo je doslej zasedel katero mesto: ključ mesta → id ekipe.
 *
 * Napredovalec je zmagovalec DOLOČENE tekme v skupini — katere, pove
 * `GROUP_QUALIFIERS` (edini vir tega pravila; admin ga je imel prepisanega kot
 * `size <= 4 ? 3 : 7`, kar je ista številka na drugem mestu in se ob prvi
 * spremembi razide).
 *
 * Mesta, ki še niso znana, v preslikavi preprosto ni — klicatelj takrat izpiše
 * oznako (»Zmagovalec S3«).
 */
export function napredovalciPoMestih(
  skupine: SkupinaZId[],
  tekme: SkupinskaTekma[],
): Map<string, string> {
  const out = new Map<string, string>()
  for (const s of skupine) {
    const pravilo = GROUP_QUALIFIERS[s.velikost]
    if (!pravilo) continue
    for (const mesto of [1, 2] as const) {
      const stTekme = pravilo[mesto].winsMatch
      const t = tekme.find(x => x.group_id === s.id && x.match_number === stTekme)
      if (t?.winner_id) out.set(kljucMesta({ skupina: s.stevilka, mesto }), t.winner_id)
    }
  }
  return out
}

/**
 * Kaj izpisati na enem mestu mreže.
 *
 * Vrne ime ekipe, kadar je mesto že znano, sicer oznako mesta. `null` pomeni,
 * da mesto čaka tekmo prejšnjega kroga in ga še ni mogoče poimenovati.
 */
export function izpisMesta(
  kljuc: string | null,
  napredovali: Map<string, string>,
  imeEkipe: (teamId: string) => string | undefined,
): { besedilo: string; znano: boolean } | null {
  if (!kljuc) return null
  const mesto = razberiMesto(kljuc)
  if (!mesto) {
    // Ni ključ mesta — torej pravi id ekipe (v mreži se to ne zgodi, a naj
    // funkcija ne laže, če se kdaj).
    const ime = imeEkipe(kljuc)
    return ime ? { besedilo: ime, znano: true } : null
  }
  const teamId = napredovali.get(kljuc)
  const ime = teamId ? imeEkipe(teamId) : undefined
  if (teamId && ime) return { besedilo: ime, znano: true }
  return { besedilo: oznakaMesta(mesto), znano: false }
}
