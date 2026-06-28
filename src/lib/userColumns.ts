/**
 * Stolpci tabele `users`, varni za JAVNO (anon) branje.
 *
 * Občutljivi osebni podatki (emšo, e-pošta, telefon, naslov, kraj/država rojstva,
 * državljanstvo) so namenoma izpuščeni — javne strani jih ne prikazujejo, dostopni
 * pa so le avtenticiranim (lastni profil) in adminom. Na bazi je za anon vlogo
 * SELECT omejen na te stolpce, zato morajo javne poizvedbe brati eksplicitno
 * (ne `users(*)`), sicer PostgREST vrne 401.
 */
export const USER_PUBLIC_COLS =
  'id,full_name,club,club_id,role,license_number,date_of_birth,gender,photo_url'
