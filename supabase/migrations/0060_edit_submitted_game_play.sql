-- ============================================================================
-- BG Session — migration 0060: allow editing a submitted game result
--
-- Until now a submitted play was final except for the recorder's 30-minute
-- discard window (delete_game_play). This lets the recorder also *edit* a result
-- within the same 30-minute window — fixing a wrong score, a missed player, the
-- wrong mode — instead of having to discard and re-record (which the per-game
-- cooldown would block for 30 minutes anyway).
--
-- Implemented by relaxing submit_game_play's status guard: it already wipes and
-- re-inserts all scores/teams and re-runs every validation, and its final UPDATE
-- sets submitted_at = now(). So re-submitting an existing play *is* an edit, and
-- bumping submitted_at resets both the edit and the discard window — i.e. the
-- Edit/Discard buttons live for 30 minutes after the last change. The only new
-- thing is permitting status = 'submitted' (by its recorder, within 30 min) to
-- reach the body; everything else is reproduced verbatim from 0053.
--
-- The per-game cooldown and the per-player cooldown both already exclude the
-- play being submitted (gp.id <> p_play_id), so editing a result never trips its
-- own cooldown.
--
-- create-or-replace keeps the existing grants from 0046/0056.
-- ============================================================================

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
  v_sub       timestamptz;
  v_starts    timestamptz;
  v_dur       int;
  v_count     int;
  v_teams     int[];
  v_all_scored boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Load + row-lock the play so two writes can't race.
  select session_id, recorded_by, status, game_name, submitted_at
    into v_session, v_recorder, v_status, v_game, v_sub
  from session_game_plays where id = p_play_id for update;

  if not found then
    raise exception 'This recording was not found — it may have expired';
  end if;
  if v_recorder <> v_uid then
    raise exception 'Only the person recording this game can submit it';
  end if;
  -- A draft is being finalized for the first time; a submitted play is being
  -- edited by its recorder, allowed only inside the 30-minute window.
  if v_status = 'submitted' then
    if now() > v_sub + interval '30 minutes' then
      raise exception 'The 30-minute window to edit this result has passed';
    end if;
  elsif v_status <> 'draft' then
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

  -- Wipe any partial rows (defensive for a draft; for an edit this clears the
  -- previous result) and re-insert.
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

  -- Finalize. submitted_at = now() resets the edit/discard window on every save.
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
