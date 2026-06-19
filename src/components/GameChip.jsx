import { Link } from 'react-router-dom'

// Renders one board-game chip. If the game exists in the catalog (matched
// case-insensitively via `catalog`, a Map from useGameCatalog) it's a clickable
// link showing the catalog's canonical spelling; otherwise it's a plain,
// non-clickable chip showing the stored name. `muted` keeps the lighter look
// used for "owned" games.
export default function GameChip({ name, catalog, loading, muted }) {
  const display = (name || '').trim()
  if (!display) return null

  const canonical = catalog.get(display.toLowerCase())
  const mutedCls = muted ? ' chip-muted' : ''

  // Still loading: render neutral and non-clickable so we don't flash a
  // "missing" style on games that are actually in the catalog.
  if (loading && !canonical) {
    return <span className={'chip' + mutedCls}>{display}</span>
  }

  if (canonical) {
    return (
      <Link to={`/games/${encodeURIComponent(canonical)}`} className={'chip chip-link' + mutedCls}>
        {canonical}
      </Link>
    )
  }

  return (
    <span className={'chip chip-disabled' + mutedCls} title="Not in the catalog yet">
      {display}
    </span>
  )
}
