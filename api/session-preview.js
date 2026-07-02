// Vercel Edge function. Serves the SPA shell with per-session Open Graph tags
// injected, so a shared session link shows a rich "sneak peek" card (title,
// details, preview image) and an invite to join in chat apps. Real browsers
// still boot the React app as usual and ignore the tags.
//
// Runs on the Edge runtime (near-zero cold start) — the fastest possible
// response so a link's preview is ready the instant it's pasted, even for the
// very first share of a play. Mapped from /sessions/:id and /score/:playId by
// vercel.json. Crawlers are anonymous, so it reads only the public
// `get_session_preview` (migration 0044) and `get_public_play` (migration 0068)
// RPCs — never the address. Supabase creds come from the project's existing env
// vars (Vercel exposes them to functions at runtime, VITE_ prefix and all).

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

const SITE_NAME = 'BG Session'
const DEFAULT_DESC = 'Host & join board game meetups in Indonesia.'

// Link-preview crawlers (chat apps, social bots). They only read the <head>, so
// we serve them a tiny inline document and skip fetching the real index.html —
// one fewer network hop, so the preview is ready fast even on a cold start.
// That matters because chat apps build the preview on the SENDER's device before
// the message goes out: a slow response means "paste then send immediately" ships
// with no card. Real browsers (not matched here) still get the full app shell.
const CRAWLER_UA =
  /(facebookexternalhit|facebot|whatsapp|twitterbot|telegrambot|slackbot|slack-imgproxy|discordbot|linkedinbot|pinterest|redditbot|googlebot|bingbot|embedly|quora link preview|showyoubot|outbrain|vkshare|w3c_validator|skypeuripreview|line-poker|nuzzel|bitlybot|applebot|ia_archiver)/i
const isCrawler = (ua) => CRAWLER_UA.test(ua || '')

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

// One play's public result, matched by its globally-unique id — the owning
// session's title and the play's replay position ("Wingspan #2") come back in
// the same call (migration 0068), so the crawler makes just one Supabase round
// trip. Names are the public NICKNAME only, never display_name — this card is
// visible to anyone.
async function getPlayScore(playId) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !playId) return null
  try {
    const url = `${SUPABASE_URL}/rest/v1/rpc/get_public_play?p_play_id=${encodeURIComponent(playId)}`
    const r = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    })
    if (!r.ok) return null
    const d = await r.json()
    if (!d || !d.play) return null
    const nameOf = (s) => s.player?.nickname?.trim() || 'Player'
    return {
      gameName: d.play.game_name,
      sessionTitle: d.session_title,
      replayIndex: d.replay_index,
      replayTotal: d.replay_total,
      play: {
        mode: d.play.mode,
        coop_won: d.play.coop_won,
        teams: d.play.teams || [],
        players: (d.play.scores || []).map((s) => ({ name: nameOf(s), score: s.score, is_winner: s.is_winner })),
      },
    }
  } catch {
    return null
  }
}

function teamLetter(n) {
  return String.fromCharCode(64 + Number(n))
}

// A one-line outcome for the play, used in the share description.
function winnerSummary(play) {
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

function buildScoreTags({ origin, playId, gameName, sessionTitle, replayIndex, replayTotal, play }) {
  const url = `${origin}/score/${encodeURIComponent(playId)}`
  const game = replayTotal > 1 ? `${gameName} #${replayIndex}` : (gameName || 'Game result')
  const title = `🎲 ${game}${sessionTitle ? ` · ${sessionTitle}` : ''}`
  const desc = `${winnerSummary(play)} — see the full result on ${SITE_NAME}!`
  const image = `${origin}/api/session-image?play=${encodeURIComponent(playId)}`

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

export default async function handler(req) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') || ''
  const playId = searchParams.get('play') || ''
  const ua = req.headers.get('user-agent') || ''
  const crawler = isCrawler(ua)
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const origin = `https://${host}`

  // Cache briefly at the edge; previews refresh as a session fills up. Vary on
  // UA so the crawler's minimal doc and the browser's full shell never get
  // cross-served from the shared cache.
  const baseHeaders = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    Vary: 'User-Agent',
  }

  // The preview data (one round trip). For a real browser we also need the app
  // shell — fetched in parallel; a crawler skips it entirely (see CRAWLER_UA).
  let html, result, session
  try {
    ;[html, result, session] = await Promise.all([
      crawler ? Promise.resolve(null) : getTemplate(origin),
      playId ? getPlayScore(playId) : Promise.resolve(null),
      !playId && id ? getSession(id) : Promise.resolve(null),
    ])
  } catch {
    // Couldn't read the shell (real-browser path only) — bounce to the app so
    // the link still works.
    return new Response(null, { status: 302, headers: { Location: `/?s=${encodeURIComponent(id)}` } })
  }

  // Share-a-score link (/score/:playId): if we can read the play's result,
  // build score-specific tags; otherwise fall back to the session card.
  let tags = null
  let titleTag = `<title>${SITE_NAME}</title>`
  if (result) {
    tags = buildScoreTags({ origin, playId, ...result })
    const label = result.replayTotal > 1 ? `${result.gameName} #${result.replayIndex}` : result.gameName
    titleTag = `<title>${esc(`🎲 ${label} · ${SITE_NAME}`)}</title>`
  }
  if (!tags) {
    tags = buildTags({ origin, id, session })
    titleTag = session ? `<title>${esc(`🎲 ${session.title} · ${SITE_NAME}`)}</title>` : `<title>${SITE_NAME}</title>`
  }

  // Crawler: minimal head-only document, no index.html fetch — nothing to slow
  // the response, so the rich card is ready before "send".
  if (crawler) {
    return new Response(
      `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    ${titleTag}\n    ${tags}\n  </head>\n  <body></body>\n</html>\n`,
      { status: 200, headers: baseHeaders },
    )
  }

  // Real browser: the full app shell with the static OG/Twitter tags dropped
  // (we replace them) and a fresh <title>.
  const out = html
    .replace(/<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*)"[^>]*>\s*/g, '')
    .replace(/<title>[\s\S]*?<\/title>/, titleTag)
    .replace('</head>', `    ${tags}\n  </head>`)
  return new Response(out, { status: 200, headers: baseHeaders })
}
