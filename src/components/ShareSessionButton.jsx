import { useState } from 'react'
import { formatDateTime, formatDuration, locationLabel, mapsLink } from '../lib/format'
import { useLang } from '../lib/i18n'

// Share a session's details outward — mainly so a player can tell a friend
// "here's where I'll be tonight" before heading to a stranger's place. Uses the
// native share sheet (mobile + supported browsers) and falls back to copying to
// the clipboard.
//
// When `address` is provided (the viewer is the host or an approved guest, so
// RLS returned the full address), it's folded into the message — that's the
// whole point of the safety use case. For anyone just browsing, only the public
// listing details + link are shared.
export default function ShareSessionButton({ session, address, hostName, label = '🔗 Share', className = 'btn btn-secondary btn-sm' }) {
  const { t } = useLang()
  const [copied, setCopied] = useState(false)

  const buildText = () => {
    const lines = [`🎲 ${session.title}`, `🗓️ ${formatDateTime(session.starts_at)}`]
    const dur = formatDuration(session.duration_minutes)
    if (dur) lines.push(`⏱️ ${dur}`)
    const loc = locationLabel(session.region, session.area)
    if (loc) lines.push(`📍 ${loc}`)
    if (hostName) lines.push(`👤 Host: ${hostName}`)
    if (address?.full_address) {
      lines.push(`🏠 ${address.full_address}`)
      lines.push(`🗺️ ${mapsLink(address.full_address, address.maps_url)}`)
    }
    return lines.join('\n')
  }

  const onShare = async () => {
    const text = buildText()
    const url = window.location.href
    const shareData = { title: `BG Session — ${session.title}`, text, url }

    // Native share sheet first (Android/iOS, some desktop browsers).
    if (navigator.share) {
      try {
        await navigator.share(shareData)
        return
      } catch (err) {
        if (err?.name === 'AbortError') return // user closed the sheet — done
        // any other failure: fall through to clipboard
      }
    }

    // Fallback: copy the message + link.
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (e.g. insecure context): show the text so it can be
      // copied by hand rather than failing silently.
      window.prompt('Copy these session details:', `${text}\n${url}`)
    }
  }

  return (
    <button type="button" className={className} onClick={onShare}>
      {copied ? t('✓ Copied') : t(label)}
    </button>
  )
}
