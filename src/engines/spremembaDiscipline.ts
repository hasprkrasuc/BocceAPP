import { jeParnoTekmovanje, normalizirajDisciplino, OZNAKE_DISCIPLIN } from './tournamentPlacement'
import { najvisjiRezultat } from './rezultatTekme'
import { kljucPrvenstva } from './dpSerije'
import type { DisciplineType } from './leagueDisciplines'

/**
 * KAJ POVZROČI SPREMEMBA DISCIPLINE TEKMOVANJA.
 *
 * Disciplino je bilo doslej mogoče nastaviti samo ob ustvarjanju in nikoli
 * pozneje. To se je 23. 10. 2026 maščevalo: prvenstvo brez vpisane discipline
 * je dobilo mejo rezultata balinanja in sodnik iz tega ni mogel sam, ker
 * discipline nikjer ni mogel vpisati. Polje torej mora obstajati.
 *
 * Ni pa nedolžno. Zato opozarjamo — ne prepovedujemo, ker je prav prepoved
 * tista past, ki nas je pripeljala sem.
 *
 * OPOZORILO MORA BITI RESNIČNO. Prva različica tega motorja je trdila, da se
 * po prehodu v posamično disciplino »partnerji ne bodo več izpisovali«.
 * Nasprotno je res: `teamDisplayName` se odloča IZKLJUČNO po vsebini prijave
 * (`hasP2`) in discipline ne vpraša nikoli, `tournamentPlayerPoints` pa
 * potisne točke OBEMA igralcema (vrstici 238–241). Admin bi potrdil nekaj
 * drugega, kot se zares zgodi — kar je slabše od molka.
 */

/** Stanje tekmovanja, kolikor ga je potrebno za presojo. */
export interface StanjeTekmovanja {
  format: string | null | undefined
  disciplina: string | null | undefined
  /** `championship` ali `tournament`. */
  kind: string | null | undefined
  kategorija: string | null | undefined
  /** Datum tekmovanja (ISO) — odloča, katera izdaja prvenstva izrine katero. */
  datum: string
  /** Samo POTRJENE prijave; žreb in skupine delajo z istimi. */
  stPrijav: number
  /** Koliko potrjenih prijav ima vpisanega partnerja. */
  stPrijavSPartnerjem: number
  imaSkupine: boolean
  /** Ali je kje vpisana končna uvrstitev ali odigrana tekma. */
  imaIzide: boolean
  /** Koliko prijav ima vpisano končno uvrstitev. */
  stUvrstitev: number
}

/** Drugo prvenstvo iste kategorije — za presojo o izdajah na lestvici. */
export interface DrugoPrvenstvo {
  ime: string
  disciplina: string | null | undefined
  datum: string
  stUvrstitev: number
  imaIzide: boolean
}

/** Kar je treba prebrati iz baze šele, ko je nova disciplina znana. */
export interface OkolicaSpremembe {
  /** Tekme, katerih izid presega mejo NOVE discipline. */
  stTekemNadNovoMejo: number
  /** Druga prvenstva iste kategorije (brez tega). */
  drugaPrvenstva: DrugoPrvenstvo[]
}

export interface PosledicaSpremembe {
  spremenjeno: boolean
  /** Kaj mora admin potrditi; prazno pomeni neškodljivo spremembo. */
  opozorila: string[]
}

/** Človeška oznaka discipline; `null` je »ni vpisana«. */
export function oznakaDiscipline(d: string | null | undefined): string {
  const n = normalizirajDisciplino(d)
  if (n) return OZNAKE_DISCIPLIN[n]
  const raw = d?.trim()
  return raw ? raw : 'ni vpisana'
}

function izdaja(datum: string, kategorija: string | null | undefined, disciplina: string | null | undefined) {
  return kljucPrvenstva({ date: datum, category: kategorija, discipline_type: disciplina, imaIzide: true })
}

/**
 * Posledice zamenjave discipline. Nova vrednost `null` pomeni »izbriši«.
 *
 * Primerjamo po NORMALIZIRANI disciplini: `igra v krog` in `krog` sta ista
 * disciplina, zato med njima ni česa potrjevati.
 */
