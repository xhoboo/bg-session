-- ============================================================================
-- BG Session — migration 0045: guarantee a profiles row exists for every user
--
-- Signups were failing at onboarding with:
--   insert or update on table "profile_private" violates foreign key
--   constraint "profile_private_id_fkey"
--
-- profile_private.id references profiles(id), so a profile_private row can only
-- be written once the matching profiles row exists. That row is supposed to be
-- created by the on_auth_user_created trigger (0001). When the trigger isn't in
-- place, a brand-new user reaches onboarding with NO profiles row: the
-- onboarding `profiles` UPDATE matches 0 rows (no error), and the subsequent
-- `profile_private` upsert is the first statement to hit the missing parent —
-- producing the FK error above.
--
-- This migration makes the invariant hold three ways:
--   1) Recreate the trigger + function so it is guaranteed present going forward.
--   2) Backfill profiles for any existing auth users that are missing one,
--      unblocking accounts already stuck at onboarding.
--   3) Add an INSERT policy on profiles so the client can self-heal the row
--      during onboarding even if the trigger ever stops firing again.
--
-- Re-runnable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Recreate the new-user trigger (idempotent; same body as 0001)
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
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
-- 2) Backfill any auth users that have no profiles row yet
-- ---------------------------------------------------------------------------
insert into public.profiles (id, display_name, avatar_url)
select
  u.id,
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    split_part(u.email, '@', 1)
  ),
  u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ---------------------------------------------------------------------------
-- 3) Let a user create their OWN profiles row (safety net for onboarding).
--    Mirrors the existing profiles_update_own check. SELECT/UPDATE policies
--    are unchanged.
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own"
  on profiles for insert
  to authenticated
  with check (id = auth.uid());
