-- ============================================================================
-- BG Session — migration 0027: raise the minimum players floor to 3
--
-- Sessions now require at least 3 players (matching the app's create/edit
-- validation). Migration 0008 added `sessions_min_players_check` with a lower
-- bound of 1; here we tighten it to 3.
--
-- The check is table-wide and the confirmed_count trigger UPDATEs existing
-- session rows, so old rows must already satisfy the new floor — otherwise any
-- later trigger update would fail. We therefore backfill before re-adding the
-- constraint:
--   * max_players < 3  -> 3   (rare; keeps min <= max after the next step)
--   * min_players < 3  -> 3
--
-- Side effect: an upcoming session whose min_players was below 3 now needs 3
-- confirmed players (incl. host) by its start time, so cancel_understaffed_
-- sessions() may cancel it if it falls short — this is the intended new policy.
-- ============================================================================

-- Backfill existing rows to satisfy the new floor before tightening the check.
update sessions set max_players = 3 where max_players < 3;
update sessions set min_players = 3 where min_players < 3;

alter table sessions alter column min_players set default 3;

alter table sessions drop constraint if exists sessions_min_players_check;
alter table sessions add constraint sessions_min_players_check
  check (min_players >= 3 and min_players <= max_players);
