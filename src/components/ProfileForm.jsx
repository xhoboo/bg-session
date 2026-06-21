import { useState } from 'react'
import GameTagInput from './GameTagInput'
import AvatarUpload from './AvatarUpload'

// Explicit choices; an empty selection means "Prefer not to say".
const GENDERS = ['Male', 'Female', 'Other']

// Build the form state shape from a profile row (or empty for a new user).
export function profileToForm(p) {
  return {
    avatarUrl: p?.avatar_url || '',
    photoUrl: p?.photo_url || '',
    realName: p?.real_name || '',
    nickname: p?.nickname || p?.display_name || '',
    gender: p?.gender || '',
    domicile: p?.domicile || '',
    favoriteGames: p?.favorite_games || [],
    ownedGames: p?.owned_games || [],
  }
}

// Shared by the Onboarding and Profile pages. Collects the values and hands
// cleaned data (trimmed, empty rows dropped) to the parent via onSubmit.
export default function ProfileForm({ initial, submitLabel, busy, onSubmit }) {
  const [form, setForm] = useState(initial)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const setField = (key) => (val) => setForm((f) => ({ ...f, [key]: val }))

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({
      avatarUrl: form.avatarUrl,
      photoUrl: form.photoUrl,
      realName: form.realName.trim(),
      nickname: form.nickname.trim(),
      gender: form.gender,
      domicile: form.domicile,
      favoriteGames: form.favoriteGames.map((s) => s.trim()).filter(Boolean),
      ownedGames: form.ownedGames.map((s) => s.trim()).filter(Boolean),
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Public profile — visible to everyone */}
      <h2 className="section-title" style={{ marginTop: 0, marginBottom: 4 }}>Public profile</h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>Shown to everyone — on your profile and in sessions.</p>
      <div className="card">
        <AvatarUpload
          label="Avatar"
          value={form.avatarUrl}
          name={form.nickname}
          onChange={setField('avatarUrl')}
        />

        <div className="form-group">
          <label className="field-label" htmlFor="nickname">
            Nickname <span className="field-hint">— up to 20 chars; letters, numbers and . _ - only</span>
          </label>
          <input
            id="nickname"
            type="text"
            value={form.nickname}
            onChange={set('nickname')}
            placeholder="e.g. Andi"
            maxLength={20}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </div>

        <div className="form-group">
          <label className="field-label" htmlFor="domicile">
            Domicile <span className="field-hint">— optional</span>
          </label>
          <input id="domicile" type="text" value={form.domicile} onChange={set('domicile')} placeholder="e.g. Jakarta Pusat" />
        </div>

        <GameTagInput
          label="Favorite board games"
          hint="at least 1, up to 10 — type to search the catalog"
          items={form.favoriteGames}
          onChange={setField('favoriteGames')}
          max={10}
        />

        <GameTagInput
          label="Board games you own"
          hint="optional — it's fine to own none"
          items={form.ownedGames}
          onChange={setField('ownedGames')}
          max={30}
        />
      </div>

      {/* Confirmed participants only — shared once a session is confirmed */}
      <h2 className="section-title" style={{ marginBottom: 4 }}>
        Confirmed participants only <span className="field-hint">— optional</span>
      </h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>Only shared with players once a session is confirmed, so they can recognize you.</p>
      <div className="card">
        <AvatarUpload
          label="In-person photo"
          hint="recommended — so participants recognize you"
          value={form.photoUrl}
          name={form.nickname}
          onChange={setField('photoUrl')}
        />

        <div className="form-group">
          <label className="field-label" htmlFor="realName">Real name</label>
          <input id="realName" type="text" value={form.realName} onChange={set('realName')} placeholder="e.g. Andi Wijaya" />
        </div>

        <div className="form-group">
          <label className="field-label" htmlFor="gender">Gender</label>
          <select id="gender" value={form.gender} onChange={set('gender')}>
            <option value="">Prefer not to say</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      </div>

      <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ marginTop: 20 }}>
        {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
