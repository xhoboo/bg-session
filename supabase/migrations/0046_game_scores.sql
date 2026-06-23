-- ============================================================================
-- BG Session — migration 0046: in-session board-game scores
--
-- During a session, any participant can record the result of a game that was
-- played from the session's line-up (the host's board_games ∪ the games people
-- pledged to bring in session_brought_games). A "play" is one sitting of one
-- game; a game can be played more than once (each replay is its own play).
--
-- Concurrency rules (decided with the user):
--   * One game can't be recorded by two people at once. A play starts as a
--     `draft` (the recorder is filling in the form); a partial unique index
--     allows only ONE live draft per game per session, so a second person sees
--     the game as "being recorded". Drafts auto-expire after 15 minutes (cron
--     sweep + opportunistic cleanup in start_game_play) so an abandoned form
--     never locks a game forever.
--   * A player who was just scored in one game can't be added to another within
--     45 minutes — board games take a while, so this stops bogus rapid-fire
--     double entries. Enforced at submit time against other SUBMITTED plays.
--
-- Timing:
--   * Scoring opens when the session starts and closes 1 hour after it finishes
--     (start + duration + 1h). After that nothing can be recorded or cancelled.
--   * A submitted play is permanent like a rating, except the person who
--     recorded it can cancel (delete) it within 30 minutes — a safety net for a
--     mis-entry. Cancelling deletes the rows, which also clears the 45-minute
--     cooldown those players were under.
--
-- Score modes (the recorder picks one per play, in the form — not stored on the
-- game itself):
--   individual_score   — each player has a score; high (or low, if lowest_wins)
--                        score wins. Winners derived from the scores.
--   team_score         — players split into Team A/B/…; a team's score is the
--                        sum of its members' individual scores when those are
--                        entered, otherwise a manual per-team score. Highest (or
--                        lowest) team total wins.
--   individual_winloss — exactly one winner is chosen; per-player score optional.
--   team_winloss       — exactly one winning team is chosen; per-team score
--                        optional (no individual breakdown).
--   cooperative        — everyone vs. the game: a single won/lost outcome; each
--                        player's score is optional.
--
-- Visibility: scores are PUBLIC. They feed a player's public session history, so
-- anyone signed in can read them (mirrors `sessions` being world-readable).
-- Writes go only through the SECURITY DEFINER RPCs below, so there are no
-- INSERT/UPDATE/DELETE policies on these tables.
-- ============================================================================

