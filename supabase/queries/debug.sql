-- ============================================================================
-- BG Session — handy debug / inspection queries
--
-- These are READ-ONLY snippets for poking at the live database from the SQL
-- editor. Nothing here changes schema or data, so they are NOT migrations —
-- they just live in the repo so useful queries don't get lost as saved SQL
-- editor snippets. Copy/paste whichever block you need.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Email delivery (pg_net + Resend) — see migration 0003
-- ----------------------------------------------------------------------------

-- Last few HTTP responses Resend sent back. status_code 200 = accepted; a 4xx
-- with a "message" usually means a bad key, unverified domain, or bad address.
select id, status_code, (content::json ->> 'message') as msg, created
from net._http_response
order by created desc
limit 5;

-- Failures only (anything that wasn't a 2xx), with the raw error.
select id, status_code, content, error_msg, created
from net._http_response
where status_code is null or status_code >= 300
order by created desc
limit 20;

-- Is the Resend key actually configured? (Shows whether keys exist, NOT the
-- secret value itself.)
select key,
       case when key = 'resend_api_key' then '••• set ('|| length(value) ||' chars)'
            else value end as value
from app_config
order by key;

-- Most recent in-app notifications (the insert that fires the email trigger).
select id, user_id, title, session_id, created_at
from notifications
order by created_at desc
limit 20;


-- ----------------------------------------------------------------------------
-- Scheduled maintenance (pg_cron) — see migration 0033
-- ----------------------------------------------------------------------------

-- The two scheduled jobs and their definitions.
select jobid, schedule, jobname, active, command
from cron.job
order by jobname;

-- Recent runs: did roll-weekly-sessions / cancel-understaffed-sessions succeed?
select j.jobname, r.status, r.return_message, r.start_time, r.end_time
from cron.job_run_details r
join cron.job j on j.jobid = r.jobid
order by r.start_time desc
limit 20;


-- ----------------------------------------------------------------------------
-- Online status (last_seen heartbeat) — see migration 0013
-- ----------------------------------------------------------------------------

-- Who's been active recently. "online" ~= seen in the last 2 minutes (matches
-- the client heartbeat cadence).
select id, nickname, last_seen_at,
       (now() - last_seen_at) as ago,
       (last_seen_at > now() - interval '2 minutes') as online_now
from profiles
order by last_seen_at desc nulls last
limit 30;
