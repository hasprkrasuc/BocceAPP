-- league_teams.club_id: izrecna povezava ligaške ekipe na klub.
--
-- Doslej je bila povezava samo po besedilu (`club_name`). To je krhko:
-- ista ekipa se je čez sezone pisala različno (»KOZLEK«, »KOZLEK ZABIČE«,
-- »Kozlek Zabiče«), 28 od 186 ekip pa se po imenu s klubom sploh ni ujelo.
-- Vsaka poizvedba, ki je hotela iz ekipe do kluba, je morala ugibati.
--
-- Stolpec je NAMENOMA nullable: nekatere ekipe kluba res nimajo (skupne ekipe
-- dveh društev, ekipe območnih zvez), zato prisiliti povezavo bi pomenilo
-- izmišljati podatek. `club_name` ostane — je zgodovinski zapis, kakor je bila
-- ekipa prijavljena v tisti sezoni, in se ne sme prepisati po klubu.
--
-- on delete set null: brisanje kluba ne sme odnesti ligaške zgodovine.

alter table public.league_teams
  add column if not exists club_id uuid references public.clubs(id) on delete set null;

create index if not exists idx_league_teams_club_id
  on public.league_teams (club_id);

comment on column public.league_teams.club_id is
  'Klub, ki mu ekipa pripada. NULL je dovoljen: skupne ekipe in ekipe brez kluba. Besedilni club_name ostane zgodovinski zapis prijave in ni izpeljan iz tega stolpca.';
