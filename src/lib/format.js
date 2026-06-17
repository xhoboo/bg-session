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

// Convert a stored ISO timestamp into the value a <input type="datetime-local">
// expects (local wall-clock, no timezone suffix).
export function toDatetimeLocalValue(iso) {
  const d = iso ? new Date(iso) : new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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
