-- ============================================================================
-- BG Session — migration 0059: prune the in-app notification inbox
--
-- Notifications only ever accumulate — nothing deleted old rows, so a long-lived
-- account's inbox grows without bound. We keep it small two ways, both enforced
-- in the database so the client can't drift:
--
--   * age cap   — anything older than 7 days is dropped.
--   * count cap — only the newest 50 per user are kept; older ones fall off.
--
-- An AFTER INSERT trigger prunes the affected user each time a notification is
-- written (notifications are inserted by SECURITY DEFINER triggers elsewhere, so
-- this fires on every new row). The function is SECURITY DEFINER so it can delete
-- across the table regardless of the caller's RLS visibility. Re-runnable.
-- ============================================================================

create or replace function prune_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Age cap: drop this user's notifications older than a week.
  delete from notifications
  where user_id = new.user_id
    and created_at < now() - interval '7 days';

  -- Count cap: keep only the 50 newest for this user, dropping the rest.
  delete from notifications
  where user_id = new.user_id
    and id not in (
      select id from notifications
      where user_id = new.user_id
      order by created_at desc
      limit 50
    );

  return new;
end;
$$;

drop trigger if exists trg_prune_notifications on notifications;
create trigger trg_prune_notifications
  after insert on notifications
  for each row execute function prune_notifications();

-- ---------------------------------------------------------------------------
-- One-time cleanup of the backlog this trigger would otherwise only catch on
-- the user's next notification.
-- ---------------------------------------------------------------------------
delete from notifications
where created_at < now() - interval '7 days';

delete from notifications n
where n.id not in (
  select id from (
    select id, row_number() over (partition by user_id order by created_at desc) as rn
    from notifications
  ) ranked
  where rn <= 50
);

-- ---------------------------------------------------------------------------
-- Privilege hygiene (see 0034/0036/0037/0052): the trigger function runs with
-- owner rights, so no client role needs EXECUTE.
-- ---------------------------------------------------------------------------
revoke execute on function public.prune_notifications() from public, anon, authenticated;
grant  execute on function public.prune_notifications() to service_role;
