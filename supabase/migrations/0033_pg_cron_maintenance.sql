-- ============================================================================
-- BG Session — migration 0033: scheduled maintenance via pg_cron
--
-- Roll weekly sessions forward and clean up under-staffed one-time sessions on a
-- schedule, so these no longer depend on someone opening Browse. Both functions
-- are GLOBAL (they don't read auth.uid()) and idempotent, so they're safe to run
-- unattended. The per-user reminder RPCs (enqueue_rating_reminders /
-- enqueue_session_reminders) act on the calling user, so they stay on-load only.
--
-- pg_cron must be enabled for the project. On Supabase it's an allow-listed
-- extension — this CREATE EXTENSION works from the SQL editor; if your role
-- can't create it, enable "pg_cron" once under Dashboard > Database > Extensions
-- and then re-run the cron.schedule() calls below.
--
-- cron.schedule(name, ...) upserts by job name, so this migration is re-runnable.
-- ============================================================================

create extension if not exists pg_cron;

-- Every 10 minutes: create each weekly session's next occurrence once the
-- current one has finished (clears games, re-adds co-hosts).
select cron.schedule(
  'roll-weekly-sessions',
  '*/10 * * * *',
  $$select public.roll_weekly_sessions()$$
);

-- Every 10 minutes: cancel + notify one-time sessions that didn't reach their
-- minimum players by start time (weekly occurrences are exempt).
select cron.schedule(
  'cancel-understaffed-sessions',
  '*/10 * * * *',
  $$select public.cancel_understaffed_sessions()$$
);
