-- ============================================================================
-- BG Session — migration 0035: harden the avatars storage bucket
--
-- Two fixes:
--  1) Stop bucket enumeration. The 0005 read policy let ANY caller SELECT/list
--     every object in the bucket (Security Advisor: "Public Bucket Allows
--     Listing"). Avatars still need to DISPLAY publicly — but that happens via
--     the public object URL (`/object/public/avatars/...`), which does NOT go
--     through RLS for a public bucket. So we can safely restrict the RLS SELECT
--     (the authenticated list/download API) to each user's OWN folder without
--     affecting how avatars render. The app only ever uploads + getPublicUrl(),
--     never .list(), so nothing breaks.
--  2) Enforce upload limits server-side. AvatarUpload.jsx checks "image/* and
--     < 5 MB" on the client, but that's bypassable. Pin the same limits on the
--     bucket, and exclude SVG (image/svg+xml can carry scripts) to avoid stored
--     active content.
-- ============================================================================

-- 1) Replace the broad public-read policy with an own-folder-only list policy.
drop policy if exists "avatars_public_read" on storage.objects;

create policy "avatars_owner_list"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2) Server-side upload limits (5 MB; raster image types only, no SVG).
update storage.buckets
set file_size_limit   = 5242880,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp',
      'image/gif',  'image/avif', 'image/heic', 'image/heif'
    ]
where id = 'avatars';
