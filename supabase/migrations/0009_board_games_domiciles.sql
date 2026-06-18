-- ============================================================================
-- BG Session — migration 0009: board game catalog + domiciles
--
-- `board_games` powers the autocomplete suggestions and game detail pages.
-- `domiciles` powers the (strict) domicile picker on profiles.
-- Both are seeded with a starter set; add more rows manually any time.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Board games catalog (Base / Expansion)
-- ---------------------------------------------------------------------------
create table if not exists board_games (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  category   text not null default 'base' check (category in ('base', 'expansion')),
  created_at timestamptz not null default now()
);

alter table board_games enable row level security;

drop policy if exists "board_games_read" on board_games;
create policy "board_games_read" on board_games
  for select to authenticated using (true);

insert into board_games (name, category) values
  ('Brass: Birmingham', 'base'),
  ('Ark Nova', 'base'),
  ('Wingspan', 'base'),
  ('Hansa Teutonica', 'base'),
  ('Harmonies', 'base'),
  ('Turing Machine', 'base'),
  ('Catan', 'base'),
  ('Carcassonne', 'base'),
  ('Terraforming Mars', 'base'),
  ('7 Wonders', 'base'),
  ('7 Wonders Duel', 'base'),
  ('Azul', 'base'),
  ('Splendor', 'base'),
  ('Scythe', 'base'),
  ('Everdell', 'base'),
  ('Root', 'base'),
  ('Spirit Island', 'base'),
  ('Gloomhaven', 'base'),
  ('Ticket to Ride', 'base'),
  ('Dune: Imperium', 'base'),
  ('Wingspan: Oceania Expansion', 'expansion'),
  ('Terraforming Mars: Prelude', 'expansion'),
  ('Catan: Seafarers', 'expansion')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Domiciles (cities / areas) — strict pick list for profiles
-- ---------------------------------------------------------------------------
create table if not exists domiciles (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

alter table domiciles enable row level security;

drop policy if exists "domiciles_read" on domiciles;
create policy "domiciles_read" on domiciles
  for select to authenticated using (true);

insert into domiciles (name) values
  ('Jakarta Pusat'), ('Jakarta Selatan'), ('Jakarta Barat'),
  ('Jakarta Timur'), ('Jakarta Utara'),
  ('Bekasi'), ('Depok'), ('Tangerang'), ('Tangerang Selatan'), ('Bogor'),
  ('Bandung'), ('Surabaya'), ('Yogyakarta'), ('Semarang'),
  ('Medan'), ('Makassar'), ('Denpasar (Bali)')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Profile domicile (public)
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists domicile text;
