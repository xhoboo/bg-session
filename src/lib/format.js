// Small date/time helpers. We use Asia/Jakarta (WIB) for display since the
// audience is in Indonesia.
const TZ = 'Asia/Jakarta'

export function formatDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' WIB'
}

export function formatDateShort(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.round(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return formatDateShort(iso)
}

// Coarse "last online" status for a profile. Returns null when unknown (the
// user has never been stamped). Within 5 minutes counts as currently online.
export function lastSeen(iso) {
  if (!iso) return null
  const diffMin = (Date.now() - new Date(iso).getTime()) / 60_000
  if (diffMin < 5) return { online: true, label: 'Online now' }
  return { online: false, label: `Last seen ${timeAgo(iso)}` }
}

// Link to a board game's BoardGameGeek page. Uses the catalog's stored URL when
// we have one, else falls back to a BGG search for the name — so freeform games
// that aren't in the catalog still get a working "view on BGG" link.
export function bggLink(name, url) {
  if (url) return url
  return `https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q=${encodeURIComponent(name || '')}`
}

// Convert a stored ISO timestamp into the value a <input type="datetime-local">
// expects (local wall-clock, no timezone suffix).
export function toDatetimeLocalValue(iso) {
  const d = iso ? new Date(iso) : new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// When a session has no explicit duration we assume this many minutes so we can
// still tell when it's "finished" (a typical board-game evening).
export const FALLBACK_DURATION_MIN = 180

// A session has started once its start time has passed…
export function hasSessionStarted(s) {
  return new Date(s.starts_at).getTime() <= Date.now()
}

// …and is "finished" once start + (duration or fallback) has passed. We treat
// the whole app's "past / history" concept off this, not just the start time.
export function isSessionFinished(s) {
  const mins = s.duration_minutes || FALLBACK_DURATION_MIN
  return new Date(s.starts_at).getTime() + mins * 60_000 <= Date.now()
}

// The host counts as a player, so total players = approved guests + 1.
export function playerCount(s) {
  return `${(s.confirmed_count ?? 0) + 1}/${s.max_players}`
}

export function isSessionFull(s) {
  return (s.confirmed_count ?? 0) + 1 >= s.max_players
}

// Directions link: use the host's pinned Google Maps link if given, else search
// Google Maps by the address text.
export function mapsLink(address, mapsUrl) {
  if (mapsUrl) return mapsUrl
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || '')}`
}

export function formatDuration(minutes) {
  if (!minutes) return null
  if (minutes >= 360) return '6+ hours'
  const h = minutes / 60
  return `~${h} hour${h > 1 ? 's' : ''}`
}
