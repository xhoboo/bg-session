-- ============================================================================
-- BG Session — migration 0063: reveal full reviewer name to guests
--
-- Migration 0062 masked the reviewer's nickname to its first letter (A*****)
-- in the anon ratings view. We now show the full public nickname instead, so a
-- guest reading a finished session's reviews sees who wrote them — the same
-- public display name a signed-in member sees. Still no user id and no avatar:
-- there's no link back to a profile from the guest page.
--
-- The column is renamed masked_name -> reviewer_name to match. Renaming an OUT
-- column changes the function's result type, which `create or replace` can't do,
-- so we DROP then CREATE.
-- ============================================================================

drop function if exists public.get_public_session_ratings(uuid);

create function public.get_public_session_ratings(p_session_id uuid)
returns table (
  rating        int,
  review        text,
  reviewer_name text,
  created_at    timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    r.rating,
    r.review,
    coalesce(nullif(trim(p.nickname), ''), nullif(trim(p.display_name), ''), 'Player') as reviewer_name,
    r.created_at
  from public.session_ratings r
  join public.profiles p on p.id = r.user_id
  where r.session_id = p_session_id
  order by r.created_at desc;
$$;

revoke all on function public.get_public_session_ratings(uuid) from public;
grant execute on function public.get_public_session_ratings(uuid) to anon, authenticated;

comment on function public.get_public_session_ratings(uuid) is
  'Anon-readable ratings/reviews for a session with the reviewer''s full public nickname (no user id, no avatar). Supersedes the name-masking from migration 0062. See migration 0063.';
