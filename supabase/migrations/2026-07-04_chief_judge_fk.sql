-- Popravek: glavni sodnik zapisnika se ni shranil.
-- Vzrok: league_fixtures.chief_judge_id je imel tuji ključ na auth.users(id),
-- spustni seznam sodnikov pa prihaja iz public.users (večina brez prijavnega
-- računa), zato je izbira kršila FK in tiho padla (napaka ni bila prikazana).
-- Rešitev: FK naj kaže na public.users(id).
alter table league_fixtures drop constraint league_fixtures_chief_judge_id_fkey;
alter table league_fixtures add constraint league_fixtures_chief_judge_id_fkey
  foreign key (chief_judge_id) references public.users(id) on delete set null;
