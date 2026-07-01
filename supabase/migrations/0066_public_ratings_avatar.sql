-- ============================================================================
-- BG Session — migration 0066: expose reviewer avatar to guests
--
-- Migration 0063 revealed the reviewer's full public nickname to guests but
-- still withheld the avatar. We now also return avatar_url so the guest Reviews
-- list can show each reviewer's photo (initials fallback when null) beside the
-- name — matching the avatars already shown in the guest Game Scores, which
-- expose the same public field via get_public_session_plays (migration 0063).
-- Still no user id: there's no link back to a profile from the guest page.
--
-- Adding an OUT column changes the function's result type, which
-- `create or replace` can't do, so we DROP then CREATE.
-- ============================================================================

drop function if exists public.get_public_session_ratings(uuid);

create function public.get_public_session_ratings(p_session_id uuid)
returns table (
  rating        int,
  review        text,
  reviewer_name text,
  avatar_url    text,
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
    p.avatar_url,
    r.created_at
  from public.session_ratings r
  join public.profiles p on p.id = r.user_id
  where r.session_id = p_session_id
  order by r.created_at desc;
$$;

revoke all on function public.get_public_session_ratings(uuid) from public;
grant execute on function public.get_public_session_ratings(uuid) to anon, authenticated;

comment on function public.get_public_session_ratings(uuid) is
  'Anon-readable ratings/reviews for a session with the reviewer''s full public nickname and avatar (no user id). Adds avatar_url to migration 0063. See migration 0066.';
