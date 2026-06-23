// Vercel Edge function. Generates the 1200×630 "sneak peek" preview image used
// as og:image for a shared session link — a branded card with the session's
// title, when/where, players and host, plus a "Join this session" call-out.
//
// Called as /api/session-image?id=<uuid> (and with no id for a generic brand
// card). Reads only the public `get_session_preview` RPC (migration 0044);
// never the address. Colors mirror src/index.css.

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

export default async function handler(req) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const session = id ? await getSession(id) : null

  return new ImageResponse(card(session), {
    width: 1200,
    height: 630,
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
