-- Direktni izločilni sistem za DP: format turnirja + večji izločilni krogi.
alter table tournaments
  add column if not exists format text not null default 'groups'
  check (format in ('groups','knockout'));

alter table matches drop constraint if exists matches_stage_check;
alter table matches add constraint matches_stage_check
  check (stage in ('group','r128','r64','r32','r16','qf','sf','final','third_place'));
