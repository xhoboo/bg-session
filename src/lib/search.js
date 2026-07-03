// Word-by-word ILIKE helpers so multi-word searches match out of order:
// typing "ticket europe" should still find "Ticket to Ride: Europe". Every
// typed word must appear somewhere in the matched column, in any order.

// Escape LIKE/ILIKE wildcards so user input is matched literally.
const likeEscape = (s) => s.replace(/[\\%_]/g, '\\$&')

// Split a search term into escaped words (empty array for blank input).
const searchWords = (term) => term.trim().split(/\s+/).filter(Boolean).map(likeEscape)

// AND one ilike-per-word onto a PostgREST query builder.
export function ilikeWords(query, column, term) {
  for (const w of searchWords(term)) query = query.ilike(column, `%${w}%`)
  return query
}

// The same word matching across the two profile name columns, as a PostgREST
// `.or()` filter string: all words in nickname, or all words in display_name.
// Returns null when the term has no usable words. Callers must strip `,()`
// from the term first — those break PostgREST's or-string parsing.
export function profileNameOr(term) {
  const words = searchWords(term)
  if (!words.length) return null
  const all = (col) => words.map((w) => `${col}.ilike.%${w}%`).join(',')
  return `and(${all('nickname')}),and(${all('display_name')})`
}

// Client-side counterpart of ilikeWords, for lists already in memory: does
// every word of the term appear somewhere in the name?
export function matchesWords(name, term) {
  const n = name.toLowerCase()
  return term.toLowerCase().split(/\s+/).filter(Boolean).every((w) => n.includes(w))
}

// Client-side re-rank: results whose name starts with the typed term first,
// keeping the server's alphabetical order within each group (sort is stable).
export function prefixFirst(rows, term, getName = (r) => r.name) {
  const t = term.trim().toLowerCase()
  if (!t) return rows
  return [...rows].sort(
    (a, b) =>
      getName(b).toLowerCase().startsWith(t) - getName(a).toLowerCase().startsWith(t),
  )
}
