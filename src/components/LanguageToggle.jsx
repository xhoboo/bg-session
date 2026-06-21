import { useLang } from '../lib/i18n'

// EN/ID switch that sits beside the theme toggle in the top bar. Shows the
// language you'd switch TO, mirroring how the theme toggle shows the icon of the
// theme it switches to.
export default function LanguageToggle() {
  const { lang, setLang, t } = useLang()
  return (
    <button
      className="icon-btn"
      onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
      aria-label={t('Switch language')}
      style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.02em' }}
    >
      {lang === 'id' ? 'EN' : 'ID'}
    </button>
  )
}
