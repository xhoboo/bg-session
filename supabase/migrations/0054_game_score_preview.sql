-- ============================================================================
-- BG Session — migration 0054: anon-readable game-score preview
--
-- The share-a-score link (/sessions/:id/score?game=<anchor>) needs a rich link
-- preview whose image shows the actual result. The preview functions (api/
-- session-image.js, api/session-preview.js) run as the anonymous crawler, but the
-- score tables from 0046 are SELECT-able only `to authenticated`. This SECURITY
-- DEFINER function exposes exactly the public slice of one game's results — same
-- pattern as get_session_preview (0044): pinned empty search_path, granted to anon
-- only, address/host untouched.
--
-- It's matched by the URL's game *anchor* (the slugged game name the app uses to
-- deep-link a result card), reproduced here so SQL and gameAnchor() in
-- src/lib/format.js stay in lockstep. Returns a single jsonb object (session title,
-- canonical game name, and each submitted play with its players + teams), or null
-- when nothing matches so the caller can fall back to the plain session preview.
--
-- Player names are the public NICKNAME only (never display_name, which is seeded
-- from a Google sign-in's real name in 0045) — this card is visible to anyone, so
-- it must never surface a real name. Missing nickname → a generic 'Player'.
-- ============================================================================

create or replace function public.get_game_score_preview(p_session_id uuid, p_anchor text)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  with matched as (
    select gp.id, gp.game_name, gp.mode, gp.lowest_wins, gp.coop_won, gp.submitted_at
    from public.session_game_plays gp
    where gp.session_id = p_session_id
      and gp.status = 'submitted'
      and 'game-' || regexp_replace(
            regexp_replace(lower(trim(gp.game_name)), '[^a-z0-9]+', '-', 'g'),
            '^-+|-+$', '', 'g'
          ) = p_anchor
  )
  select case when not exists (select 1 from matched) then null else
    jsonb_build_object(
      'session_title', (select s.title from public.sessions s where s.id = p_session_id),
      -- Canonical-ish spelling: the earliest submitted play's name.
      'game_name', (select m.game_name from matched m order by m.submitted_at limit 1),
      'plays', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'mode', m.mode,
            'lowest_wins', m.lowest_wins,
            'coop_won', m.coop_won,
            'players', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  -- PUBLIC preview: nickname ONLY, never display_name. display_name
                  -- is seeded from a Google sign-in's real full name (migration
                  -- 0045) and stays set until onboarding, so falling back to it
                  -- would leak real names on this anon-visible card. No nickname →
                  -- a generic 'Player'.
                  'name', coalesce(nullif(trim(pr.nickname), ''), 'Player'),
                  'score', ps.score,
                  'is_winner', ps.is_winner,
                  'team', ps.team
                )
                order by ps.is_winner desc, ps.score desc nulls last
              )
              from public.session_play_scores ps
              join public.profiles pr on pr.id = ps.user_id
              where ps.play_id = m.id
            ), '[]'::jsonb),
            'teams', coalesce((
              select jsonb_agg(
                jsonb_build_object('team', pt.team, 'score', pt.score, 'is_winner', pt.is_winner)
                order by pt.team
              )
              from public.session_play_teams pt
              where pt.play_id = m.id
            ), '[]'::jsonb)
          )
          order by m.submitted_at
        )
        from matched m
      ), '[]'::jsonb)
    )
  end;
$$;

-- Anon (the preview functions use the anon key) is the only caller; signed-in
-- users read the score tables directly through RLS. Mirror 0044's grant hygiene.
revoke all on function public.get_game_score_preview(uuid, text) from public;
grant execute on function public.get_game_score_preview(uuid, text) to anon;

comment on function public.get_game_score_preview(uuid, text) is
  'Anon-readable result of one game (matched by gameAnchor slug) for share/link-preview cards. No address, no host identity. See migration 0054.';
