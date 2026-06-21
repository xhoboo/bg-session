-- ============================================================================
-- BG Session — migration 0034: harden function privileges (defense-in-depth)
--
-- Addresses the Supabase Security Advisor warnings (all low-severity, 0 errors):
--   * "Function Search Path Mutable" — a few invoker (non-DEFINER) functions
--     didn't pin search_path.
--   * "Public/Signed-in Can Execute SECURITY DEFINER" — every function was
--     EXECUTE-able by PUBLIC (which includes the `anon`, i.e. NOT-logged-in,
--     role). Because the anon key is shipped in the frontend, anyone could call
--     mutating maintenance RPCs (roll_weekly_sessions, cancel_understaffed_
--     sessions) without signing in. They're idempotent/low-harm, but there's no
--     reason to leave them open.
--
-- Strategy: REVOKE EXECUTE FROM PUBLIC on our functions, then GRANT only to the
-- roles that legitimately call them.
--   - Trigger-only functions need NO grant: triggers fire with the table
--     owner's rights and Postgres does not check EXECUTE for trigger invocation.
--   - RLS-helper + frontend-RPC functions are GRANTed to `authenticated` (and
--     `service_role` for backend/admin use). This drops `anon` access.
--   - pg_cron (0033) runs roll/cancel maintenance as the function OWNER, so it
--     is unaffected by the PUBLIC revoke.
--
-- This migration is re-runnable (REVOKE/GRANT are idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Pin search_path on the invoker (non-SECURITY DEFINER) functions that the
--    advisor flagged. (All SECURITY DEFINER functions already set it.)
-- ---------------------------------------------------------------------------
alter function public.touch_updated_at()                                   set search_path = public;
alter function public.enforce_rating_immutable()                           set search_path = public;
alter function public.next_weekly_occurrence(int, time, timestamptz)       set search_path = public;

-- ---------------------------------------------------------------------------
-- 2) Trigger-only SECURITY DEFINER functions: revoke from everyone. They keep
--    firing as triggers (EXECUTE is not checked for trigger invocation); no
--    one should ever call them directly.
-- ---------------------------------------------------------------------------
revoke execute on function public.handle_new_user()              from public, anon, authenticated;
revoke execute on function public.set_request_status_on_insert() from public, anon, authenticated;
revoke execute on function public.notify_on_request_insert()     from public, anon, authenticated;
revoke execute on function public.notify_on_request_update()     from public, anon, authenticated;
revoke execute on function public.sync_confirmed_count()         from public, anon, authenticated;
revoke execute on function public.enforce_capacity_on_approve()  from public, anon, authenticated;
revoke execute on function public.enforce_session_limits()       from public, anon, authenticated;
revoke execute on function public.send_notification_email()      from public, anon, authenticated;
-- The two invoker trigger functions, too:
revoke execute on function public.touch_updated_at()             from public, anon, authenticated;
revoke execute on function public.enforce_rating_immutable()     from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) RLS-helper functions: used inside RLS policies, so the querying role needs
--    EXECUTE. Revoke the blanket PUBLIC grant, keep `authenticated`.
-- ---------------------------------------------------------------------------
revoke execute on function public.is_session_participant(uuid) from public;
revoke execute on function public.shares_confirmed_session(uuid) from public;
grant  execute on function public.is_session_participant(uuid) to authenticated, service_role;
grant  execute on function public.shares_confirmed_session(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Frontend RPCs (supabase.rpc(...)). All require a logged-in user (they read
--    auth.uid() or only act on the caller), so they go to `authenticated` only
--    — never `anon`. service_role kept for backend/admin.
-- ---------------------------------------------------------------------------
revoke execute on function public.touch_last_seen()                          from public;
revoke execute on function public.user_session_history(uuid)                 from public;
revoke execute on function public.roll_weekly_sessions()                     from public;
revoke execute on function public.cancel_understaffed_sessions()             from public;
revoke execute on function public.enqueue_rating_reminders()                 from public;
revoke execute on function public.enqueue_session_reminders()                from public;
revoke execute on function public.cancel_session(uuid)                       from public;
revoke execute on function public.add_weekly_cohost(uuid, uuid)              from public;
revoke execute on function public.remove_weekly_cohost(uuid, uuid)           from public;
revoke execute on function public.step_down_cohost(uuid)                     from public;
-- next_weekly_occurrence is only ever called inside roll_weekly_sessions (which
-- runs as owner), so it needs no role grant.
revoke execute on function public.next_weekly_occurrence(int, time, timestamptz) from public, anon, authenticated;

grant  execute on function public.touch_last_seen()              to authenticated, service_role;
grant  execute on function public.user_session_history(uuid)     to authenticated, service_role;
grant  execute on function public.roll_weekly_sessions()         to authenticated, service_role;
grant  execute on function public.cancel_understaffed_sessions() to authenticated, service_role;
grant  execute on function public.enqueue_rating_reminders()     to authenticated, service_role;
grant  execute on function public.enqueue_session_reminders()    to authenticated, service_role;
grant  execute on function public.cancel_session(uuid)           to authenticated, service_role;
grant  execute on function public.add_weekly_cohost(uuid, uuid)  to authenticated, service_role;
grant  execute on function public.remove_weekly_cohost(uuid, uuid) to authenticated, service_role;
grant  execute on function public.step_down_cohost(uuid)         to authenticated, service_role;
