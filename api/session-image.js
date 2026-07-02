// Vercel Edge function. Generates the 1200×630 "sneak peek" preview image used
// as og:image for a shared session link — a branded card with the session's
// title, when/where, players and host, plus a "Join this session" call-out.
// With &play=<uuid>, renders that play's result instead (the share-a-score
// preview).
//
// Called as /api/session-image?id=<uuid> (and with no id for a generic brand
// card). Reads only the public `get_session_preview` (migration 0044) and
// `get_public_session_plays` (migration 0063) RPCs; never the address. Colors
// mirror src/index.css.

import { ImageResponse } from '@vercel/og'
import { createElement } from 'react'

// Tiny hyperscript: spread array children as positional args so React/Satori
// doesn't warn about missing `key` props on our static element lists.
function h(type, props, children) {
  return Array.isArray(children) ? createElement(type, props, ...children) : createElement(type, props, children)
}

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

const CREAM = '#F4F1EA'
const SURFACE = '#FBF9F4'
const TERRA = '#C26B4A'
const TERRA_SOFT = '#F7E7DF'
const INK = '#2A2724'
const MUTED = '#8A8378'
const WHITE = '#FFFFFF'

function fmtWhen(iso) {
  try {
    return (
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso)) + ' WIB'
    )
  } catch {
    return ''
  }
}

async function getSession(id) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !id) return null
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_session_preview?p_id=${encodeURIComponent(id)}`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    )
    if (!r.ok) return null
    const rows = await r.json()
    return Array.isArray(rows) ? rows[0] ?? null : null
  } catch {
    return null
  }
}

// One play's public result, matched by its id — every play gets its own
// permanent URL now (migration 0063's guest-read RPC covers the data; no
// per-play SQL function needed). Also works out that play's replay position
// among same-named plays in the session ("Wingspan #2"). Names are the public
// NICKNAME only, never display_name — this card is visible to anyone.
async function getPlayScore(id, playId) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !id || !playId) return null
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_public_session_plays?p_session_id=${encodeURIComponent(id)}`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    )
    if (!r.ok) return null
    const plays = await r.json()
    if (!Array.isArray(plays)) return null
    const target = plays.find((p) => p.id === playId)
    if (!target) return null
    const sameGame = plays
      .filter((p) => (p.game_name || '').toLowerCase() === (target.game_name || '').toLowerCase())
      .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at))
    const nameOf = (s) => s.player?.nickname?.trim() || 'Player'
    return {
      game_name: target.game_name,
      replay_index: sameGame.findIndex((p) => p.id === playId) + 1,
      replay_total: sameGame.length,
      play: {
        mode: target.mode,
        lowest_wins: target.lowest_wins,
        coop_won: target.coop_won,
        teams: target.teams || [],
        players: (target.scores || []).map((s) => ({ name: nameOf(s), score: s.score, is_winner: s.is_winner, team: s.team })),
      },
    }
  } catch {
    return null
  }
}

// Team index → "A", "B", "C"… (matches teamLetter() in src/lib/format.js).
function teamLetter(n) {
  return String.fromCharCode(64 + Number(n))
}

// Initials avatar, mirroring src/components/Avatar.jsx's fallback. The card NEVER
// uses a real/uploaded/Google photo (the RPC doesn't even return avatar_url) — a
// public preview only ever shows this generated, name-derived circle.
function colorFromString(str) {
  let n = 0
  for (let i = 0; i < str.length; i++) n = str.charCodeAt(i) + ((n << 5) - n)
  return `hsl(${Math.abs(n) % 360} 50% 45%)`
}
function avatarCircle(name, size) {
  const s = String(name || '').trim()
  const initial = s ? s[0].toUpperCase() : '?'
  return h(
    'div',
    {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        width: size, height: size, borderRadius: 999, marginRight: 14,
        backgroundColor: colorFromString(s), color: WHITE,
        fontSize: Math.round(size * 0.44), fontWeight: 700,
      },
    },
    initial
  )
}

// A "● label" detail row.
function detailRow(text) {
  return h('div', { style: { display: 'flex', alignItems: 'center', marginTop: 20 } }, [
    h('div', {
      style: { width: 16, height: 16, borderRadius: 8, backgroundColor: TERRA, marginRight: 20, display: 'flex' },
    }),
    h('div', { style: { display: 'flex', fontSize: 34, color: INK } }, text),
  ])
}

function pill(text, { bg, color, size = 24 }) {
  return h(
    'div',
    {
      style: {
        display: 'flex',
        backgroundColor: bg,
        color,
        fontSize: size,
        fontWeight: 700,
        letterSpacing: 1,
        padding: '16px 34px',
        borderRadius: 999,
      },
    },
    text
  )
}

