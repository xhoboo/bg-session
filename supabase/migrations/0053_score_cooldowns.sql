-- ============================================================================
-- BG Session — migration 0053: retune score cooldowns
--
-- Two changes to the in-session scoring rules from 0046:
--
--   1. Player cooldown 45m -> 30m. A player who was just scored in one game still
--      can't be added to another for a while (stops rapid-fire double entries), but
--      the window is now 30 minutes.
--
--   2. NEW per-game cooldown (30m). After a game's result is submitted, that same
--      game can't be scored again in the session for 30 minutes. Previously a game
--      could be replayed and re-recorded immediately (the only guard was the live
--      draft lock); this stops accidental/duplicate re-entries of the same game.
--
-- Enforced in start_game_play (so the recording form won't even open for a game on
-- cooldown) and re-checked in submit_game_play (authoritative). Cancelling a result
-- within its 30-minute window deletes the rows, which lifts both cooldowns.
--
-- Both functions are replaced wholesale (create or replace keeps their grants).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- start_game_play — claim a game for recording (creates the draft lock).
-- ---------------------------------------------------------------------------
create or replace function start_game_play(p_session_id uuid, p_game_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_starts timestamptz;
  v_dur    int;
  v_id     uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not is_session_participant(p_session_id) then
    raise exception 'Only participants can record scores';
  end if;

  select starts_at, coalesce(duration_minutes, 180) into v_starts, v_dur
  from sessions where id = p_session_id;
  if v_starts is null then
    raise exception 'Session not found';
  end if;
  if v_starts > now() then
    raise exception 'Scoring opens once the session has started';
  end if;
  if v_starts + make_interval(mins => v_dur) + interval '1 hour' < now() then
    raise exception 'Scoring for this session is closed';
  end if;

  if not exists (
    select 1 from session_available_games(p_session_id) a
    where lower(a.name) = lower(trim(p_game_name))
  ) then
    raise exception 'That game is not on this session''s list';
  end if;

  -- 30-minute per-game cooldown: a game can't be re-scored until 30 minutes after
  -- its most recent submitted play in this session.
  if exists (
    select 1 from session_game_plays
    where session_id = p_session_id
      and status = 'submitted'
      and lower(game_name) = lower(trim(p_game_name))
      and submitted_at > now() - interval '30 minutes'
  ) then
    raise exception 'This game was just scored — give it 30 minutes before recording it again';
  end if;

  -- Clear any expired draft for this game so a stale lock doesn't block a fresh
  -- recording between cron sweeps.
  delete from session_game_plays
  where session_id = p_session_id and status = 'draft'
    and lower(game_name) = lower(trim(p_game_name)) and expires_at < now();

  insert into session_game_plays (session_id, game_name, recorded_by, status, expires_at)
  values (p_session_id, trim(p_game_name), v_uid, 'draft', now() + interval '15 minutes')
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Someone is already recording this game right now';
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_game_play — validate the form and finalize a draft into a result.
--
-- p_players : jsonb array of {user_id, score?, is_winner?, team?}
-- p_teams   : jsonb array of {team, score?, is_winner?}  (team modes only)
-- ---------------------------------------------------------------------------
create or replace function submit_game_play(
  p_play_id     uuid,
  p_mode        game_score_mode,
  p_lowest_wins boolean,
  p_coop_won    boolean,
  p_players     jsonb,
  p_teams       jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_session   uuid;
  v_recorder  uuid;
  v_status    text;
  v_game      text;
  v_starts    timestamptz;
  v_dur       int;
  v_count     int;
  v_teams     int[];
  v_all_scored boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Load + row-lock the draft so two submits can't race.
  select session_id, recorded_by, status, game_name
    into v_session, v_recorder, v_status, v_game
  from session_game_plays where id = p_play_id for update;

  if not found then
    raise exception 'This recording was not found — it may have expired';
  end if;
  if v_recorder <> v_uid then
    raise exception 'Only the person recording this game can submit it';
  end if;
  if v_status <> 'draft' then
    raise exception 'This game has already been recorded';
  end if;

  -- Scoring window (same bounds as start_game_play).
  select starts_at, coalesce(duration_minutes, 180) into v_starts, v_dur
  from sessions where id = v_session;
  if v_starts > now() then
    raise exception 'Scoring opens once the session has started';
  end if;
  if v_starts + make_interval(mins => v_dur) + interval '1 hour' < now() then
    raise exception 'Scoring for this session is closed';
  end if;
  if not is_session_participant(v_session) then
    raise exception 'Only participants can record scores';
  end if;

  -- 30-minute per-game cooldown (authoritative re-check of the start_game_play
  -- guard): block this submit if the same game was submitted in this session less
  -- than 30 minutes ago.
  if exists (
    select 1 from session_game_plays gp
    where gp.session_id = v_session
      and gp.id <> p_play_id
      and gp.status = 'submitted'
      and lower(gp.game_name) = lower(v_game)
      and gp.submitted_at > now() - interval '30 minutes'
  ) then
    raise exception 'This game was just scored — give it 30 minutes before recording it again';
  end if;

  -- Wipe any partial rows (defensive; a draft normally has none) and re-insert.
  delete from session_play_scores where play_id = p_play_id;
  delete from session_play_teams  where play_id = p_play_id;

  -- Players. is_winner is taken from the client only for individual_winloss;
  -- for score modes it's recomputed below, and for team/coop it lives elsewhere.
  insert into session_play_scores (play_id, user_id, score, is_winner, team)
  select
    p_play_id,
    (e ->> 'user_id')::uuid,
    nullif(e ->> 'score', '')::int,
    case when p_mode = 'individual_winloss'
         then coalesce((e ->> 'is_winner')::boolean, false) else false end,
    case when p_mode in ('team_score', 'team_winloss')
         then nullif(e ->> 'team', '')::int else null end
  from jsonb_array_elements(p_players) e;

  select count(*) into v_count from session_play_scores where play_id = p_play_id;
  if p_mode = 'cooperative' then
    if v_count < 1 then raise exception 'Add at least one player'; end if;
  elsif v_count < 2 then
    raise exception 'Add at least two players';
  end if;

  -- Every player must be a confirmed participant of this session.
  if exists (
    select 1 from session_play_scores ps
    where ps.play_id = p_play_id
      and not (
        exists (select 1 from sessions s where s.id = v_session and s.host_id = ps.user_id)
        or exists (select 1 from join_requests j
                   where j.session_id = v_session and j.guest_id = ps.user_id and j.status = 'approved')
      )
  ) then
    raise exception 'Everyone you score has to be a participant of this session';
  end if;

  -- 30-minute player cooldown: no player may already be in another submitted play
  -- that was recorded less than 30 minutes ago.
  if exists (
    select 1
    from session_play_scores ps
    join session_play_scores ps2 on ps2.user_id = ps.user_id
    join session_game_plays gp on gp.id = ps2.play_id
    where ps.play_id = p_play_id
      and gp.id <> p_play_id
      and gp.session_id = v_session
      and gp.status = 'submitted'
      and gp.submitted_at > now() - interval '30 minutes'
  ) then
    raise exception 'A player was just scored in another game — give it a little while before adding them to another';
  end if;

  -- Mode-specific validation -------------------------------------------------
  if p_mode = 'individual_score' then
    if exists (select 1 from session_play_scores where play_id = p_play_id and score is null) then
      raise exception 'Enter a score for every player';
    end if;
    -- Winner(s) = the best score (ties share the win). lowest_wins flips it.
    update session_play_scores ps
    set is_winner = (ps.score = (
      select case when p_lowest_wins then min(score) else max(score) end
      from session_play_scores where play_id = p_play_id))
    where ps.play_id = p_play_id;

  elsif p_mode = 'individual_winloss' then
    if (select count(*) from session_play_scores where play_id = p_play_id and is_winner) <> 1 then
      raise exception 'Pick exactly one winner';
    end if;

  elsif p_mode = 'cooperative' then
    if p_coop_won is null then
      raise exception 'Mark whether the table won or lost';
    end if;

  elsif p_mode in ('team_score', 'team_winloss') then
    -- Teams must be numbered consecutively from 1 (Team A, B, C…), at least two,
    -- and every player must be on a team.
    if exists (select 1 from session_play_scores where play_id = p_play_id and team is null) then
      raise exception 'Put every player on a team';
    end if;
    select array_agg(distinct team order by team) into v_teams
    from session_play_scores where play_id = p_play_id;
    if array_length(v_teams, 1) < 2 then
      raise exception 'Use at least two teams';
    end if;
    if v_teams <> (select array_agg(g) from generate_series(1, array_length(v_teams, 1)) g) then
      raise exception 'Teams must be numbered in order (A, then B, then C…)';
    end if;

    if p_mode = 'team_score' then
      -- Either every player has a score (team total = sum) or none do (manual
      -- per-team score required). Mixed entry isn't allowed.
      select count(*) filter (where score is null) = 0 into v_all_scored
      from session_play_scores where play_id = p_play_id;

      if v_all_scored then
        insert into session_play_teams (play_id, team, score)
        select p_play_id, team, sum(score)
        from session_play_scores where play_id = p_play_id group by team;
      else
        if exists (select 1 from session_play_scores where play_id = p_play_id and score is not null) then
          raise exception 'Enter individual scores for everyone, or leave them all blank and score by team';
        end if;
        insert into session_play_teams (play_id, team, score)
        select p_play_id, (e ->> 'team')::int, nullif(e ->> 'score', '')::int
        from jsonb_array_elements(p_teams) e;
        if (select count(distinct team) from session_play_teams where play_id = p_play_id)
             <> array_length(v_teams, 1)
           or exists (select 1 from session_play_teams where play_id = p_play_id and score is null) then
          raise exception 'Enter a score for each team';
        end if;
      end if;

      update session_play_teams tt
      set is_winner = (tt.score = (
        select case when p_lowest_wins then min(score) else max(score) end
        from session_play_teams where play_id = p_play_id))
      where tt.play_id = p_play_id;

    else  -- team_winloss
      insert into session_play_teams (play_id, team, score, is_winner)
      select p_play_id, (e ->> 'team')::int, nullif(e ->> 'score', '')::int,
             coalesce((e ->> 'is_winner')::boolean, false)
      from jsonb_array_elements(p_teams) e;
      if (select count(distinct team) from session_play_teams where play_id = p_play_id)
           <> array_length(v_teams, 1) then
        raise exception 'Every team needs a win/loss outcome';
      end if;
      if (select count(*) from session_play_teams where play_id = p_play_id and is_winner) <> 1 then
        raise exception 'Pick exactly one winning team';
      end if;
    end if;
  end if;

  -- Finalize.
  update session_game_plays
  set mode = p_mode,
      lowest_wins = coalesce(p_lowest_wins, false),
      coop_won = case when p_mode = 'cooperative' then p_coop_won else null end,
      status = 'submitted',
      submitted_at = now(),
      expires_at = null
  where id = p_play_id;

  return p_play_id;
end;
$$;
