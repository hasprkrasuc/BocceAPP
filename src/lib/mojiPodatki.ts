/**
 * IZVOZ LASTNIH PODATKOV (GDPR, 15. in 20. člen)
 *
 * Sestavi datoteko z vsem, kar aplikacija hrani o prijavljenem uporabniku.
 * Ta modul je čista logika: podatke dobi kot argument, vrne besedilo datoteke.
 * Poizvedbe opravi klicatelj, prenos sproži brskalnik.
 *
 * Zakaj JSON in ne PDF: 20. člen zahteva "strukturirano, splošno uporabljano in
 * strojno berljivo obliko". JSON to je, PDF ni.
 *
 * Prazna polja se NE izpustijo. Če uporabnik vidi `"telefon": null`, ve, da
 * telefona ne hranimo; če vrstice sploh ne bi bilo, tega ne bi vedel — vpogled
 * mora pokazati tudi odsotnost podatka.
 */

/** Kar o osebi hrani aplikacija, v obliki za izvoz. */
export interface MojiPodatki {
  profil: Record<string, unknown>
  ekipe?: Record<string, unknown>[]
  sodniske_tekme?: Record<string, unknown>[]
  prijave_na_turnirje?: Record<string, unknown>[]
}

/** Naslovi polj v slovenščini, da izvoz ni seznam angleških imen stolpcev. */
const IMENA_POLJ: Record<string, string> = {
  id: 'identifikator',
  full_name: 'ime_in_priimek',
  email: 'e_naslov',
  phone: 'telefon',
  club: 'klub',
  club_id: 'identifikator_kluba',
  role: 'vloga',
  license_number: 'stevilka_licence',
  date_of_birth: 'datum_rojstva',
  birth_year: 'letnica_rojstva',
  gender: 'spol',
  emso: 'emso',
  birth_city: 'kraj_rojstva',
  birth_country: 'drzava_rojstva',
  citizenship: 'drzavljanstvo',
  address_street: 'naslov_ulica',
  address_house: 'naslov_hisna_stevilka',
  address_postal: 'naslov_posta',
  address_city: 'naslov_kraj',
  address_country: 'naslov_drzava',
  photo_url: 'fotografija',
  created_at: 'ustvarjeno',
  must_change_password: 'zahtevana_menjava_gesla',
}

/** Polja, ki niso osebni podatek, ampak notranja tehnična podrobnost. */
const TEHNICNA_POLJA = new Set(['must_change_password'])

/** Preimenuje ključe v slovenske in odstrani tehnična polja. */
export function preimenujPolja(vrstica: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(vrstica)) {
    if (TEHNICNA_POLJA.has(k)) continue
    out[IMENA_POLJ[k] ?? k] = v ?? null
  }
  return out
}

/**
 * Sestavi vsebino izvozne datoteke.
 * @param cas trenutek izvoza; podan od zunaj, da je funkcija čista in testljiva
 */
export function sestaviIzvoz(podatki: MojiPodatki, cas: Date): string {
  const telo = {
    _o_izvozu: {
      aplikacija: 'BalinarApp (balinar.app)',
      ustvarjeno: cas.toISOString(),
      pojasnilo:
        'Vsi podatki, ki jih aplikacija hrani o vas. Vrednost null pomeni, ' +
        'da podatka ne hranimo. Izvoz je pripravljen po 15. in 20. členu ' +
        'Splošne uredbe o varstvu podatkov.',
    },
    profil: preimenujPolja(podatki.profil),
    ekipe: (podatki.ekipe ?? []).map(preimenujPolja),
    sodniske_tekme: (podatki.sodniske_tekme ?? []).map(preimenujPolja),
    prijave_na_turnirje: (podatki.prijave_na_turnirje ?? []).map(preimenujPolja),
  }
  return JSON.stringify(telo, null, 2)
}

/** Ime datoteke: ime osebe in datum, da je med prenesenimi datotekami prepoznavna. */
export function imeDatoteke(imeOsebe: string | null | undefined, cas: Date): string {
  const varno = (imeOsebe ?? 'moji-podatki')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // odstrani strešice
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'moji-podatki'
  const d = cas.toISOString().slice(0, 10)
  return `balinarapp-${varno}-${d}.json`
}
