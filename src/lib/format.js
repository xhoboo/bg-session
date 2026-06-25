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

// ---------------------------------------------------------------------------
// Game scores (in-session results)
//
// Scoring opens when the session starts and closes one hour after it finishes,
// matching submit_game_play()/start_game_play() in migration 0046. After that
// the session's results are locked for good.
// ---------------------------------------------------------------------------
export const SCORE_LOCK_GRACE_MIN = 60

// After a game's result is submitted, the same game (and any player in it) is on a
// 30-minute cooldown before it can be scored again — mirrors start_game_play()/
// submit_game_play() in migration 0053.
export const GAME_COOLDOWN_MIN = 30

export function scoringClosesAt(s) {
  const mins = s.duration_minutes || FALLBACK_DURATION_MIN
  return new Date(new Date(s.starts_at).getTime() + (mins + SCORE_LOCK_GRACE_MIN) * 60_000)
}

export function isScoringOpen(s) {
  const now = Date.now()
  return new Date(s.starts_at).getTime() <= now && now <= scoringClosesAt(s).getTime()
}

// The five score modes the recorder can pick per play. `team`, `lowestOption`,
// and the winner/score shapes drive the recording form and the result cards.
// Labels/hints are English source strings; the UI runs them through t().
export const SCORE_MODES = [
  {
    key: 'individual_score',
    label: 'Individual Scores',
    hint: 'Everyone keeps their own score; the highest wins.',
    team: false, scores: 'required', winner: 'derived', lowestOption: true,
  },
  {
    key: 'team_score',
    label: 'Team Scores',
    hint: 'Split players into teams. Enter individual scores (a team’s total is the sum) or score each team directly.',
    team: true, scores: 'team', winner: 'derived', lowestOption: true,
  },
  {
    key: 'individual_winloss',
    label: 'Win / Loss',
    hint: 'Pick the one winner. Scores are optional.',
    team: false, scores: 'optional', winner: 'pick-player', lowestOption: false,
  },
  {
    key: 'team_winloss',
    label: 'Team Win / Loss',
    hint: 'Pick the winning team. Team scores are optional.',
    team: true, scores: 'team-optional', winner: 'pick-team', lowestOption: false,
  },
  {
    key: 'cooperative',
    label: 'Co-op (vs. the game)',
    hint: 'Everyone wins or loses together. Scores are optional.',
    team: false, scores: 'optional', winner: 'coop', lowestOption: false,
  },
]

export function scoreMode(key) {
  return SCORE_MODES.find((m) => m.key === key) || null
}

// A stable URL-fragment id for a game's result card, so a chip on the session
// page can deep-link straight to that game's card on the score page. Case-folded
// and slugified so the same spelling always lands on the same anchor.
export function gameAnchor(name) {
  return 'game-' + (name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// Team index → "A", "B", "C"… for display (teams are stored as 1, 2, 3…).
export function teamLetter(n) {
  return String.fromCharCode(64 + Number(n))
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

// How many times a weekly series has run is folded into its recurrence tag
// (see components/RecurrenceBadge — "Weekly #5") rather than baked into the
// title, so the plain session.title is used directly wherever a session is named.

// Field-groups a host can grant co-hosts permission to edit. Keys match the
// server-side checks in migration 0028 (enforce_cohost_edit_*).
export const COHOST_FIELDS = [
  { key: 'title', label: 'Title' },
  { key: 'schedule', label: 'Day & Time' },
  { key: 'location', label: 'Location & Address' },
  { key: 'players', label: 'Player Limits' },
  { key: 'board_games', label: 'Board Games' },
  { key: 'session_type', label: 'Join Type' },
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
