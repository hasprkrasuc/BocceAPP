-- Hitrostno/natančno izbijanje: nov krog »polfinale«.
--
-- Novi sistem napredovanja (engines/izbijanje.ts):
--   do 6      — ena sama (finalna) serija
--   7–9       — kvalifikacije → finale (4)
--   10–32     — kvalifikacije → polfinale (8) → finale (4)
--   33 naprej — kvalifikacije → četrtfinale (16) → polfinale (8) → finale (4)
--
-- CHECK na izbijanje_izidi.krog je poznal le kvalifikacije/cetrtfinale/finale,
-- zato bi vpis polfinalnega izida padel. Obstoječih vrstic s krogom
-- 'cetrtfinale' ob uvedbi ni bilo (preverjeno 17. 11. 2026), zato podatkov ni
-- treba seliti.

alter table public.izbijanje_izidi
  drop constraint if exists izbijanje_izidi_krog_check;
alter table public.izbijanje_izidi
  add constraint izbijanje_izidi_krog_check
  check (krog in ('kvalifikacije', 'cetrtfinale', 'polfinale', 'finale'));
