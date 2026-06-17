-- ============================================================================
-- BG Session — migration 0002: richer profiles + onboarding
-- Run this in the Supabase SQL editor after 0001_init.sql.
--
-- Adds the fields collected during onboarding (right after first signup).
-- `nickname` is the public-facing name; we keep `display_name` in sync with it
-- so existing queries that embed profiles keep working unchanged.
-- ============================================================================

alter table profiles
  add column if not exists real_name      text,
  add column if not exists nickname       text,
  add column if not exists gender         text,
  add column if not exists favorite_games text[] not null default '{}',
  add column if not exists owned_games    text[] not null default '{}',
  add column if not exists onboarded      boolean not null default false;

-- The existing "profiles_update_own" RLS policy already lets a user update any
-- column on their own row, so no policy changes are needed.
