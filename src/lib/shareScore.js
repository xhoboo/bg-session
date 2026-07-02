// Fires the native share sheet for a score link, falling back to the clipboard
// (then a prompt() if clipboard access also fails). Only the URL is shared — the
// link's own rich preview already shows the score, so a text recap would just
// duplicate it. Shared by ShareScoreButton (the score picker on a finished
// session) — the sole place a score link is handed out.
export async function shareOrCopy({ url, title, t, onDone, onCopied }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, url })
      onDone?.()
      return
    } catch (err) {
      if (err?.name === 'AbortError') { onDone?.(); return } // user closed the sheet
      // any other failure: fall through to clipboard
    }
  }

  try {
    await navigator.clipboard.writeText(url)
    onCopied?.()
  } catch {
    window.prompt(t('Copy this link:'), url)
    onDone?.()
  }
}
