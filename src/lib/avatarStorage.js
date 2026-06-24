import { supabase } from './supabaseClient'

// Helpers for keeping the "avatars" Storage bucket from accumulating orphaned
// files. Images live in Storage (only their public URL goes in the database), so
// every replaced avatar / in-person photo would otherwise linger forever.

const BUCKET = 'avatars'
const PUBLIC_MARKER = `/object/public/${BUCKET}/`

// Extract the in-bucket object path from a public avatar URL, or null if the URL
// isn't one of our avatar objects (empty, or an external/default URL we must not
// touch). Any cache-busting query string is stripped.
export function avatarPathFromUrl(url) {
  if (!url) return null
  const i = url.indexOf(PUBLIC_MARKER)
  if (i === -1) return null
  const path = url.slice(i + PUBLIC_MARKER.length).split('?')[0]
  return path ? decodeURIComponent(path) : null
}

// Best-effort delete of avatar objects by in-bucket path. Never throws — orphan
// cleanup must never break the flow that triggered it (a leftover file is
// harmless; a thrown error mid-save is not).
export async function removeAvatarPaths(paths) {
  const clean = paths.filter(Boolean)
  if (clean.length === 0) return
  try {
    const { error } = await supabase.storage.from(BUCKET).remove(clean)
    if (error) console.warn('[avatars] cleanup failed:', error.message)
  } catch (err) {
    console.warn('[avatars] cleanup threw:', err)
  }
}

// After a profile save, delete previously-stored avatar / in-person photo files
// that have been replaced or removed. `prev` and `next` are { avatarUrl, photoUrl }
// holding full public URLs (prev = what was in the DB, next = what was just saved).
export async function cleanupReplacedAvatars(prev, next) {
  const paths = []
  if (prev.avatarUrl && prev.avatarUrl !== next.avatarUrl) paths.push(avatarPathFromUrl(prev.avatarUrl))
  if (prev.photoUrl && prev.photoUrl !== next.photoUrl) paths.push(avatarPathFromUrl(prev.photoUrl))
  await removeAvatarPaths(paths)
}
