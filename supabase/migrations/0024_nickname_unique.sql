-- ============================================================================
-- BG Session — migration 0024: enforce unique nicknames (case-insensitive)
-- Run this in the Supabase SQL editor.
--
-- The app validates nickname format client-side (<= 20 chars; letters, digits
-- and . _ - only) and pre-checks availability, but this index is the real guard
-- against two users racing to claim the same nickname. Uniqueness is
-- case-insensitive, so "Andi" and "andi" collide. NULL nicknames are allowed
-- (a brand-new auth row has none until onboarding fills it in).
--
-- NOTE: if any case-insensitive duplicate nicknames already exist, this index
-- will fail to create — resolve those rows first, e.g.:
--   select lower(nickname), count(*) from profiles
--   where nickname is not null group by 1 having count(*) > 1;
-- ============================================================================

create unique index if not exists profiles_nickname_lower_unique
  on profiles (lower(nickname))
  where nickname is not null;
