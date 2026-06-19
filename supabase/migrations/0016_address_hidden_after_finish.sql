-- ============================================================================
-- BG Session — migration 0016: address becomes unreadable after a session ends
--
-- Until now the full address in session_addresses was readable by the host and
-- approved guests indefinitely. We tighten the SELECT policy so it ALSO requires
-- the session to not have finished yet — once it's over, the address is no
-- longer returned by the API to anyone, not just hidden in the UI.
--
-- "Finished" = starts_at + (duration_minutes, default 180) has passed, matching
-- lib/format.js and migrations 0011/0012.
--
-- The host only edits a session before it starts (EditSession blocks started
-- sessions before reading the address), and the detail page hides the address
-- block for finished sessions, so nothing legitimate loses access.
-- ============================================================================

drop policy if exists "addresses_select_host_or_approved" on session_addresses;

create policy "addresses_select_host_or_approved"
  on session_addresses for select
  to authenticated
  using (
    exists (
      select 1 from sessions s
      where s.id = session_addresses.session_id
        and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) >= now()
        and (
          s.host_id = auth.uid()
          or exists (
            select 1 from join_requests jr
            where jr.session_id = s.id
              and jr.guest_id = auth.uid()
              and jr.status = 'approved'
          )
        )
    )
  );
