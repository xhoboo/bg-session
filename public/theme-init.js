// Apply the saved theme before first paint to avoid a flash of the wrong theme.
// Kept as an external file (not inline) so the Content-Security-Policy can use a
// strict `script-src 'self'` without needing 'unsafe-inline'.
(function () {
  try {
    var t = localStorage.getItem('bg-theme')
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t)
  } catch (e) {
    /* ignore */
  }
})()
