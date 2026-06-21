-- ============================================================================
-- BG Session — migration 0036: follow-up to 0034 (revoke anon explicitly)
--
-- After 0034 the Security Advisor still flagged "Public Can Execute" on our RPC
-- and RLS-helper functions. Reason: Supabase's default privileges grant EXECUTE
-- on new public functions to `anon` (and `authenticated`) EXPLICITLY — not just
-- via PUBLIC. So `REVOKE ... FROM PUBLIC` (as 0034 did for these) left anon's
-- own grant intact, and anon (= unauthenticated) could still call them.
--
-- Fix: revoke from `anon` explicitly on every RPC/RLS-helper. The grant to
-- `authenticated` from 0034 stays (those functions MUST be callable by logged-in
-- users and all verify auth.uid() internally) — so the "Signed-In Users Can
-- Execute" advisor entries for them are expected and acceptable.
--
-- Also handles two trigger functions from 0028 that 0034 missed
-- (enforce_cohost_edit_sessions / _series) — revoke from everyone like the other
-- trigger-only functions.
--
-- Re-runnable (REVOKE is idempotent).
-- ============================================================================

-- 1) RPC + RLS-helper functions: drop anon (and PUBLIC, redundantly) access.
--    `authenticated` (+ service_role) keep their 0034 grant.
revoke execute on function public.is_session_participant(uuid)               from anon, public;
revoke execute on function public.shares_confirmed_session(uuid)             from anon, public;
revoke execute on function public.touch_last_seen()                          from anon, public;
revoke execute on function public.user_session_history(uuid)                 from anon, public;
revoke execute on function public.roll_weekly_sessions()                     from anon, public;
revoke execute on function public.cancel_understaffed_sessions()             from anon, public;
revoke execute on function public.enqueue_rating_reminders()                 from anon, public;
revoke execute on function public.enqueue_session_reminders()                from anon, public;
revoke execute on function public.cancel_session(uuid)                       from anon, public;
revoke execute on function public.add_weekly_cohost(uuid, uuid)              from anon, public;
revoke execute on function public.remove_weekly_cohost(uuid, uuid)           from anon, public;
revoke execute on function public.step_down_cohost(uuid)                     from anon, public;

-- 2) Trigger-only functions from 0028 that 0034 missed. Triggers fire with the
--    table owner's rights, so no role needs EXECUTE.
revoke execute on function public.enforce_cohost_edit_sessions() from public, anon, authenticated;
revoke execute on function public.enforce_cohost_edit_series()   from public, anon, authenticated;
