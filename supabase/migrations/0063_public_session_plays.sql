-- ============================================================================
-- BG Session — migration 0063: public game results for guests
--
-- Scores are already public, but the score tables (session_game_plays /
-- session_play_scores / session_play_teams) are readable only by `authenticated`
-- (migration 0046), and `profiles` stays closed to anon — so a guest can't read
-- a session's game results directly. This adds one SECURITY DEFINER function that
-- returns a session's SUBMITTED plays with their per-player and per-team lines
-- and the players' PUBLIC display fields (nickname / display_name / avatar_url)
-- nested in, shaped exactly like the signed-in score query (PLAY_SELECT in
-- SessionScore.jsx). No user enumeration beyond the public display info that
-- already shows on a card, and no path back to a profile from the guest UI.
--
-- Mirrors the guest-read pattern in migrations 0058 / 0062.
-- ============================================================================

create or replace function public.get_public_session_plays(p_session_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(jsonb_agg(t.play order by t.submitted_at), '[]'::jsonb)
  from (
    select
      gp.submitted_at,
      jsonb_build_object(
        'id',           gp.id,
        'game_name',    gp.game_name,
        'mode',         gp.mode,
        'lowest_wins',  gp.lowest_wins,
        'coop_won',     gp.coop_won,
        'recorded_by',  gp.recorded_by,
        'submitted_at', gp.submitted_at,
        'status',       gp.status,
        'recorder', jsonb_build_object(
          'nickname',     rp.nickname,
          'display_name', rp.display_name,
          'avatar_url',   rp.avatar_url
        ),
        'scores', coalesce((
          select jsonb_agg(jsonb_build_object(
            'user_id',   sps.user_id,
            'score',     sps.score,
            'is_winner', sps.is_winner,
            'team',      sps.team,
            'player', jsonb_build_object(
              'nickname',     pp.nickname,
              'display_name', pp.display_name,
              'avatar_url',   pp.avatar_url
            )
          ))
          from public.session_play_scores sps
          join public.profiles pp on pp.id = sps.user_id
          where sps.play_id = gp.id
        ), '[]'::jsonb),
        'teams', coalesce((
          select jsonb_agg(jsonb_build_object(
            'team',      spt.team,
            'score',     spt.score,
            'is_winner', spt.is_winner
          ) order by spt.team)
          from public.session_play_teams spt
          where spt.play_id = gp.id
        ), '[]'::jsonb)
      ) as play
    from public.session_game_plays gp
    join public.profiles rp on rp.id = gp.recorded_by
    where gp.session_id = p_session_id
      and gp.status = 'submitted'
  ) t;
$$;

revoke all on function public.get_public_session_plays(uuid) from public;
grant execute on function public.get_public_session_plays(uuid) to anon, authenticated;

comment on function public.get_public_session_plays(uuid) is
  'Anon-readable submitted game results for a session (plays + scores + teams, with players'' public display fields nested in). No private data, no profile-page path. See migration 0063.';
