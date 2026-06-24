-- ============================================================================
-- BG Session — migration 0050: distinct game options for the Browse filter
--
-- Browse used to fetch every upcoming session and derive the board-game filter
-- dropdown client-side. That doesn't scale, so the list is now fetched
-- server-side with .eq() filters + .range() pagination. This RPC backs the game
-- dropdown: the distinct game names across upcoming sessions, optionally scoped
-- to the chosen region/area, so the options stay complete even though the client
-- only holds one page of sessions at a time.
--
-- board_games is a free-text comma list, so we split + trim it. Read-only and
-- world-visible (mirrors `sessions` being world-readable); granted to
-- authenticated only (Browse is behind auth). Re-runnable.
-- ============================================================================

create or replace function upcoming_game_options(
  p_region text default null,
  p_area   text default null
)
returns table (game text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct trim(g) as game
  from sessions s
  cross join lateral unnest(string_to_array(s.board_games, ',')) as g
  where s.starts_at >= now()
    and (p_region is null or p_region = '' or s.region = p_region)
    and (p_area   is null or p_area   = '' or s.area   = p_area)
    and trim(g) <> ''
  order by game;
$$;

revoke execute on function public.upcoming_game_options(text, text) from public, anon;
grant  execute on function public.upcoming_game_options(text, text) to authenticated, service_role;
