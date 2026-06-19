-- ============================================================================
-- BG Session — migration 0013: profile "last seen" + BoardGameGeek links
--
-- 1) profiles.last_seen_at — a coarse "last online" timestamp shown (small) on
--    profiles. The client calls touch_last_seen() on load; the function stamps
--    now() server-side so we never trust a client clock. The column is public
--    (profiles is world-readable to authenticated users), so it surfaces on
--    other members' profiles too — handy to gauge how active a host is.
-- 2) board_games.bgg_url — a canonical BoardGameGeek page link per catalog game
--    so members can open the full data on BGG. Seeded for the starter catalog;
--    games without a stored link fall back to a BGG search in the UI.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Last seen
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists last_seen_at timestamptz;

-- Stamp the caller's own last_seen_at with the server clock. SECURITY DEFINER
-- so it works regardless of the profiles UPDATE policy and can't be spoofed.
create or replace function touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set last_seen_at = now() where id = auth.uid();
$$;

grant execute on function touch_last_seen() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) BoardGameGeek links for the catalog
-- ---------------------------------------------------------------------------
alter table board_games add column if not exists bgg_url text;

update board_games as b
set bgg_url = v.url
from (values
  ('Brass: Birmingham',                'https://boardgamegeek.com/boardgame/224517/brass-birmingham'),
  ('Ark Nova',                         'https://boardgamegeek.com/boardgame/342942/ark-nova'),
  ('Wingspan',                         'https://boardgamegeek.com/boardgame/266192/wingspan'),
  ('Hansa Teutonica',                  'https://boardgamegeek.com/boardgame/43015/hansa-teutonica'),
  ('Harmonies',                        'https://boardgamegeek.com/boardgame/414317/harmonies'),
  ('Turing Machine',                   'https://boardgamegeek.com/boardgame/356123/turing-machine'),
  ('Catan',                            'https://boardgamegeek.com/boardgame/13/catan'),
  ('Carcassonne',                      'https://boardgamegeek.com/boardgame/822/carcassonne'),
  ('Terraforming Mars',               'https://boardgamegeek.com/boardgame/167791/terraforming-mars'),
  ('7 Wonders',                        'https://boardgamegeek.com/boardgame/68448/7-wonders'),
  ('7 Wonders Duel',                   'https://boardgamegeek.com/boardgame/173346/7-wonders-duel'),
  ('Azul',                             'https://boardgamegeek.com/boardgame/230802/azul'),
  ('Splendor',                         'https://boardgamegeek.com/boardgame/148228/splendor'),
  ('Scythe',                           'https://boardgamegeek.com/boardgame/169786/scythe'),
  ('Everdell',                         'https://boardgamegeek.com/boardgame/199792/everdell'),
  ('Root',                             'https://boardgamegeek.com/boardgame/237182/root'),
  ('Spirit Island',                    'https://boardgamegeek.com/boardgame/162886/spirit-island'),
  ('Gloomhaven',                       'https://boardgamegeek.com/boardgame/174430/gloomhaven'),
  ('Ticket to Ride',                   'https://boardgamegeek.com/boardgame/9209/ticket-to-ride'),
  ('Dune: Imperium',                   'https://boardgamegeek.com/boardgame/316554/dune-imperium'),
  ('Wingspan: Oceania Expansion',      'https://boardgamegeek.com/boardgame/300580/wingspan-oceania-expansion'),
  ('Terraforming Mars: Prelude',       'https://boardgamegeek.com/boardgame/247030/terraforming-mars-prelude'),
  ('Catan: Seafarers',                 'https://boardgamegeek.com/boardgame/325/catan-seafarers')
) as v(name, url)
where b.name = v.name;
