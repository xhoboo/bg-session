import { describe, it, expect } from 'vitest'
import {
  formatDateTime,
  formatDateShort,
  timeAgo,
  lastSeen,
  bggLink,
  toDatetimeLocalValue,
  hasSessionStarted,
  isSessionFinished,
  FALLBACK_DURATION_MIN,
  scoringClosesAt,
  isScoringOpen,
  SCORE_LOCK_GRACE_MIN,
  scoreMode,
  SCORE_MODES,
  gameAnchor,
  teamLetter,
  playerCount,
  isSessionFull,
  mapsLink,
  locationLabel,
  formatDuration,
  WEEKDAYS,
  dayLabel,
  recurrenceLabel,
  nextWeeklyDate,
} from '../src/lib/format.js'

// Build an ISO string `mins` minutes from now (negative = in the past).
const minsFromNow = (mins) => new Date(Date.now() + mins * 60_000).toISOString()

describe('formatDateTime / formatDateShort', () => {
  it('returns empty string for falsy input', () => {
    expect(formatDateTime('')).toBe('')
    expect(formatDateTime(null)).toBe('')
    expect(formatDateShort('')).toBe('')
  })

  it('formats a real timestamp in WIB', () => {
    const out = formatDateTime('2026-06-24T03:00:00Z')
    expect(out).toContain('WIB')
    expect(out).toMatch(/2026/)
  })
})

describe('timeAgo', () => {
  it('returns empty string for falsy input', () => {
    expect(timeAgo(null)).toBe('')
  })
  it('reads "just now" within the last minute', () => {
    expect(timeAgo(minsFromNow(-0.2))).toBe('just now')
  })
  it('reads minutes / hours / days', () => {
    expect(timeAgo(minsFromNow(-5))).toBe('5m ago')
    expect(timeAgo(minsFromNow(-120))).toBe('2h ago')
    expect(timeAgo(minsFromNow(-60 * 24 * 3))).toBe('3d ago')
  })
  it('falls back to a short date beyond a week', () => {
    const out = timeAgo(minsFromNow(-60 * 24 * 30))
    expect(out).not.toMatch(/ago/)
    expect(out.length).toBeGreaterThan(0)
  })
})

describe('lastSeen', () => {
  it('is offline with no timestamp', () => {
    expect(lastSeen(null)).toEqual({ online: false, label: 'Offline' })
  })
  it('is online within 5 minutes', () => {
    expect(lastSeen(minsFromNow(-1))).toEqual({ online: true, label: 'Online now' })
  })
  it('shows a last-seen label when stale', () => {
    const r = lastSeen(minsFromNow(-30))
    expect(r.online).toBe(false)
    expect(r.label).toMatch(/Last seen/)
  })
})

describe('bggLink', () => {
  it('prefers a stored url', () => {
    expect(bggLink('Catan', 'https://bgg/x')).toBe('https://bgg/x')
  })
  it('falls back to an encoded search url', () => {
    const out = bggLink('Ticket to Ride')
    expect(out).toContain('geeksearch.php')
    expect(out).toContain('Ticket%20to%20Ride')
  })
})

