-- Varnostna utrditev (že uveljavljeno v produkciji prek Supabase migracij).
-- Dokumentirano tu za zapis v repozitoriju.

-- #1 Prepreči stopnjevanje pravic: avtenticiran ne-admin ne sme spremeniti svoje vloge.
-- (service_role z auth.uid()=NULL in admini so dovoljeni; anon ne more posodobiti
--  users zaradi RLS politike "Lastni profil".)
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is not null and not exists (
      select 1 from public.users
      where id = auth.uid() and role in ('admin','super_admin')
    ) then
      raise exception 'Spreminjanje vloge ni dovoljeno';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.prevent_role_escalation() from anon, authenticated, public;

drop trigger if exists trg_prevent_role_escalation on public.users;
create trigger trg_prevent_role_escalation
  before update on public.users
  for each row execute function public.prevent_role_escalation();

-- #5 Odstrani neuporabljen SECURITY DEFINER pogled.
drop view if exists public.v_player_discipline_stats;

-- #4 Utrdi handle_new_user: fiksni search_path + umik iz RPC površine (trigger deluje naprej).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- #6 double_registrations: dodaj manjkajoče RLS politike (javno branje + admin pisanje).
create policy "Javno branje" on public.double_registrations
  for select using (true);
create policy "Admin pisanje dvojne registracije" on public.double_registrations
  for all using (
    auth.uid() in (select id from public.users where role in ('admin','super_admin'))
  );