function card(session) {
  const titleRaw = session ? session.title : 'Board game meetups in Indonesia'
  const title = titleRaw.length > 62 ? titleRaw.slice(0, 61) + '…' : titleRaw
  const badge = session
    ? session.recurrence === 'weekly'
      ? 'WEEKLY SESSION'
      : 'BOARD GAME NIGHT'
    : 'BOARD GAMES'

  let rows
  if (session) {
    const r = []
    const when = fmtWhen(session.starts_at)
    if (when) r.push(detailRow(when))
    const loc = [session.region, session.area].filter(Boolean).join(' · ')
    if (loc) r.push(detailRow(loc))
    const players = (session.confirmed_count ?? 0) + 1
    const full = players >= session.max_players
    r.push(detailRow(`${players}/${session.max_players} players${full ? ' · full' : ''}`))
    rows = r
  } else {
    rows = [detailRow('Host or join a session near you'), detailRow('Jabodetabek & beyond')]
  }

  return h(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: CREAM,
        borderTop: `18px solid ${TERRA}`,
        padding: '70px 80px',
        fontFamily: 'sans-serif',
      },
    },
    [
      // Header: wordmark + badge
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
        h('div', { style: { display: 'flex', fontSize: 34, fontWeight: 700, color: TERRA, letterSpacing: 5 } }, 'BG SESSION'),
        pill(badge, { bg: TERRA_SOFT, color: TERRA, size: 24 }),
      ]),
      // Body: title + details
      h('div', { style: { display: 'flex', flexDirection: 'column' } }, [
        h('div', { style: { display: 'flex', fontSize: 70, fontWeight: 700, color: INK, lineHeight: 1.08 } }, title),
        h('div', { style: { display: 'flex', flexDirection: 'column', marginTop: 34 } }, rows),
      ]),
      // Footer: tagline + CTA (host intentionally omitted from the preview)
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
        h('div', { style: { display: 'flex', fontSize: 30, color: MUTED } }, 'Find your next table'),
        pill(session ? 'Join this session  →' : 'Browse sessions  →', { bg: TERRA, color: WHITE, size: 30 }),
      ]),
    ]
  )
}

// ---------------------------------------------------------------------------
// Score card — renders one game's result (the share-a-score preview).
// ---------------------------------------------------------------------------

// A standings line: name (left) + score (right). Winners get the terracotta tint
// and a "WIN" tag; team members render smaller and indented.
function scoreRow(name, score, winner, indent = false) {
  const nm = String(name || 'Player')
  const shortName = nm.length > 22 ? nm.slice(0, 21) + '…' : nm
  return h(
    'div',
    {
      style: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: indent ? '6px 18px 6px 34px' : '7px 20px', marginTop: 6, borderRadius: 14,
        backgroundColor: winner ? TERRA_SOFT : SURFACE,
        border: `2px solid ${winner ? TERRA : '#E7E2D8'}`,
      },
    },
    [
      h('div', { style: { display: 'flex', alignItems: 'center' } }, [
        avatarCircle(nm, indent ? 26 : 32),
        winner
          ? h('div', { style: { display: 'flex', backgroundColor: TERRA, color: WHITE, fontSize: 15, fontWeight: 700, letterSpacing: 1, padding: '3px 11px', borderRadius: 999, marginRight: 12 } }, 'WIN')
          : null,
        h('div', { style: { display: 'flex', fontSize: indent ? 24 : 26, fontWeight: winner ? 700 : 500, color: INK } }, shortName),
      ].filter(Boolean)),
      score != null
        ? h('div', { style: { display: 'flex', fontSize: indent ? 26 : 30, fontWeight: 700, color: winner ? TERRA : INK } }, String(score))
        : h('div', { style: { display: 'flex' } }, ''),
    ]
  )
}

function teamHeader(tm) {
  const winner = !!tm.is_winner
  return h(
    'div',
    {
      style: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '7px 20px', marginTop: 8, borderRadius: 14,
        backgroundColor: winner ? TERRA : '#EAE4DA',
      },
    },
    [
      h('div', { style: { display: 'flex', alignItems: 'center' } }, [
        h('div', { style: { display: 'flex', fontSize: 26, fontWeight: 700, color: winner ? WHITE : INK } }, `Team ${teamLetter(tm.team)}`),
        winner ? h('div', { style: { display: 'flex', fontSize: 16, fontWeight: 700, color: WHITE, marginLeft: 12, opacity: 0.9 } }, 'WINNER') : null,
      ].filter(Boolean)),
      tm.score != null
        ? h('div', { style: { display: 'flex', fontSize: 28, fontWeight: 700, color: winner ? WHITE : INK } }, String(tm.score))
        : h('div', { style: { display: 'flex' } }, ''),
    ]
  )
}

