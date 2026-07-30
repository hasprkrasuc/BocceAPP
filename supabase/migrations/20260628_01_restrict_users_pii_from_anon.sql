-- Omeji NEavtenticirano (anon) branje tabele users le na ne-občutljive stolpce.
--
-- ⚠️ UVELJAVI ŠELE PO DEPLOYU odjemalca, ki javne strani bere z eksplicitnimi
-- stolpci (USER_PUBLIC_COLS) namesto users(*). Sicer PostgREST za anon `select=*`
-- vrne 401 in javne strani se pokvarijo za odjavljene obiskovalce.
--
-- Občutljivi stolpci (emso, email, phone, naslov*, kraj/država rojstva,
-- državljanstvo) ostanejo dostopni le avtenticiranim (lastni profil) in adminom.

revoke select on public.users from anon;

grant select (
  id, full_name, club, club_id, role, license_number, date_of_birth, gender, photo_url
) on public.users to anon;
