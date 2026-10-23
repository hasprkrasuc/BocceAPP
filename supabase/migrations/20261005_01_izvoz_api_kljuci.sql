-- Ključi za izvozni API (edge funkcija `izvoz`).
--
-- BalinarApp izpostavlja varovan izvozni API za zunanje sisteme (evidenca
-- BZS na evidence.balinanje.si, posredovanje na portal OKS za rezultate in
-- kategorizacije). Dostop varuje API ključ: hrani se SAMO sha256 ključa,
-- ključ sam je izročen skrbniku zunanjega sistema in ga baza ne pozna.
--
-- Tabela je dostopna izključno servisni vlogi (edge funkcija) — RLS je
-- vklopljen BREZ politik, zato anon/authenticated ne vidita in ne pišeta.

create table if not exists public.izvoz_api_kljuci (
  id uuid primary key default gen_random_uuid(),
  -- Komu je ključ izročen (npr. 'evidence.balinanje.si').
  oznaka text not null,
  -- sha256 ključa v šestnajstiškem zapisu (64 znakov).
  kljuc_hash text not null unique,
  aktiven boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.izvoz_api_kljuci enable row level security;

comment on table public.izvoz_api_kljuci is
  'Ključi izvoznega API-ja (edge funkcija izvoz). Hrani se samo sha256 ključa; preklic = aktiven false.';

-- ─────────────────────────────────────────────────────────────
-- PRAVICE ZA DATA API
--
-- Supabase od 30. 10. 2026 novim tabelam v shemi `public` pravic ne podeli
-- več sam (doslej je to opravil privzetek `alter default privileges`). Brez
-- teh vrstic se migracija izvede BREZ NAPAKE, obnovljena baza pa prek
-- PostgREST na vsako poizvedbo vrne »permission denied«.
--
-- RLS tega ne nadomesti: RLS izbira VRSTICE, grant pa odloča, ali odjemalec
-- tabelo sploh vidi. Vse tabele spodaj imajo RLS vklopljen, zato je obseg
-- enak produkcijskemu (primerjano 23. 10. 2026).
--
-- Na produkciji je to no-op — pravice tam že obstajajo.
-- ─────────────────────────────────────────────────────────────

-- izvoz_api_kljuci nima nobene politike RLS — s tem je zaprt za vse
-- razen service_role, ki RLS obide. Pravice so enake kot drugod,
-- ker dostop ustavi RLS in ne grant.
grant all on public.izvoz_api_kljuci to anon, authenticated, service_role;
