-- ============================================================================
-- BG Session — migration 0015: ratings & reviews are permanent
--
-- A session rating/review can no longer be changed or removed once submitted —
-- you rate once, and that's final. We drop the UPDATE and DELETE policies on
-- session_ratings so immutability is enforced at the database (not just hidden
-- in the UI); the INSERT and participant-only SELECT policies stay as-is.
-- The now-unused before-update trigger is dropped too.
-- ============================================================================

drop policy if exists "ratings_update_self" on session_ratings;
drop policy if exists "ratings_delete_self" on session_ratings;

drop trigger if exists trg_ratings_touch on session_ratings;
