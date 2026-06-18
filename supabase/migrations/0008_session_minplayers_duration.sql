-- ============================================================================
-- BG Session — migration 0008: minimum players + estimated duration
-- ============================================================================

alter table sessions
  add column if not exists min_players      int,
  add column if not exists duration_minutes int;

-- Backfill + constraints (added separately so re-runs don't error).
update sessions set min_players = 1 where min_players is null;

alter table sessions alter column min_players set default 1;
alter table sessions alter column min_players set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_min_players_check') then
    alter table sessions add constraint sessions_min_players_check
      check (min_players >= 1 and min_players <= max_players);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sessions_duration_check') then
    alter table sessions add constraint sessions_duration_check
      check (duration_minutes is null or duration_minutes > 0);
  end if;
end $$;
