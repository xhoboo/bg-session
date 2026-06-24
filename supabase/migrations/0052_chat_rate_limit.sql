-- ============================================================================
-- BG Session — migration 0052: chat rate limiting
--
-- Both chat surfaces (direct_messages 1:1 and session_messages group chat) write
-- straight from the client, so nothing stopped a script — or a stuck client — from
-- flooding a thread. A BEFORE INSERT trigger now caps how fast one sender can post:
-- at most 10 messages in any rolling 10-second window. That's generous for a human
-- typing quickly but shuts down floods.
--
-- The function is SECURITY DEFINER (runs as the owner, bypassing RLS) so the count
-- sees the sender's recent messages regardless of the caller's row visibility. It
-- raises with errcode 53400 (configuration_limit_exceeded) so the client can tell a
-- rate-limit rejection apart from a block (23514) and show the right message.
--
-- Privilege hygiene mirrors 0034/0036/0037: the trigger function runs with owner
-- rights, so no client role needs EXECUTE. Re-runnable.
-- ============================================================================

create or replace function enforce_chat_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent int;
begin
  -- One function serves both chat tables; the sender column differs.
  if tg_table_name = 'direct_messages' then
    select count(*) into v_recent
    from direct_messages
    where sender_id = new.sender_id
      and created_at > now() - interval '10 seconds';
  else
    select count(*) into v_recent
    from session_messages
    where user_id = new.user_id
      and created_at > now() - interval '10 seconds';
  end if;

  if v_recent >= 10 then
    raise exception 'You''re sending messages too quickly — wait a moment and try again.'
      using errcode = '53400';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_rate_limit_dm on direct_messages;
create trigger trg_rate_limit_dm
  before insert on direct_messages
  for each row execute function enforce_chat_rate_limit();

drop trigger if exists trg_rate_limit_session_chat on session_messages;
create trigger trg_rate_limit_session_chat
  before insert on session_messages
  for each row execute function enforce_chat_rate_limit();

-- ---------------------------------------------------------------------------
-- Privilege hygiene (see 0034/0036/0037).
-- ---------------------------------------------------------------------------
revoke execute on function public.enforce_chat_rate_limit() from public, anon, authenticated;
grant  execute on function public.enforce_chat_rate_limit() to service_role;
