-- Sodnik pri skupini + številka steze pri tekmi.
-- Lokacija skupine (venue_name) že obstaja; tu dodamo še sodnika in stezo.

-- Sodnik skupine (izbran iz uporabnikov; brez FK ON DELETE kaskade — ob izbrisu
-- uporabnika ostane NULL prek set null).
alter table tournament_groups
  add column if not exists judge_id uuid references users(id) on delete set null;

-- Prostoročna številka steze pri posamezni tekmi (npr. "3", "A2").
alter table matches
  add column if not exists lane_number text;
