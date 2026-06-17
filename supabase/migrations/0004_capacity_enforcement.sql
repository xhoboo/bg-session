-- ============================================================================
-- BG Session — migration 0004: enforce the host's max_players capacity
--
-- max_players was stored and only soft-checked in the UI. This enforces it at
-- the database level so a session can never exceed the limit the host set:
--   * Open sessions: a join that would auto-confirm is rejected when full.
--   * Approval sessions: the host cannot approve a request once full.
-- ============================================================================

-- Replace the insert trigger so open-session auto-approval also checks capacity.
create or replace function set_request_status_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s_type session_type;
  cap    int;
  taken  int;
begin
  select session_type, max_players, confirmed_count
    into s_type, cap, taken
    from sessions where id = new.session_id;

  if s_type = 'open' then
    if taken >= cap then
      raise exception 'This session is full.' using errcode = 'check_violation';
    end if;
    new.status := 'approved';
  else
    new.status := 'pending';
  end if;
  return new;
end;
$$;

-- Block approvals that would exceed capacity.
create or replace function enforce_capacity_on_approve()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap   int;
  taken int;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select max_players, confirmed_count into cap, taken
      from sessions where id = new.session_id;
    if taken >= cap then
      raise exception 'This session is already full.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_capacity_approve on join_requests;
create trigger trg_enforce_capacity_approve
  before update on join_requests
  for each row execute function enforce_capacity_on_approve();
