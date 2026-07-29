/**
 * Stolpci tabele `users`, varni za JAVNO branje.
 *
 * Občutljivi osebni podatki (emšo, e-pošta, telefon, naslov, kraj/država rojstva,
 * državljanstvo, poln datum rojstva, številka licence) so namenoma izpuščeni —
 * javne strani jih ne prikazujejo, dostopni pa so le lastniku profila in adminom
 * prek pogleda `users_sensitive`. Na bazi je za vlogi `anon` in `authenticated`
 * SELECT omejen na te stolpce, zato morajo poizvedbe brati eksplicitno
 * (ne `users(*)`), sicer PostgREST vrne 401.
 *
 * Namesto polnega datuma rojstva je tu izpeljana `birth_year`: javne strani od
 * datuma potrebujejo samo letnico (prikaz "r. 1990", letnik, upravičenost do
 * dvojne registracije).
 */
export const USER_PUBLIC_COLS =
  'id,full_name,club,club_id,role,birth_year,gender,photo_url'
