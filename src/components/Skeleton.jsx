// Content-shaped loading placeholders. Instead of a lone spinner, we render a
// dim, shimmering outline of the layout that's about to appear — it reads as
// "almost there" and keeps the page from jumping when the real data lands.
//
// `Skeleton` is the primitive bar; the named presets below mimic specific
// screens (session list, session detail, etc.). All shimmer blocks are
// aria-hidden; the wrapper carries role="status" so screen readers still hear
// that something is loading.

export default function Skeleton({ width = '100%', height = 12, radius = 6, style, className = '' }) {
  return (
    <span
      className={`skeleton ${className}`.trim()}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  )
}

// One card matching SessionCard's shape (title + badges, date, meta row, host).
function SessionCardSkeleton() {
  return (
    <div className="card session-card" aria-hidden="true">
      <div className="row-between">
        <Skeleton width="55%" height={17} />
        <Skeleton width={120} height={22} radius={999} />
      </div>
      <Skeleton width="42%" height={13} />
      <div className="session-meta">
        <Skeleton width={88} height={22} radius={999} />
        <Skeleton width={70} height={13} />
        <Skeleton width={104} height={13} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Skeleton width={22} height={22} radius="50%" />
        <Skeleton width={130} height={13} />
      </div>
    </div>
  )
}

export function SessionListSkeleton({ count = 4 }) {
  return (
    <div className="stack" role="status" aria-label="Loading sessions">
      {Array.from({ length: count }).map((_, i) => (
        <SessionCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function SessionDetailSkeleton() {
  return (
    <div className="container container-narrow" role="status" aria-label="Loading session">
      <Skeleton width={110} height={14} />
      <div className="row-between" style={{ marginTop: 14 }}>
        <Skeleton width="55%" height={25} />
        <Skeleton width={130} height={22} radius={999} />
      </div>
      <Skeleton width="45%" height={14} style={{ marginTop: 12 }} />
      <div className="card" style={{ marginTop: 16 }}>
        <div className="stack">
          {Array.from({ length: 5 }).map((_, i) => (
            <div className="row-between" key={i}>
              <Skeleton width={70} height={13} />
              <Skeleton width={140} height={14} />
            </div>
          ))}
          <Skeleton width="100%" height={64} radius={12} style={{ marginTop: 4 }} />
        </div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <Skeleton width="40%" height={18} />
        <div className="spacer" />
        <Skeleton width="100%" height={80} radius={12} />
        <div className="spacer" />
        <Skeleton width="100%" height={46} radius={12} />
      </div>
    </div>
  )
}

// A few conversation rows for the Messages inbox.
export function ConversationListSkeleton({ count = 5 }) {
  return (
    <div className="card" style={{ padding: 0 }} role="status" aria-label="Loading conversations">
      {Array.from({ length: count }).map((_, i) => (
        <div className="conv-item" key={i} aria-hidden="true">
          <Skeleton width={44} height={44} radius="50%" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row-between">
              <Skeleton width="40%" height={14} />
              <Skeleton width={42} height={11} />
            </div>
            <Skeleton width="70%" height={13} style={{ marginTop: 8 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// Centered avatar + name + a couple of history cards for a profile page.
export function ProfileSkeleton() {
  return (
    <div role="status" aria-label="Loading profile">
      <div className="profile-view-head" aria-hidden="true">
        <Skeleton width={84} height={84} radius={28} />
        <Skeleton width={160} height={22} style={{ marginTop: 12 }} />
        <Skeleton width={110} height={13} style={{ marginTop: 6 }} />
      </div>
      <Skeleton width="45%" height={17} style={{ marginTop: 8 }} />
      <div className="stack" style={{ marginTop: 12 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <SessionCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
