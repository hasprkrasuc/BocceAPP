-- Admini/super admini lahko trajno izbrišejo prijavo na turnir (napačne prijave).
-- group_teams.registration_id ima ON DELETE CASCADE, zato se vnos v skupini
-- odstrani samodejno.
drop policy if exists "Admin izbriše prijave" on tournament_registrations;
create policy "Admin izbriše prijave" on tournament_registrations
  for delete
  using (exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = any (array['admin','super_admin'])
  ));
