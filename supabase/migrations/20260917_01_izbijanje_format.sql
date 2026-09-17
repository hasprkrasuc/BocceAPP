-- DRŽAVNO PRVENSTVO V IZBIJANJU — hitrostno, natančno, štafetno.
--
-- Te discipline niso dvoboji: tekmovalec izbija sam in dobi ŠTEVILO zadetkov.
-- Zato zanje ni ne skupin ne pajka — so SERIJE, po vsaki gre naprej najboljših
-- nekaj. Koliko serij je, pove število prijavljenih (pravila BZS):
--
--   do 6      — ena sama serija, ta da končni vrstni red
--   7 do 15   — kvalifikacije, štirje najboljši v finale
--   16 in več — kvalifikacije, osem v četrtfinale, štirje v finale
--
-- Pravila so v src/engines/izbijanje.ts in preverjena proti grafikonu
-- DP dan slovenskega balinanja, Škofja Loka, 30. 11. 2025.
--
-- ZAKAJ NOVA TABELA IN NE `matches`
--
-- `matches` opisuje DVOBOJ: dve strani, zmagovalec. Izbijanje nima nasprotnika,
-- ima samo izid tekmovalca v seriji. Če bi ga tlačili v `matches`, bi bilo
-- team_b_id vedno prazno, winner_id pa bi moral pomeniti nekaj drugega kot
-- povsod drugod — in vsaka poizvedba nad izločilnimi tekmami bi morala poznati
-- izjemo. Ena ozka tabela je ceneje od te izjeme.
--
-- KONČNI VRSTNI RED se NE hrani tu: piše se v `tournament_registrations.final_rank`,
-- od koder ga rang lestvica že zna brati (src/lib/rangLestvica.ts).

alter table public.tournaments
  drop constraint if exists tournaments_format_check;

alter table public.tournaments
  add constraint tournaments_format_check
  check (format = any (array['groups'::text, 'knockout'::text, 'round_robin'::text, 'izbijanje'::text]));

comment on column public.tournaments.format is
  'groups/knockout/round_robin = tekmovanja z dvoboji; izbijanje = serije brez nasprotnika (hitrostno, natančno, štafetno) — izidi so v izbijanje_izidi.';

create table if not exists public.izbijanje_izidi (
  registration_id uuid not null
    references public.tournament_registrations(id) on delete cascade,
  -- Serija: 'kvalifikacije' | 'cetrtfinale' | 'finale'. Brez šumnikov, ker je
  -- vrednost ključ v kodi (KrogIzbijanja), ne besedilo za izpis.
  krog       text    not null check (krog = any (array['kvalifikacije'::text, 'cetrtfinale'::text, 'finale'::text])),
  -- Število zadetkov. Nič je veljaven izid (glej Unetiča na DP 2025), zato
  -- »ni nastopil« pomeni ODSOTNOST VRSTICE in ne rezultat 0.
  zadetki    integer not null check (zadetki >= 0),
  vpisal     uuid    references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (registration_id, krog)
);

create index if not exists idx_izbijanje_izidi_registration
  on public.izbijanje_izidi (registration_id);

comment on table public.izbijanje_izidi is
  'Izid tekmovalca v eni seriji izbijanja. Odsotnost vrstice pomeni, da v tej seriji ni nastopil — 0 je veljaven izid.';

alter table public.izbijanje_izidi enable row level security;

-- Branje je javno: grafikon tekmovanja je javen, enako kot zapisnik tekme.
drop policy if exists "Javno branje" on public.izbijanje_izidi;
create policy "Javno branje" on public.izbijanje_izidi for select using (true);

drop policy if exists "Admin upravlja izbijanje" on public.izbijanje_izidi;
create policy "Admin upravlja izbijanje" on public.izbijanje_izidi
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Sodnik, delegiran na to prvenstvo, vpisuje izide svoje serije.
drop policy if exists "Sodnik vpisuje izbijanje" on public.izbijanje_izidi;
create policy "Sodnik vpisuje izbijanje" on public.izbijanje_izidi
  for all to authenticated
  using (exists (
    select 1
      from public.tournament_registrations r
      join public.tournament_groups g on g.tournament_id = r.tournament_id
     where r.id = izbijanje_izidi.registration_id
       and g.judge_id = (select auth.uid())))
  with check (exists (
    select 1
      from public.tournament_registrations r
      join public.tournament_groups g on g.tournament_id = r.tournament_id
     where r.id = izbijanje_izidi.registration_id
       and g.judge_id = (select auth.uid())));

-- ŽREBANA ŠTEVILKA. Grafikon zveze ima stolpec »št. žreba« in ta številka je
-- pri izbijanju zadnje merilo, kadar sta izida enaka (DP 2025: Završnik in
-- Kreševič, oba 3 — pred njim je Završnik, ker je bil izžreban prvi).
-- Ostane NULL, dokler žreba ni; takrat velja vrstni red prijave.
alter table public.tournament_registrations
  add column if not exists draw_number integer;

comment on column public.tournament_registrations.draw_number is
  'Žrebana številka tekmovalca (stolpec »št. žreba« na grafikonu zveze). Pri izbijanju zadnje merilo ob izenačenih izidih.';
