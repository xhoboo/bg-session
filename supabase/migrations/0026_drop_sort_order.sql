-- ============================================================================
-- BG Session — migration 0026: drop the unused `sort_order` on regions/areas
--
-- Regions and areas are now always presented alphabetically by name (both in
-- the app's pickers and in the local admin tool). The manual sort_order column
-- is no longer read or written anywhere, so remove it from both tables.
-- ============================================================================

alter table regions drop column if exists sort_order;
alter table areas   drop column if exists sort_order;
