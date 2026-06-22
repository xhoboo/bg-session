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

// Coarse "last online" status for a profile. Within 5 minutes counts as
// currently online; no timestamp yet (user hasn't opened the app since this
// shipped) shows as "Offline" and self-corrects once they load it.
export function lastSeen(iso) {
  if (!iso) return { online: false, label: 'Offline' }
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

// "Region · Area", or just whichever is present. Some regions have no sub-areas,
// so a session can have a region with an empty area.
export function locationLabel(region, area) {
  if (region && area) return `${region} · ${area}`
  return area || region || ''
}

export function formatDuration(minutes) {
  if (!minutes) return null
  if (minutes >= 360) return '6+ hours'
  const h = minutes / 60
  return `~${h} hour${h > 1 ? 's' : ''}`
}

// ---------------------------------------------------------------------------
// Weekly sessions
// ---------------------------------------------------------------------------

// Day index matches JS Date.getDay() and Postgres `dow`: 0 = Sunday.
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function dayLabel(n) {
  return WEEKDAYS[Number(n)] ?? ''
}

// "One-time" / "Weekly" tag for a session row.
export function recurrenceLabel(s) {
  return s?.recurrence === 'weekly' ? 'Weekly' : 'One-time'
}

// How many times a weekly series has run is shown as a separate "medal" badge
// (see components/OccurrenceBadge) rather than baked into the title, so the plain
// session.title is used directly wherever a session is named.

// Field-groups a host can grant co-hosts permission to edit. Keys match the
// server-side checks in migration 0028 (enforce_cohost_edit_*).
export const COHOST_FIELDS = [
  { key: 'title', label: 'Title' },
  { key: 'schedule', label: 'Day & time' },
  { key: 'location', label: 'Location & address' },
  { key: 'players', label: 'Player limits' },
  { key: 'board_games', label: 'Board games' },
  { key: 'session_type', label: 'Join type' },
  { key: 'duration', label: 'Duration' },
]

// Next occurrence (a JS Date) for a given weekday + "HH:MM" time, strictly in
// the future. Mirrors next_weekly_occurrence() in SQL; computed in the browser's
// local time, which for this app's audience is WIB — fine for a preview label.
export function nextWeeklyDate(weeklyDay, startTime) {
  if (weeklyDay === '' || weeklyDay == null || !startTime) return null
  const [h, m] = startTime.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  const now = new Date()
  const d = new Date(now)
  const ahead = (((Number(weeklyDay) - now.getDay()) % 7) + 7) % 7
  d.setDate(now.getDate() + ahead)
  d.setHours(h, m, 0, 0)
  if (d <= now) d.setDate(d.getDate() + 7)
  return d
}
