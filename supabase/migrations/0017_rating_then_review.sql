-- ============================================================================
-- BG Session — migration 0017: rating is permanent, review can be added later
--
-- Refines 0015. A participant's RATING is still immutable, but their REVIEW is a
-- separate step they can add AFTER rating (rate now, review later) — and only
-- once. So we re-allow the owner to UPDATE their own row, and use a BEFORE
-- UPDATE trigger to forbid changing the rating and to forbid editing/removing a
-- review once written (empty -> text is allowed; text -> anything is not).
--
-- Run this whether or not 0015 was applied — it drops the old full-update and
-- delete policies and installs the controlled ones either way.
-- ============================================================================

drop policy if exists "ratings_update_self" on session_ratings;
drop policy if exists "ratings_update_own_review" on session_ratings;
drop policy if exists "ratings_delete_self" on session_ratings;

create policy "ratings_update_own_review"
  on session_ratings for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function enforce_rating_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.rating is distinct from old.rating then
    raise exception 'A rating cannot be changed once submitted.';
  end if;
  -- A review can be added once (empty -> text) but never edited or removed.
  if coalesce(old.review, '') <> '' and coalesce(new.review, '') <> coalesce(old.review, '') then
    raise exception 'A review cannot be changed once submitted.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rating_immutable on session_ratings;
create trigger trg_rating_immutable
  before update on session_ratings
  for each row execute function enforce_rating_immutable();