export function posledicaSpremembeDiscipline(
  stanje: StanjeTekmovanja,
  nova: DisciplineType | null,
  okolica?: OkolicaSpremembe,
): PosledicaSpremembe {
  const stara = normalizirajDisciplino(stanje.disciplina)
  if (stara === nova) return { spremenjeno: false, opozorila: [] }

  const opozorila: string[] = []

  // ── 1) Par ali posameznik ────────────────────────────────────────────
  const bilParno = jeParnoTekmovanje(stanje.format, stanje.disciplina)
  const boParno = jeParnoTekmovanje(stanje.format, nova)

  if (bilParno !== boParno && stanje.stPrijav > 0) {
    if (bilParno) {
      const n = stanje.stPrijavSPartnerjem
      if (n > 0) {
        opozorila.push(
          `${n} ${n === 1 ? 'potrjena prijava ima' : 'potrjenih prijav ima'} partnerja in ta se NE bo počistil. `
          + 'Ime ekipe se bo še naprej izpisovalo kot »Novak / Kovač«, uvrstitev pa bo še vedno '
          + 'točkovana za OBA igralca — izpis in točkovanje se ravnata po vsebini prijave, ne po disciplini.',
        )
        opozorila.push(
          'Partnerja lahko potem odstraniš v urejanju prijave: pri posamični disciplini se polje '
          + '»Igralec 2« pokaže prav zato in ima možnost »— brez partnerja —«. Prijave ni treba '
          + 'brisati — izbris bi pobrisal tudi mesto v skupini.',
        )
      } else {
        opozorila.push('Po spremembi se tekmuje posamično namesto v paru.')
      }
    } else {
      opozorila.push(
        `Po spremembi se tekmuje v paru, ${stanje.stPrijav} potrjenih prijav pa je brez partnerja. `
        + 'Pri teh bo kot ekipa izpisan samo prvi igralec.',
      )
    }
    if (stanje.imaSkupine) {
      // Smer je pomembna: nosilna vrednost se po spremembi RAVNA PO DISCIPLINI
      // (`nosilnaVrednost`), zato je trditev o seštevanju v eni smeri resnična,
      // v drugi pa ne. Prva različica tega opozorila je bila zunaj veje in je
      // adminu obljubila nasprotje tega, kar se zgodi.
      opozorila.push(
        bilParno
          ? 'Skupine so že žrebane. Nosilni žreb odslej upošteva samo prvega igralca, zato bi '
            + 'ponoven žreb dal drugačne bobne; že žrebane skupine ostanejo nespremenjene.'
          : 'Skupine so že žrebane. Nosilni žreb odslej sešteva rang točke obeh igralcev, zato bi '
            + 'ponoven žreb dal drugačne bobne.',
      )
    }
  }

  // ── 2) Meja rezultata ────────────────────────────────────────────────
  const staraMeja = najvisjiRezultat(stanje.disciplina)
  const novaMeja = najvisjiRezultat(nova)
  if (novaMeja < staraMeja) {
    const n = okolica?.stTekemNadNovoMejo ?? 0
    opozorila.push(
      n > 0
        ? `Meja rezultata pade z ${staraMeja} na ${novaMeja}, ${n} ${n === 1 ? 'odigrana tekma presega' : 'odigranih tekem presega'} `
          + 'to mejo. Izidi ostanejo shranjeni, popraviti ali znova shraniti pa jih ne bo mogoče.'
        : `Meja rezultata pade z ${staraMeja} na ${novaMeja} — višjih izidov ne bo več mogoče vpisati.`,
    )
  }

  // ── 3) Izdaja prvenstva na rang lestvici ─────────────────────────────
  if (stanje.kind === 'championship' && okolica) {
    const starKljuc = izdaja(stanje.datum, stanje.kategorija, stanje.disciplina)
    const novKljuc = izdaja(stanje.datum, stanje.kategorija, nova)
    const zIzidi = okolica.drugaPrvenstva.filter(p => p.imaIzide)

    // Trk: po spremembi si isti ključ deli z drugim prvenstvom. Obvelja le
    // najnovejši datum — starejša izdaja tiho izpade z lestvice.
    for (const p of zIzidi) {
      if (izdaja(p.datum, stanje.kategorija, p.disciplina) !== novKljuc) continue
      if (!stanje.imaIzide) continue
      opozorila.push(
        stanje.datum < p.datum
          ? `Po spremembi to prvenstvo deli izdajo z »${p.ime}« (${p.datum}), ki je novejše — `
            + `zato bo TO prvenstvo izpadlo z rang lestvice in ${stanje.stUvrstitev} uvrstitev izgubi točke.`
          : `Po spremembi to prvenstvo deli izdajo z »${p.ime}« (${p.datum}) in ga izrine — `
            + `${p.stUvrstitev} uvrstitev tistega prvenstva izgubi točke.`,
      )
    }

    // Obratno: izdaja, ki jo je to prvenstvo doslej izrivalo, se vrne.
    for (const p of zIzidi) {
      if (izdaja(p.datum, stanje.kategorija, p.disciplina) !== starKljuc) continue
      if (!stanje.imaIzide || p.datum >= stanje.datum) continue
      opozorila.push(
        `»${p.ime}« (${p.datum}) doslej ni štelo, ker ga je izrinilo to prvenstvo. `
        + `Po spremembi bo spet nosilo točke za ${p.stUvrstitev} uvrstitev.`,
      )
    }
  }

  return { spremenjeno: true, opozorila }
}

/** Besedilo za potrditveno okno; `null`, kadar potrjevati ni česa. */
export function vprasanjeZaPotrditev(
  stanje: StanjeTekmovanja,
  nova: DisciplineType | null,
  okolica?: OkolicaSpremembe,
): string | null {
  const p = posledicaSpremembeDiscipline(stanje, nova, okolica)
  if (!p.spremenjeno || p.opozorila.length === 0) return null
  return [
    `Disciplina: ${oznakaDiscipline(stanje.disciplina)} → ${oznakaDiscipline(nova)}`,
    '',
    ...p.opozorila.map(o => `• ${o}`),
    '',
    'Nadaljujem?',
  ].join('\n\n')
}
