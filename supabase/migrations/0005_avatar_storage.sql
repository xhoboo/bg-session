-- ============================================================================
-- BG Session — migration 0005: avatar uploads (Supabase Storage)
--
-- Creates a public "avatars" bucket. Anyone can read avatars (they're shown to
-- other players); each user may only write files inside their own folder
-- (avatars/<user_id>/...), enforced by storage RLS.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read"  on storage.objects;
drop policy if exists "avatars_user_insert"  on storage.objects;
drop policy if exists "avatars_user_update"  on storage.objects;
drop policy if exists "avatars_user_delete"  on storage.objects;

create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_user_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_user_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_user_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
