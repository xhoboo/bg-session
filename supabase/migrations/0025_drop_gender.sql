-- ============================================================================
-- BG Session — migration 0025: drop the unused `gender` field
--
-- Gender is no longer collected or shown anywhere in the app (the profile form,
-- the confirmed-participants list, and the auth profile load all dropped it).
-- Remove the column from `profile_private` so the schema matches the app.
-- ============================================================================

alter table profile_private drop column if exists gender;
