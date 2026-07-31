-- Sinhronizacija public.users.email z auth.users.email.
--
-- Doslej je obstajal samo trigger ob VSTAVLJANJU (handle_new_user, 00_schema.sql).
-- Ob spremembi naslova — bodisi prek supabase.auth.updateUser() in potrditve v
-- pismu, bodisi prek admin API-ja — se je public.users.email tiho razšel z
-- auth.users.email. Skrbniški seznam bere users_sensitive nad public.users,
-- zato je kazal zastarel naslov.
--
-- security definer: trigger teče nad auth.users, pisati pa mora v public.users.
-- Fiksen search_path zahteva 20260628_02_security_hardening.sql. Tam je vrednost
-- '' s popolnoma kvalificiranimi imeni; novejše migracije (20260729_02, _05, _06)
-- uporabljajo 'public'. Držimo se novejše navade — telo je tako ali tako
-- kvalificirano (public.users), zato je razlika brez posledic.

create or replace function public.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users set email = new.email where id = new.id;
  return new;
end;
$$;

revoke execute on function public.sync_user_email() from anon, authenticated, public;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_user_email();