create type game_score_mode as enum (
  'individual_score',
  'team_score',
  'individual_winloss',
  'team_winloss',
  'cooperative'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One play = one sitting of one game in a session.
create table if not exists session_game_plays (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions (id) on delete cascade,
  game_name    text not null check (char_length(game_name) between 1 and 80),
  mode         game_score_mode,                 -- null while drafting; set at submit
  lowest_wins  boolean not null default false,  -- only meaningful for *_score modes
  coop_won     boolean,                          -- cooperative only: true=won, false=lost
  recorded_by  uuid not null references profiles (id) on delete cascade,
  status       text not null default 'draft' check (status in ('draft', 'submitted')),
  created_at   timestamptz not null default now(),
  submitted_at timestamptz,
  expires_at   timestamptz                       -- draft auto-expiry (created + 15 min)
);

create index if not exists sgp_session_idx on session_game_plays (session_id);

-- At most one LIVE draft per game per session — this is the "being recorded" lock.
-- Submitted plays are exempt, so a game can be replayed any number of times.
create unique index if not exists sgp_one_draft_per_game
  on session_game_plays (session_id, lower(game_name))
  where status = 'draft';

-- Per-player line in a play.
create table if not exists session_play_scores (
  id        uuid primary key default gen_random_uuid(),
  play_id   uuid not null references session_game_plays (id) on delete cascade,
  user_id   uuid not null references profiles (id) on delete cascade,
  score     int,                                  -- null = no score (winloss/coop optional)
  is_winner boolean not null default false,       -- individual modes; derived for scores
  team      int,                                  -- 1=Team A, 2=Team B, … (team modes only)
  unique (play_id, user_id)
);

create index if not exists sps_play_idx on session_play_scores (play_id);
create index if not exists sps_user_idx on session_play_scores (user_id);

-- Per-team line in a play (team modes only).
create table if not exists session_play_teams (
  id        uuid primary key default gen_random_uuid(),
  play_id   uuid not null references session_game_plays (id) on delete cascade,
  team      int  not null,
  score     int,
  is_winner boolean not null default false,
  unique (play_id, team)
);

create index if not exists spt_play_idx on session_play_teams (play_id);

-- ---------------------------------------------------------------------------
-- RLS — public read; all writes go through the RPCs below.
-- ---------------------------------------------------------------------------
alter table session_game_plays  enable row level security;
alter table session_play_scores enable row level security;
alter table session_play_teams  enable row level security;

drop policy if exists "plays_select_all"  on session_game_plays;
drop policy if exists "scores_select_all" on session_play_scores;
drop policy if exists "teams_select_all"  on session_play_teams;

create policy "plays_select_all"  on session_game_plays  for select to authenticated using (true);
create policy "scores_select_all" on session_play_scores for select to authenticated using (true);
create policy "teams_select_all"  on session_play_teams  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Helper: the set of game names that may be scored for a session
-- (host's comma-separated board_games ∪ the games participants pledged to bring).
-- ---------------------------------------------------------------------------
create or replace function session_available_games(sid uuid)
returns table (name text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct trim(g) as name
  from regexp_split_to_table(
    coalesce((select board_games from sessions where id = sid), ''), ','
  ) as g
  where trim(g) <> ''
  union
  select game_name from session_brought_games where session_id = sid;
$$;

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

  -- 45-minute cooldown: no player may already be in another submitted play that
  -- was recorded less than 45 minutes ago.
  if exists (
    select 1
    from session_play_scores ps
    join session_play_scores ps2 on ps2.user_id = ps.user_id
    join session_game_plays gp on gp.id = ps2.play_id
    where ps.play_id = p_play_id
      and gp.id <> p_play_id
      and gp.session_id = v_session
      and gp.status = 'submitted'
      and gp.submitted_at > now() - interval '45 minutes'
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

-- ---------------------------------------------------------------------------
-- delete_game_play — discard a draft, or cancel a submitted play within 30 min.
-- Cancelling removes the rows, which also lifts the players' 45-min cooldown.
-- ---------------------------------------------------------------------------
create or replace function delete_game_play(p_play_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_rec    uuid;
  v_status text;
  v_sub    timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  select recorded_by, status, submitted_at into v_rec, v_status, v_sub
  from session_game_plays where id = p_play_id;
  if not found then
    raise exception 'Play not found';
  end if;
  if v_rec <> v_uid then
    raise exception 'Only the person who recorded this can remove it';
  end if;
  if v_status = 'submitted' and now() > v_sub + interval '30 minutes' then
    raise exception 'The 30-minute window to cancel this result has passed';
  end if;

  delete from session_game_plays where id = p_play_id;  -- cascade clears scores/teams
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants — drop the blanket PUBLIC execute (see 0034) and grant only the roles
-- that should call these. All require a logged-in user.
-- ---------------------------------------------------------------------------
revoke execute on function session_available_games(uuid)                       from public, anon, authenticated;
revoke execute on function start_game_play(uuid, text)                         from public;
revoke execute on function submit_game_play(uuid, game_score_mode, boolean, boolean, jsonb, jsonb) from public;
revoke execute on function delete_game_play(uuid)                              from public;

-- session_available_games is a SECURITY DEFINER helper that reads the
-- participant-only session_brought_games. It's only ever called from inside the
-- RPCs below (which run as the owner, so the inner call is allowed) — never
-- grant it to `authenticated`, or it would leak brought-game names to non-
-- participants. service_role is fine for admin/debug.
grant  execute on function session_available_games(uuid)                       to service_role;
grant  execute on function start_game_play(uuid, text)                         to authenticated, service_role;
grant  execute on function submit_game_play(uuid, game_score_mode, boolean, boolean, jsonb, jsonb) to authenticated, service_role;
grant  execute on function delete_game_play(uuid)                              to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Scheduled cleanup: sweep expired drafts every 5 minutes (backstop to the
-- opportunistic cleanup in start_game_play). cron.schedule upserts by name.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'expire-game-play-drafts',
  '*/5 * * * *',
  $$delete from public.session_game_plays where status = 'draft' and expires_at < now()$$
);

-- ---------------------------------------------------------------------------
-- Realtime: stream play changes so the score page sees another participant's
-- "being recorded" lock appear (and new results land) without a manual refresh.
-- Wrapped so re-running the migration doesn't error if the table is already in
-- the publication.
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table session_game_plays;
exception
  when duplicate_object then null;
end $$;
