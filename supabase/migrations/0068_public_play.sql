-- ============================================================================
-- BG Session — migration 0068: single-play public lookup (short share links)
--
-- The share-a-score link used to be /sessions/:sessionId/score/:playId — two
-- UUIDs, and the preview crawler had to make two calls (get_public_session_plays
-- for the play + get_session_preview for the title). A play id is globally
-- unique on its own, so the link is now just /score/:playId, and this ONE
-- SECURITY DEFINER function returns everything a page or link-preview needs from
-- that id alone:
--   - the owning session's id (for the "Back to Session" link) and title,
--   - the play's replay position among same-named plays in that session
--     (so a game played twice reads "Wingspan #2"),
--   - the play itself, shaped exactly like one element of
--     get_public_session_plays (migration 0063) so GameScoreCard renders it
--     unchanged.
-- Fewer round-trips also makes the crawler faster, so the rich preview lands
-- before chat apps time out.
--
-- Player names carry the same PUBLIC display fields as 0063 (nickname /
-- display_name / avatar_url) — no user enumeration beyond what a result card
-- already shows, and no path back to a profile from the guest UI. Only SUBMITTED
-- plays resolve; a draft/expired id returns null so the caller falls back to the
-- generic card.
-- ============================================================================

create or replace function public.get_public_play(p_play_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  with tgt as (
    select gp.session_id, gp.game_name
    from public.session_game_plays gp
    where gp.id = p_play_id and gp.status = 'submitted'
  ),
  sib as (
    -- Same-named plays in the session, oldest-first — mirrors groupPlaysByGame()
    -- in src/lib/format.js so the #N here matches the app's replay tag.
    select gp.id,
           row_number() over (order by gp.submitted_at, gp.id) as idx,
           count(*) over () as total
    from public.session_game_plays gp
    join tgt on gp.session_id = tgt.session_id
    where gp.status = 'submitted'
      and lower(gp.game_name) = lower(tgt.game_name)
  )
  select case when not exists (select 1 from tgt) then null else
    jsonb_build_object(
      'session_id',    (select session_id from tgt),
      'session_title', (select s.title from public.sessions s join tgt on s.id = tgt.session_id),
      'replay_index',  (select idx from sib where id = p_play_id),
      'replay_total',  (select total from sib limit 1),
      'play', (
        select jsonb_build_object(
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
        )
        from public.session_game_plays gp
        join public.profiles rp on rp.id = gp.recorded_by
        where gp.id = p_play_id
      )
    )
  end;
$$;

revoke all on function public.get_public_play(uuid) from public;
grant execute on function public.get_public_play(uuid) to anon, authenticated;

comment on function public.get_public_play(uuid) is
  'Anon-readable single play (by id) with its session id/title and replay position, shaped like one element of get_public_session_plays. Powers the short /score/:playId share link + its crawler preview. See migration 0068.';
