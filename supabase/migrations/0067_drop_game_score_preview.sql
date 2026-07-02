-- ============================================================================
-- BG Session — migration 0067: drop the anchor-matched score preview function
--
-- Migration 0054 added get_game_score_preview(session_id, anchor), matched by a
-- slugified game NAME so every play of the same game shared one link and the
-- preview showed "latest of N plays". The share-a-score link now points at one
-- PLAY per URL (the short /score/:playId), so the anchor-matched lookup no
-- longer fits and nothing calls this function anymore. Its replacement is
-- get_public_play(play_id) in migration 0068, which the API routes
-- (api/session-preview.js, api/session-image.js) use to build the preview.
-- ============================================================================

drop function if exists public.get_game_score_preview(uuid, text);
