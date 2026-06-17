-- ============================================================================
-- BG Session — migration 0007: session ratings & reviews
--
-- After a session has happened, every participant (host + approved guests) is
-- expected to rate it 1–10 stars and may optionally leave a review. Ratings are
-- visible to the session's participants.
-- ============================================================================

create table if not exists session_ratings (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  rating     int  not null check (rating between 1 and 10),
  review     text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists session_ratings_session_idx on session_ratings (session_id);

alter table session_ratings enable row level security;

-- Is the current user a participant (host or approved guest) of this session?
create or replace function is_session_participant(sid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from sessions s where s.id = sid and s.host_id = auth.uid())
      or exists (select 1 from join_requests j
                 where j.session_id = sid and j.guest_id = auth.uid() and j.status = 'approved');
$$;

drop policy if exists "ratings_select_participants" on session_ratings;
drop policy if exists "ratings_insert_self" on session_ratings;
drop policy if exists "ratings_update_self" on session_ratings;
drop policy if exists "ratings_delete_self" on session_ratings;

-- Participants can read all ratings/reviews of sessions they took part in.
create policy "ratings_select_participants"
  on session_ratings for select to authenticated
  using (is_session_participant(session_id));

-- You may rate only your own row, only as a participant, and only after the
-- session's start time has passed.
create policy "ratings_insert_self"
  on session_ratings for insert to authenticated
  with check (
    user_id = auth.uid()
    and is_session_participant(session_id)
    and exists (select 1 from sessions s where s.id = session_id and s.starts_at < now())
  );

create policy "ratings_update_self"
  on session_ratings for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "ratings_delete_self"
  on session_ratings for delete to authenticated
  using (user_id = auth.uid());

drop trigger if exists trg_ratings_touch on session_ratings;
create trigger trg_ratings_touch
  before update on session_ratings
  for each row execute function touch_updated_at();
