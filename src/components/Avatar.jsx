import { useState } from 'react'

// Deterministic pleasant color from a name, used for the initials fallback.
function colorFromString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return `hsl(${Math.abs(h) % 360} 50% 45%)`
}

function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts.slice(0, 2).map((w) => w[0].toUpperCase()).join('')
}

// Shows the user's photo if available, otherwise a colored initials circle.
export default function Avatar({ name, src, size = 32 }) {
  const [failed, setFailed] = useState(false)
  const dim = { width: size, height: size }

  if (src && !failed) {
    return (
      <img
        className="avatar-img"
        src={src}
        alt=""
        width={size}
        height={size}
        style={dim}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <span
      className="avatar-fallback"
      style={{ ...dim, background: colorFromString(name || ''), fontSize: Math.round(size * 0.4) }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  )
}