describe('toDatetimeLocalValue', () => {
  it('matches the datetime-local input shape', () => {
    expect(toDatetimeLocalValue('2026-06-24T03:00:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(toDatetimeLocalValue()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })
})

describe('session lifecycle', () => {
  it('hasSessionStarted reflects the start time', () => {
    expect(hasSessionStarted({ starts_at: minsFromNow(-1) })).toBe(true)
    expect(hasSessionStarted({ starts_at: minsFromNow(10) })).toBe(false)
  })

  it('isSessionFinished uses start + duration', () => {
    // started 90m ago, 60m long -> finished
    expect(isSessionFinished({ starts_at: minsFromNow(-90), duration_minutes: 60 })).toBe(true)
    // started 30m ago, 60m long -> not finished
    expect(isSessionFinished({ starts_at: minsFromNow(-30), duration_minutes: 60 })).toBe(false)
  })

  it('isSessionFinished falls back to the default duration', () => {
    // started just over the fallback window ago, no duration -> finished
    expect(isSessionFinished({ starts_at: minsFromNow(-(FALLBACK_DURATION_MIN + 5)) })).toBe(true)
    expect(isSessionFinished({ starts_at: minsFromNow(-(FALLBACK_DURATION_MIN - 5)) })).toBe(false)
  })
})

describe('scoring window', () => {
  it('scoringClosesAt = start + duration + grace', () => {
    const start = '2026-06-24T10:00:00Z'
    const closes = scoringClosesAt({ starts_at: start, duration_minutes: 120 })
    const expected = new Date(Date.parse(start) + (120 + SCORE_LOCK_GRACE_MIN) * 60_000)
    expect(closes.getTime()).toBe(expected.getTime())
  })

  it('is open between start and close, shut otherwise', () => {
    // started 30m ago, 60m long -> within start..start+60+60
    expect(isScoringOpen({ starts_at: minsFromNow(-30), duration_minutes: 60 })).toBe(true)
    // not started yet
    expect(isScoringOpen({ starts_at: minsFromNow(30), duration_minutes: 60 })).toBe(false)
    // finished long ago, past the 60m grace
    expect(isScoringOpen({ starts_at: minsFromNow(-300), duration_minutes: 60 })).toBe(false)
  })
})

describe('score modes', () => {
  it('looks up a known mode and rejects an unknown one', () => {
    expect(scoreMode('cooperative')).toMatchObject({ key: 'cooperative' })
    expect(scoreMode('nope')).toBeNull()
  })
  it('every mode has the shape the form relies on', () => {
    for (const m of SCORE_MODES) {
      expect(typeof m.key).toBe('string')
      expect(typeof m.label).toBe('string')
      expect(typeof m.team).toBe('boolean')
    }
  })
})

describe('small helpers', () => {
  it('gameAnchor slugifies and prefixes', () => {
    expect(gameAnchor('Ticket to Ride!')).toBe('game-ticket-to-ride')
    expect(gameAnchor('  Catan  ')).toBe('game-catan')
  })
  it('teamLetter maps 1->A, 2->B', () => {
    expect(teamLetter(1)).toBe('A')
    expect(teamLetter(2)).toBe('B')
  })
  it('playerCount counts the host', () => {
    expect(playerCount({ confirmed_count: 2, max_players: 5 })).toBe('3/5')
    expect(playerCount({ max_players: 4 })).toBe('1/4')
  })
  it('isSessionFull includes the host seat', () => {
    expect(isSessionFull({ confirmed_count: 3, max_players: 4 })).toBe(true)
    expect(isSessionFull({ confirmed_count: 2, max_players: 4 })).toBe(false)
  })
  it('mapsLink prefers a pinned url', () => {
    expect(mapsLink('Jl. X', 'https://maps/pin')).toBe('https://maps/pin')
    expect(mapsLink('Jl. X')).toContain('query=Jl.%20X')
  })
  it('locationLabel joins region and area', () => {
    expect(locationLabel('Jakarta', 'Menteng')).toBe('Jakarta · Menteng')
    expect(locationLabel('Jakarta', '')).toBe('Jakarta')
    expect(locationLabel('', 'Menteng')).toBe('Menteng')
    expect(locationLabel('', '')).toBe('')
  })
  it('formatDuration reads humanely', () => {
    expect(formatDuration(0)).toBeNull()
    expect(formatDuration(null)).toBeNull()
    expect(formatDuration(60)).toBe('~1 hour')
    expect(formatDuration(120)).toBe('~2 hours')
    expect(formatDuration(360)).toBe('6+ hours')
    expect(formatDuration(500)).toBe('6+ hours')
  })
  it('dayLabel maps onto WEEKDAYS (0 = Sunday)', () => {
    expect(WEEKDAYS[0]).toBe('Sunday')
    expect(dayLabel(1)).toBe('Monday')
    expect(dayLabel('6')).toBe('Saturday')
    expect(dayLabel(9)).toBe('')
  })
  it('recurrenceLabel tags weekly vs one-time', () => {
    expect(recurrenceLabel({ recurrence: 'weekly' })).toBe('Weekly')
    expect(recurrenceLabel({ recurrence: 'one_time' })).toBe('One-time')
    expect(recurrenceLabel(null)).toBe('One-time')
  })
})

describe('nextWeeklyDate', () => {
  it('returns null for incomplete input', () => {
    expect(nextWeeklyDate('', '18:00')).toBeNull()
    expect(nextWeeklyDate(3, '')).toBeNull()
    expect(nextWeeklyDate(3, 'oops')).toBeNull()
  })

  it('lands on the requested weekday + time, strictly in the future', () => {
    for (let dow = 0; dow < 7; dow++) {
      const d = nextWeeklyDate(dow, '18:30')
      expect(d).toBeInstanceOf(Date)
      expect(d.getDay()).toBe(dow)
      expect(d.getHours()).toBe(18)
      expect(d.getMinutes()).toBe(30)
      expect(d.getTime()).toBeGreaterThan(Date.now())
      // never more than a week out
      expect(d.getTime() - Date.now()).toBeLessThanOrEqual(7 * 24 * 60 * 60_000 + 60_000)
    }
  })
})
