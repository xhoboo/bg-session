// Vercel Node function. Serves the SPA shell with per-session Open Graph tags
// injected, so a shared session link shows a rich "sneak peek" card (title,
// details, preview image) and an invite to join in chat apps. Real browsers
// still boot the React app as usual and ignore the tags.
//
// Mapped from /sessions/:id by vercel.json. Crawlers are anonymous, so it reads
// only the public `get_session_preview` RPC (migration 0044) — never the
// address. Supabase creds come from the project's existing env vars (Vercel
// exposes them to functions at runtime, VITE_ prefix and all).

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

const SITE_NAME = 'BG Session'
const DEFAULT_DESC = 'Host & join board game meetups in Indonesia.'

// Cache the built index.html per warm instance. A new deploy is a new instance,
// so the hashed asset tags inside it stay current.
let templateCache = null

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Asia/Jakarta wall-clock, matching the app's formatDateTime().
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

async function getTemplate(origin) {
  if (templateCache) return templateCache
  // /index.html is a real static file, so this isn't caught by the SPA rewrite.
  const r = await fetch(`${origin}/index.html`)
  if (!r.ok) throw new Error(`template ${r.status}`)
  templateCache = await r.text()
  return templateCache
}

async function getSession(id) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !id) return null
  try {
    const url = `${SUPABASE_URL}/rest/v1/rpc/get_session_preview?p_id=${encodeURIComponent(id)}`
    const r = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    })
    if (!r.ok) return null
    const rows = await r.json()
    return Array.isArray(rows) ? rows[0] ?? null : null
  } catch {
    return null
  }
}

// One game's public result, matched by its anchor slug (migration 0054).
async function getGameScore(id, anchor) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !id || !anchor) return null
  try {
    const url = `${SUPABASE_URL}/rest/v1/rpc/get_game_score_preview?p_session_id=${encodeURIComponent(id)}&p_anchor=${encodeURIComponent(anchor)}`
    const r = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    })
    if (!r.ok) return null
    const data = await r.json()
    return data && Array.isArray(data.plays) && data.plays.length ? data : null
  } catch {
    return null
  }
}

function teamLetter(n) {
  return String.fromCharCode(64 + Number(n))
}

// A one-line outcome for the latest play, used in the share description.
function winnerSummary(score) {
  const plays = score.plays || []
  const play = plays[plays.length - 1]
  if (!play) return 'Game result'
  if (play.mode === 'cooperative') return play.coop_won ? 'The table won' : 'The table lost'
  if (play.mode === 'team_score' || play.mode === 'team_winloss') {
    const wt = (play.teams || []).find((t) => t.is_winner)
    return wt ? `Team ${teamLetter(wt.team)} won${wt.score != null ? ` with ${wt.score}` : ''}` : 'Team game result'
  }
  const winners = (play.players || []).filter((p) => p.is_winner)
  if (winners.length) {
    const names = winners.map((w) => w.name).join(', ')
    const s = winners[0].score
    return `${names} won${s != null ? ` with ${s}` : ''}`
  }
  return 'Game result'
}

function buildScoreTags({ origin, id, anchor, score }) {
  const url = `${origin}/sessions/${encodeURIComponent(id)}/score?game=${encodeURIComponent(anchor)}`
  const game = score.game_name || 'Game result'
  const title = `🎲 ${game}${score.session_title ? ` · ${score.session_title}` : ''}`
  const desc = `${winnerSummary(score)} — see the full result on ${SITE_NAME}!`
  const image = `${origin}/api/session-image?id=${encodeURIComponent(id)}&game=${encodeURIComponent(anchor)}`

  return [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ].join('\n    ')
}

function buildTags({ origin, id, session }) {
  const url = `${origin}/sessions/${encodeURIComponent(id)}`
  let title = SITE_NAME
  let desc = DEFAULT_DESC
  let image = `${origin}/api/session-image`

  if (session) {
    const weekly = session.recurrence === 'weekly'
    title = `🎲 ${session.title}${weekly ? ' · Weekly' : ''}`

    const bits = []
    const when = fmtWhen(session.starts_at)
    if (when) bits.push(`🗓️ ${when}`)
    const loc = [session.region, session.area].filter(Boolean).join(' · ')
    if (loc) bits.push(`📍 ${loc}`)
    const players = (session.confirmed_count ?? 0) + 1
    const full = players >= session.max_players
    bits.push(`👥 ${players}/${session.max_players}${full ? ' · full' : ''}`)

    desc = `${bits.join(' · ')} — Join this board game session on ${SITE_NAME}!`
    image = `${origin}/api/session-image?id=${encodeURIComponent(id)}`
  }

  return [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ].join('\n    ')
}

export default async function handler(req, res) {
  const id = String(req.query?.id || '')
  const game = req.query?.game ? String(req.query.game) : ''
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const origin = `https://${host}`

  let html
  try {
    html = await getTemplate(origin)
  } catch {
    // Couldn't read the shell — bounce to the app so the link still works.
    res.statusCode = 302
    res.setHeader('Location', `/?s=${encodeURIComponent(id)}`)
    res.end()
    return
  }

  // Share-a-score link (/sessions/:id/score?game=…): if we can read the game's
  // result, build score-specific tags; otherwise fall back to the session card.
  let tags = null
  let titleTag = `<title>${SITE_NAME}</title>`
  if (game) {
    const score = await getGameScore(id, game)
    if (score) {
      tags = buildScoreTags({ origin, id, anchor: game, score })
      titleTag = `<title>${esc(`🎲 ${score.game_name} · ${SITE_NAME}`)}</title>`
    }
  }
  if (!tags) {
    const session = await getSession(id)
    tags = buildTags({ origin, id, session })
    titleTag = session ? `<title>${esc(`🎲 ${session.title} · ${SITE_NAME}`)}</title>` : `<title>${SITE_NAME}</title>`
  }

  // Drop the static OG/Twitter tags (we replace them) and set a fresh <title>.
  let out = html
    .replace(/<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*)"[^>]*>\s*/g, '')
    .replace(/<title>[\s\S]*?<\/title>/, titleTag)
    .replace('</head>', `    ${tags}\n  </head>`)

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // Cache briefly at the edge; previews refresh as a session fills up.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600')
  res.statusCode = 200
  res.end(out)
}
