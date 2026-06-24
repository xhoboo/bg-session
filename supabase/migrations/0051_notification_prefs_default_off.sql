-- ============================================================================
-- BG Session — migration 0051: email notifications OFF by default (opt-in)
--
-- 0049 introduced per-user email preferences as an opt-OUT model: a missing
-- row meant "all on". This flips it to opt-IN — email is off by default and a
-- user has to turn each switch on. In-app notifications are unchanged; they
-- always land in the bell regardless of these settings.
--
-- Two changes:
--   1. Column defaults flip from true → false (matters for fresh inserts).
--   2. send_notification_email() treats a missing row as "off": send_it starts
--      false and is only enabled when the recipient has an explicit pref row
--      with that switch on.
--
-- NOTE: existing users with no prefs row will stop receiving emails until they
-- opt in. Rows already written (from a previous toggle) keep their values.
-- Re-runnable.
-- ============================================================================

alter table notification_prefs alter column email_join_updates      set default false;
alter table notification_prefs alter column email_session_reminders set default false;
alter table notification_prefs alter column email_session_changes   set default false;

-- ---------------------------------------------------------------------------
-- Patch the email sender (from 0049) so a missing pref row means "don't send".
-- Same body as 0049 except send_it now starts false and the lookup comment.
-- ---------------------------------------------------------------------------
create or replace function send_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient text;
  api_key   text;
  from_addr text;
  app_url   text;
  cta       text;
  t         text;
  b         text;
  html_body text;
  np        notification_prefs%rowtype;
  send_it   boolean := false;
begin
  -- Only important types get an email; the rest stay in-app only.
  if new.type not in (
    'join_approved', 'join_confirmed', 'join_rejected',
    'session_reminder', 'session_canceled'
  ) then
    return new;
  end if;

  -- Honour the recipient's email preferences. No row = all off (opt-in default).
  select * into np from notification_prefs where user_id = new.user_id;
  if found then
    if new.type = 'session_reminder' then
      send_it := np.email_session_reminders;
    elsif new.type = 'session_canceled' then
      send_it := np.email_session_changes;
    else  -- join_approved / join_confirmed / join_rejected
      send_it := np.email_join_updates;
    end if;
  end if;
  if not send_it then
    return new;  -- opted out (or never opted in); in-app notification still delivered
  end if;

  select value into api_key from app_config where key = 'resend_api_key';
  if api_key is null then
    return new;  -- not configured yet; in-app notification still delivered
  end if;

  select email into recipient from auth.users where id = new.user_id;
  if recipient is null then
    return new;
  end if;

  select value into from_addr from app_config where key = 'email_from';
  select value into app_url   from app_config where key = 'app_url';

  -- Escape user-controlled text (session titles) before embedding in HTML.
  t := replace(replace(replace(new.title, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  b := replace(replace(replace(coalesce(new.body, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');

  cta := coalesce(app_url, '') ||
         case when new.session_id is not null
              then '/sessions/' || new.session_id::text else '' end;

  html_body :=
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px">' ||
    '<h2 style="color:#0f766e;margin:0 0 8px">' || t || '</h2>' ||
    '<p style="color:#334155;font-size:15px;line-height:1.5">' || b || '</p>' ||
    case when cta <> '' then
      '<p style="margin-top:24px"><a href="' || cta ||
      '" style="background:#0f766e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block">Open BG Session</a></p>'
    else '' end ||
    '<p style="color:#94a3b8;font-size:12px;margin-top:32px">You received this because you use BG Session. You can manage email notifications in your profile settings.</p>' ||
    '</div>';

  -- pg_net is async/fire-and-forget: this never blocks or fails the insert.
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || api_key,
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'from',    coalesce(from_addr, 'BG Session <onboarding@resend.dev>'),
      'to',      recipient,
      'subject', new.title,
      'html',    html_body
    )
  );

  return new;
end;
$$;
