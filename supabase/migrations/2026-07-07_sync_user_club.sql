-- Usklajenost users.club (tekst) z users.club_id ob vsakem uvozu/zapisu.
-- Statistika in rang lestvica bereta TEKSTOVNI club (rang celo izloči igralce brez njega),
-- zato mora biti ob nastavljenem club_id vedno napolnjen tudi tekstovni club.
-- Nedestruktivno: napolni le, če je club prazen (ne povozi ročno vpisanega prostega besedila).

create or replace function public.sync_user_club()
returns trigger as $$
begin
  if new.club_id is not null and (new.club is null or btrim(new.club) = '') then
    select name into new.club from public.clubs where id = new.club_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_user_club on public.users;
create trigger trg_sync_user_club
  before insert or update of club, club_id on public.users
  for each row execute function public.sync_user_club();
