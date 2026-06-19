-- ============================================================================
-- BG Session — migration 0021: split out Tangerang Selatan
--
-- Adds "Tangerang Selatan" as its own region and moves the areas that actually
-- belong there (BSD City, Alam Sutera, Gading Serpong, Bintaro) out of
-- "Tangerang". Kota Tangerang keeps Karawaci. Regions are renumbered so the
-- two Tangerangs sit next to each other.
--
-- Idempotent: it moves existing rows (no duplicate inserts), so re-running just
-- no-ops whether or not 0020's seed already placed these areas under Tangerang.
-- (Run 0020 first; this migration assumes the regions/areas tables exist.)
-- ============================================================================

-- 1) New region.
insert into regions (name, sort_order) values ('Tangerang Selatan', 9)
on conflict (name) do nothing;

-- 2) Canonical 13-region ordering (absolute values → idempotent).
update regions r set sort_order = v.sort_order
from (values
  ('Jakarta Pusat',     1),
  ('Jakarta Utara',     2),
  ('Jakarta Barat',     3),
  ('Jakarta Selatan',   4),
  ('Jakarta Timur',     5),
  ('Bogor',             6),
  ('Depok',             7),
  ('Tangerang',         8),
  ('Tangerang Selatan', 9),
  ('Bekasi',           10),
  ('Bandung',          11),
  ('Yogyakarta',       12),
  ('Surabaya',         13)
) as v(name, sort_order)
where r.name = v.name;

-- 3) Move the Tangsel areas from Tangerang -> Tangerang Selatan (preserves the
--    existing rows, so no duplicates).
update areas
set region_id = tsel.id
from regions tsel, regions tang
where tsel.name = 'Tangerang Selatan'
  and tang.name = 'Tangerang'
  and areas.region_id = tang.id
  and areas.name in ('BSD City', 'Alam Sutera', 'Gading Serpong', 'Bintaro');

-- 4) Belt-and-suspenders: ensure the areas exist under Tangerang Selatan even
--    if any were missing (e.g. removed earlier). Existing ones are skipped.
insert into areas (region_id, name, sort_order)
select r.id, a.name, a.sort_order
from regions r
join (values
  ('BSD City',       1),
  ('Alam Sutera',    2),
  ('Gading Serpong', 3),
  ('Bintaro',        4)
) as a(name, sort_order) on r.name = 'Tangerang Selatan'
on conflict (region_id, name) do nothing;

-- 5) Re-point existing sessions that used those areas under the old region.
update sessions
set region = 'Tangerang Selatan'
where region = 'Tangerang'
  and area in ('BSD City', 'Alam Sutera', 'Gading Serpong', 'Bintaro');
