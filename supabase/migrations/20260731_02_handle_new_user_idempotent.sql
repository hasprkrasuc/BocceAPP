-- handle_new_user: ne padi, če profil s tem id že obstaja.
--
-- Trigger on_auth_user_created vstavlja v public.users brez on conflict. Ko je
-- treba obnoviti auth račun za profil, ki je ostal brez njega, ustvarjanje
-- auth uporabnika z istim id sproži ta trigger — ta trči ob primarni ključ in
-- celotna operacija pade. Obnova takega profila je bila zato nemogoča.
--
-- Tak profil v produkciji obstaja: vrstica v public.users s tri sezone Super
-- lige in 159 disciplinskimi rezultati, brez vrstice v auth.users. Prijava
-- vanj ni mogoča, podatki pa so vezani na njegov id, zato ga ni mogoče niti
-- izbrisati niti nadomestiti — edina pot je obnoviti auth račun z ISTIM id.
--
-- on conflict do nothing ohrani obstoječi profil nedotaknjen (ime, klub,
-- licenco, občutljive stolpce). Pri obnovi je to ravno želeno: podatki so na
-- profilu, manjka le auth račun.
--
-- Za običajne registracije se ne spremeni nič — tam id še ne obstaja.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated, public;
