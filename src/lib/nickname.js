import { supabase } from './supabaseClient'

// Rules for the public nickname: at most 20 characters, no spaces, and only
// letters, digits, and the separators . _ - . Uniqueness is enforced
// case-insensitively (see `nicknameTakenError` + the DB unique index in
// migration 0024).
export const NICKNAME_MAX = 20
const NICKNAME_RE = /^[A-Za-z0-9._-]+$/

// Matches a v4-style UUID. Profile links carry the nickname now, but older
// shared links still pass the raw user id — UserProfile uses this to tell them
// apart and look up the right column.
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Canonical path to a user's public profile. Prefer the unique, URL-safe
// nickname so links read /users/Andi instead of /users/<uuid>; pass the id only
// as a fallback when the nickname isn't loaded. UserProfile resolves either.
export function userPath(handle) {
  return `/users/${encodeURIComponent(handle || '')}`
}

// A profile's display name: prefer the public nickname, fall back to the full
// display name, else '' so callers can supply their own localized fallback,
// e.g. `personName(host) || t('Host')`. Accepts a possibly-null profile.
export function personName(profile) {
  return profile?.nickname || profile?.display_name || ''
}

// Returns a user-facing error string if the nickname's format is invalid, else
// '' (valid). Trims first, so trailing spaces don't trip the no-spaces rule.
export function nicknameFormatError(nickname) {
  const n = (nickname || '').trim()
  if (!n) return 'Please enter a nickname.'
  if (n.length > NICKNAME_MAX) return `Nickname must be ${NICKNAME_MAX} characters or fewer.`
  if (!NICKNAME_RE.test(n)) return 'Nickname can only use letters, numbers, and . _ - (no spaces or other symbols).'
  return ''
}

// Case-insensitive check that no other user already uses this nickname. Returns
// an error string if taken, else ''. A network error returns '' (allow through)
// — the DB unique index is the real guard, so the save handler still catches a
// collision via error code 23505.
export async function nicknameTakenError(nickname, ownId) {
  // Escape ILIKE wildcards so an underscore in the nickname matches literally
  // (ILIKE treats _ and % as wildcards).
  const pattern = nickname.trim().replace(/[\\%_]/g, '\\$&')
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .ilike('nickname', pattern)
    .neq('id', ownId)
    .limit(1)
  if (error) return ''
  return data && data.length ? 'That nickname is already taken.' : ''
}
