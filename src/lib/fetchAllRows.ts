/**
 * Prebere VSE vrstice poizvedbe, po straneh.
 *
 * PostgREST vrne največ 1000 vrstic na poizvedbo, ne glede na `limit`. Kdor
 * tega ne upošteva, dobi tiho krnjen seznam — brez napake, brez opozorila.
 * V tem projektu se je to zgodilo že dvakrat: enkrat v skrbniškem seznamu
 * uporabnikov (seznam se je odrezal pri črki S) in enkrat v spustnih menijih
 * za izbiro igralca v ligi, kjer je od 1173 igralcev manjkalo 173.
 *
 * Zato ta funkcija namesto še ene ročne zanke.
 *
 * Uporaba:
 *   const vsi = await fetchAllRows<Igralec>((od, do_) =>
 *     supabase.from('users').select('id, full_name').order('full_name').range(od, do_))
 *
 * Napake se vržejo naprej. Krnjen seznam je slabši od napake: napako opaziš,
 * manjkajočih vrstic pa ne.
 */

export const VELIKOST_STRANI = 1000

type Odziv<T> = { data: T[] | null; error: unknown }

export async function fetchAllRows<T>(
  zgradiPoizvedbo: (od: number, doVkljucno: number) => PromiseLike<Odziv<T>>,
): Promise<T[]> {
  const vse: T[] = []

  for (let od = 0; ; od += VELIKOST_STRANI) {
    const { data, error } = await zgradiPoizvedbo(od, od + VELIKOST_STRANI - 1)
    if (error) throw error

    const stran = data ?? []
    vse.push(...stran)

    // Krajša stran od zahtevane pomeni, da smo na koncu. Polna stran ne pomeni
    // nič — treba je vprašati še enkrat, sicer bi pri točnem večkratniku 1000
    // zadnjo stran spregledali.
    if (stran.length < VELIKOST_STRANI) break
  }

  return vse
}
