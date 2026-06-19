-- ============================================================================
-- BG Session — migration 0023: drop the unused `domiciles` table
--
-- `domiciles` (added in 0009) backed a strict pick-list for the profile
-- "Domicile" field. That picker has since been replaced with a plain free-text
-- input (profiles.domicile is just text now), so the lookup table is dead — the
-- app no longer reads it anywhere. Drop it. The profiles.domicile column and the
-- board_games catalog (also added in 0009) are kept.
-- ============================================================================

drop table if exists public.domiciles cascade;
