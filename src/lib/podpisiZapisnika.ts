/**
 * Vrstice za podpis sodnikov na ligaškem zapisniku.
 *
 * Doslej je bila vrstica »Sodnik« v zapisniku zapisana s praznim imenom —
 * glavni sodnik se je izpisal, delegirani sodniki pa nikoli, tudi kadar so
 * bili na tekmi vpisani (npr. Drago Huško: viden kot glavni sodnik, kot
 * sodnik pa ne). Ker `judge_ids` drži seznam, jih mora zapisnik izpisati vse,
 * vsakega s svojo črto za podpis.
 *
 * Brez delegiranih sodnikov ostane ena prazna vrstica: zapisnik se natisne in
 * podpiše na papir, zato mora črta obstajati tudi takrat, ko sodnik ni vpisan.
 */

export type VrsticaPodpisa = [oznaka: string, ime: string]

export function vrsticeSodnikov(
  glavniSodnikId: string,
  sodnikiIds: string[],
  imena: Record<string, string>,
): VrsticaPodpisa[] {
  // Glavni sodnik ne sme podvojeno stati še med sodniki.
  const sodniki = sodnikiIds.filter(id => id && id !== glavniSodnikId)

  return [
    ['Glavni sodnik', imena[glavniSodnikId] ?? ''],
    ...(sodniki.length > 0
      ? sodniki.map((id, i): VrsticaPodpisa => [
          sodniki.length > 1 ? `Sodnik ${i + 1}` : 'Sodnik',
          imena[id] ?? '',
        ])
      : [['Sodnik', ''] as VrsticaPodpisa]),
  ]
}
