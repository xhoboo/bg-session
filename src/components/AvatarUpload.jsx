import { useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'

// Uploads an image to the "avatars" storage bucket (under the user's folder) and
// reports the resulting public URL via onChange. Upload happens immediately on
// selection; the URL is persisted to the profile when the parent form is saved.
export default function AvatarUpload({ value, name, onChange, label = 'Photo', hint }) {
  const { user } = useAuth()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    setError('')
    if (!file.type.startsWith('image/')) return setError('Please choose an image file.')
    if (file.size > 5 * 1024 * 1024) return setError('Image must be under 5 MB.')

    setBusy(true)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${user.id}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (upErr) {
      setBusy(false)
      return setError(upErr.message)
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    setBusy(false)
    onChange(data.publicUrl)
  }

  return (
    <div className="form-group">
      <label className="field-label">
        {label} {hint && <span className="field-hint">— {hint}</span>}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Avatar name={name} src={value} size={64} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? 'Uploading…' : value ? 'Change photo' : 'Upload photo'}
          </button>
          {value && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange('')} disabled={busy}>
              Remove
            </button>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
      </div>
      {error && <div className="alert alert-error" style={{ marginTop: 10, marginBottom: 0 }}>{error}</div>}
    </div>
  )
}
