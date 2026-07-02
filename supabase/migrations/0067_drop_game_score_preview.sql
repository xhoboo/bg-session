-- ============================================================================
-- BG Session — migration 0067: drop the anchor-matched score preview function
--
-- Migration 0054 added get_game_score_preview(session_id, anchor), matched by a
-- slugified game NAME so every play of the same game shared one link and the
-- preview showed "latest of N plays". The share-a-score link now points at one
-- PLAY per URL (/sessions/:id/score/:playId — a game played twice is two
-- separate pages, each with its own Share Score button), so the anchor-matched
-- lookup no longer fits and nothing calls this function anymore. The API
-- routes (api/session-preview.js, api/session-image.js) now build the same
-- preview by filtering get_public_session_plays (migration 0063) to the one
-- play id — no replacement SQL function needed.
-- ============================================================================

drop function if exists public.get_game_score_preview(uuid, text);
