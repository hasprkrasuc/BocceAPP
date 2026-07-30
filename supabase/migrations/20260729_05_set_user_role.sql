-- Popravek: admin ne more spremeniti vloge drugemu uporabniku, in to TIHO.
--
-- Stanje pred tem popravkom (preverjeno neposredno proti produkciji 2026-07-29):
--   - Na `users` obstajata samo politiki "Javno branje" (SELECT) in
--     "Lastni profil" (UPDATE, `auth.uid() = id`).
--   - `UserAdmin.updateRole` požene `update({role}).eq('id', userId)`. Ker RLS
--     do tuje vrstice ne spusti, poizvedba ujame NIČ vrstic — PostgREST pa to
--     vrne kot USPEH, ne kot napako. Komponenta izida ni preverjala, zato je
--     bilo videti, kot da se izbira ni prijela.
--   - Prožilec `prevent_role_escalation` je pisan tako, da bi adminom menjavo
--     dovolil, a do njega sploh ne pride — RLS ga prehiti. Dve zaščiti, ki
--     druga o drugi ne vesta.
--
-- Zakaj funkcija in ne RLS politika: politika `for update using (is_admin())`
-- na `users` bi adminom odprla pisanje po VSEH stolpcih vseh uporabnikov,
-- vključno z EMŠO in naslovi, ki smo jim branje pravkar zaprli
-- (20260729_02_users_pii_authenticated.sql). Admin potrebuje eno samo pravico —
-- nastaviti vlogo — zato jo dobi natanko to.
--
-- Pravilo za super_admin: vlogo `super_admin` sme podeliti ali odvzeti le
-- super_admin. Brez tega bi si navaden admin lahko ustvaril super admina in se
-- tako povzpel po ovinku.

create or replace function public.set_user_role(target_id uuid, new_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  target_role text;
begin
  select role into caller_role from public.users where id = auth.uid();

  if caller_role is null or caller_role not in ('admin', 'super_admin') then
    raise exception 'Za spreminjanje vlog so potrebne administratorske pravice.'
      using errcode = '42501';
  end if;

  if new_role not in ('player', 'judge', 'admin', 'super_admin') then
    raise exception 'Neznana vloga: %', new_role using errcode = '22023';
  end if;

  select role into target_role from public.users where id = target_id;
  if target_role is null then
    raise exception 'Uporabnik ne obstaja.' using errcode = 'P0002';
  end if;

  -- Podelitev ali odvzem super_admin vloge je pridržana super adminom.
  if (new_role = 'super_admin' or target_role = 'super_admin')
     and caller_role <> 'super_admin' then
    raise exception 'Vlogo super_admin sme dodeliti ali odvzeti le super_admin.'
      using errcode = '42501';
  end if;

  update public.users set role = new_role where id = target_id;

  return new_role;
end;
$$;

comment on function public.set_user_role(uuid, text) is
  'Nastavi vlogo uporabnika. Edina pot, po kateri admin spremeni tujo vlogo — RLS na users dovoljuje pisanje le po lastni vrstici.';

-- `revoke ... from public` NE zadošča: Supabase ima privzete pravice
-- (`alter default privileges ... grant execute on functions to anon, authenticated`),
-- zato nova funkcija dobi EXECUTE za `anon` z izrecnim grantom, ki ga odvzem
-- vlogi PUBLIC ne zadene. Preverjeno 2026-07-29: anon je funkcijo lahko klical
-- in ga je ustavila šele notranja preverba. Zato odvzem tudi izrecno.
revoke all on function public.set_user_role(uuid, text) from public;
revoke all on function public.set_user_role(uuid, text) from anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;
