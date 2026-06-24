-- ============================================================================
-- BG Session — migration 0055: random placeholder nickname, never the real name
--
-- handle_new_user() (0045) seeded a new profile's display_name from the Google
-- sign-in's real name (full_name / name). Combined with nickname being NULL until
-- onboarding, that meant a brand-new Google user was identified by their REAL NAME
-- everywhere display_name is a fallback — including, before this, public surfaces.
--
-- New behaviour: every fresh signup gets a random, unique placeholder nickname
-- (e.g. "player-3f9a1c7b2d"), and display_name is set to that same handle. The
-- real name is never persisted at all. The user can pick a proper nickname during
-- onboarding. The Google avatar_url is still stored — it's used inside the app —
-- but public previews never render it (see 0054).
--
-- Also backfills existing not-yet-onboarded profiles (nickname null/blank) so any
-- real name already sitting in display_name is scrubbed to a random handle.
-- Re-runnable.
-- ============================================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick text;
begin
  -- A random, unique handle — never the real name from raw_user_meta_data. The
  -- loop guards against the (astronomically unlikely) collision with the
  -- case-insensitive unique index from 0024.
  loop
    v_nick := 'player-' || substr(md5(random()::text || clock_timestamp()::text || new.id::text), 1, 10);
    exit when not exists (select 1 from public.profiles where lower(nickname) = v_nick);
  end loop;

  insert into public.profiles (id, nickname, display_name, avatar_url)
  values (
    new.id,
    v_nick,
    v_nick,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Trigger-only function: no EXECUTE grant needed (see 0034). Revoke to match.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Backfill: scrub the real name from anyone who signed up but hasn't onboarded
-- (nickname still null/blank → display_name may hold a Google real name). One
-- random handle per row, set into both columns. Onboarded users (nickname set)
-- are left untouched. The subquery computes the handle once so the two columns
-- match.
-- ---------------------------------------------------------------------------
update public.profiles p
set nickname = g.nick,
    display_name = g.nick
from (
  select id, 'player-' || substr(md5(random()::text || id::text), 1, 10) as nick
  from public.profiles
  where nickname is null or btrim(nickname) = ''
) g
where p.id = g.id;