function coopBanner(won) {
  return h(
    'div',
    {
      style: {
        display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '12px',
        marginTop: 8, borderRadius: 14, backgroundColor: won ? TERRA : '#7A6F62',
        color: WHITE, fontSize: 30, fontWeight: 800, letterSpacing: 2,
      },
    },
    won ? 'THE TABLE WON' : 'THE TABLE LOST'
  )
}

function scoreCard(data) {
  const play = data?.play || { mode: 'individual_score', players: [], teams: [] }
  const players = Array.isArray(play.players) ? play.players : []
  const teams = Array.isArray(play.teams) ? play.teams : []
  const mode = play.mode

  const gameRaw = data?.replay_total > 1 ? `${data.game_name || 'Game result'} #${data.replay_index}` : (data?.game_name || 'Game result')
  const gameName = gameRaw.length > 38 ? gameRaw.slice(0, 37) + '…' : gameRaw
  const sessRaw = data?.session_title || ''
  const sessName = sessRaw.length > 52 ? sessRaw.slice(0, 51) + '…' : sessRaw

  // Build every result line, then cap to LIMIT so the card never overflows 630px:
  // up to LIMIT lines fit alongside the header/title/footer; past that, the last
  // slot becomes a "+N more" summary.
  const all = []
  if (mode === 'team_score' || mode === 'team_winloss') {
    const sortedTeams = teams.slice().sort((a, b) => (b.is_winner ? 1 : 0) - (a.is_winner ? 1 : 0) || a.team - b.team)
    for (const tm of sortedTeams) {
      all.push(teamHeader(tm))
      for (const mbr of players.filter((p) => p.team === tm.team)) all.push(scoreRow(mbr.name, mbr.score, false, true))
    }
  } else if (mode === 'cooperative') {
    all.push(coopBanner(!!play.coop_won))
    for (const p of players) all.push(scoreRow(p.name, p.score, false))
  } else {
    const ranked = players.slice().sort((a, b) => {
      if (!!a.is_winner !== !!b.is_winner) return a.is_winner ? -1 : 1
      if (a.score == null && b.score == null) return 0
      if (a.score == null) return 1
      if (b.score == null) return -1
      return play.lowest_wins ? a.score - b.score : b.score - a.score
    })
    for (const p of ranked) all.push(scoreRow(p.name, p.score, !!p.is_winner))
  }

  const LIMIT = 5
  let rows
  if (all.length <= LIMIT) {
    rows = all
  } else {
    rows = all.slice(0, LIMIT - 1)
    rows.push(h('div', { style: { display: 'flex', marginTop: 10, fontSize: 24, color: MUTED } }, `+${all.length - (LIMIT - 1)} more`))
  }

  const subtitle = sessName

  return h(
    'div',
    {
      style: {
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', backgroundColor: CREAM,
        borderTop: `18px solid ${TERRA}`, padding: '40px 64px', fontFamily: 'sans-serif',
      },
    },
    [
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
        h('div', { style: { display: 'flex', fontSize: 28, fontWeight: 700, color: TERRA, letterSpacing: 5 } }, 'BG SESSION'),
        pill('GAME RESULT', { bg: TERRA_SOFT, color: TERRA, size: 22 }),
      ]),
      h('div', { style: { display: 'flex', flexDirection: 'column' } }, [
        h('div', { style: { display: 'flex', fontSize: 46, fontWeight: 700, color: INK, lineHeight: 1.05 } }, gameName),
        subtitle ? h('div', { style: { display: 'flex', fontSize: 24, color: MUTED, marginTop: 6 } }, subtitle) : null,
      ].filter(Boolean)),
      h('div', { style: { display: 'flex', flexDirection: 'column' } }, rows),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
        h('div', { style: { display: 'flex', fontSize: 24, color: MUTED } }, 'Recorded on BG Session'),
        pill('See full results  →', { bg: TERRA, color: WHITE, size: 24 }),
      ]),
    ]
  )
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const playId = searchParams.get('play')

  // Share-a-score link: render the play's result if we can read it; otherwise
  // fall through to the normal session card.
  if (id && playId) {
    const [result, session] = await Promise.all([getPlayScore(id, playId), getSession(id)])
    if (result) {
      return new ImageResponse(scoreCard({ ...result, session_title: session?.title }), {
        width: 1200,
        height: 630,
        headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600' },
      })
    }
  }

  const session = id ? await getSession(id) : null

  return new ImageResponse(card(session), {
    width: 1200,
    height: 630,
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
