-- ============================================================================
-- BG Session — migration 0020: regions + areas, and sessions.region
--
-- Replaces the old flat "neighborhood area" model (a hardcoded list in
-- src/data/areas.js) with a two-level location model:
--   * `regions` — big cities (Jakarta Pusat/Utara/…, Bogor, Bandung, …)
--   * `areas`   — sub-areas that belong to a region (Kelapa Gading, PIK, …)
-- The browse filters and the Host-a-Session form read these live, so new
-- regions/areas added later (via the local admin tool, which uses the
-- service_role key) appear in the app without a redeploy.
--
-- Both tables are world-readable to authenticated users (read-only); inserts
-- are done out-of-band by the service_role admin tool, which bypasses RLS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Regions (big cities)
-- ---------------------------------------------------------------------------
create table if not exists regions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

alter table regions enable row level security;

drop policy if exists "regions_read" on regions;
create policy "regions_read" on regions
  for select to authenticated using (true);

insert into regions (name, sort_order) values
  ('Jakarta Pusat',   1),
  ('Jakarta Utara',   2),
  ('Jakarta Barat',   3),
  ('Jakarta Selatan', 4),
  ('Jakarta Timur',   5),
  ('Bogor',           6),
  ('Depok',           7),
  ('Tangerang',       8),
  ('Bekasi',          9),
  ('Bandung',        10),
  ('Yogyakarta',     11),
  ('Surabaya',       12)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Areas (sub-areas within a region)
-- ---------------------------------------------------------------------------
create table if not exists areas (
  id         uuid primary key default gen_random_uuid(),
  region_id  uuid not null references regions (id) on delete cascade,
  name       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  unique (region_id, name)
);

create index if not exists areas_region_idx on areas (region_id);

alter table areas enable row level security;

drop policy if exists "areas_read" on areas;
create policy "areas_read" on areas
  for select to authenticated using (true);

-- Starter set of areas per region. Add more any time via the admin tool.
insert into areas (region_id, name, sort_order)
select r.id, a.name, a.sort_order
from regions r
join (values
  ('Jakarta Pusat',   'Menteng',                   1),
  ('Jakarta Pusat',   'Thamrin',                   2),
  ('Jakarta Pusat',   'Sudirman',                  3),
  ('Jakarta Pusat',   'Kemayoran',                 4),
  ('Jakarta Pusat',   'Gambir',                    5),
  ('Jakarta Utara',   'Kelapa Gading',             1),
  ('Jakarta Utara',   'PIK (Pantai Indah Kapuk)',  2),
  ('Jakarta Utara',   'Sunter',                    3),
  ('Jakarta Utara',   'Pluit',                     4),
  ('Jakarta Utara',   'Ancol',                     5),
  ('Jakarta Barat',   'Puri Indah',                1),
  ('Jakarta Barat',   'Kebon Jeruk',               2),
  ('Jakarta Barat',   'Grogol',                    3),
  ('Jakarta Barat',   'Tanjung Duren',             4),
  ('Jakarta Selatan', 'Kemang',                    1),
  ('Jakarta Selatan', 'Pondok Indah',              2),
  ('Jakarta Selatan', 'Senayan',                   3),
  ('Jakarta Selatan', 'SCBD',                      4),
  ('Jakarta Selatan', 'Kuningan',                  5),
  ('Jakarta Selatan', 'Tebet',                     6),
  ('Jakarta Selatan', 'Cilandak',                  7),
  ('Jakarta Selatan', 'Fatmawati',                 8),
  ('Jakarta Selatan', 'Gandaria',                  9),
  ('Jakarta Selatan', 'Kebayoran Baru',           10),
  ('Jakarta Selatan', 'Kebayoran Lama',           11),
  ('Jakarta Selatan', 'Cipete',                   12),
  ('Jakarta Timur',   'Rawamangun',                1),
  ('Jakarta Timur',   'Cawang',                    2),
  ('Jakarta Timur',   'Cibubur',                   3),
  ('Jakarta Timur',   'Jatinegara',                4),
  ('Bogor',           'Bogor Kota',                1),
  ('Bogor',           'Sentul',                    2),
  ('Bogor',           'Cibinong',                  3),
  ('Depok',           'Margonda',                  1),
  ('Depok',           'Cinere',                    2),
  ('Depok',           'Sawangan',                  3),
  ('Tangerang',       'BSD City',                  1),
  ('Tangerang',       'Alam Sutera',               2),
  ('Tangerang',       'Gading Serpong',            3),
  ('Tangerang',       'Bintaro',                   4),
  ('Tangerang',       'Karawaci',                  5),
  ('Bekasi',          'Summarecon Bekasi',         1),
  ('Bekasi',          'Harapan Indah',             2),
  ('Bekasi',          'Bekasi Kota',               3),
  ('Bandung',         'Dago',                      1),
  ('Bandung',         'Cihampelas',                2),
  ('Bandung',         'Pasteur',                   3),
  ('Bandung',         'Setiabudi',                 4),
  ('Yogyakarta',      'Malioboro',                 1),
  ('Yogyakarta',      'Sleman',                    2),
  ('Yogyakarta',      'Bantul',                    3),
  ('Yogyakarta',      'Condongcatur',              4),
  ('Surabaya',        'Gubeng',                    1),
  ('Surabaya',        'Darmo',                     2),
  ('Surabaya',        'Pakuwon',                   3),
  ('Surabaya',        'Rungkut',                   4)
) as a(region, name, sort_order) on a.region = r.name
on conflict (region_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- sessions.region (denormalized text, matching the existing `area` column)
-- ---------------------------------------------------------------------------
alter table sessions add column if not exists region text;
create index if not exists sessions_region_idx on sessions (region);

-- Best-effort backfill for existing rows so they still show under the new
-- Region filter. (1) area text that matches a seeded sub-area → its region;
-- (2) area text that is itself a region name (old data like 'Depok'/'Bekasi').
update sessions s
set region = r.name
from areas a
join regions r on r.id = a.region_id
where s.region is null and lower(s.area) = lower(a.name);

update sessions s
set region = r.name
from regions r
where s.region is null and lower(s.area) = lower(r.name);
