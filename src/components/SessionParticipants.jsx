import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'
import { userPath } from '../lib/nickname'
import Avatar from './Avatar'
import AccordionSection from './AccordionSection'

// The session's people (host + approved guests). Shown to every signed-in member
// — including ones who aren't in this session — so the base list comes from the
// public get_public_participants RPC (which any member can call), not a direct
// read of join_requests (that stays participant-only).
//
// The private "additional info" — real name + in-person photo, to help people
// recognize each other — is overlaid from profile_private, whose RLS returns it
// only to confirmed co-participants. So a non-participant simply sees the public
// display fields, with nothing private to hide on the client.
//
// `finished` switches the heading to "Participants" (a past session's record)
// from "Who's Coming" (an upcoming one). `embedded` renders the list as a
// collapsible section inside a finished session's history group (no standalone
// heading or outer frame — the accordion provides them).
export default function SessionParticipants({ sessionId, seriesId, finished, embedded = false }) {
  const { user } = useAuth()
  const { t } = useLang()
  const [people, setPeople] = useState([])
  const [cohostIds, setCohostIds] = useState(() => new Set())

  // For weekly occurrences, find which approved participants are co-hosts so we
  // can badge them. weekly_cohosts is readable to all authenticated users.
  useEffect(() => {
    if (!seriesId) {
      setCohostIds(new Set())
      return
    }
    let active = true
    supabase
      .from('weekly_cohosts')
      .select('user_id')
      .eq('series_id', seriesId)
      .then(({ data }) => {
        if (active) setCohostIds(new Set((data ?? []).map((r) => r.user_id)))
      })
    return () => {
      active = false
    }
  }, [seriesId])

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: pub } = await supabase.rpc('get_public_participants', { p_session_id: sessionId })
      // Host first, then approved guests.
      const list = (pub ?? [])
        .slice()
        .sort((a, b) => Number(b.is_host) - Number(a.is_host))
        .map((p) => ({ ...p, isHost: p.is_host }))

      const ids = list.map((p) => p.id)
      if (ids.length) {
        // Returns rows only for confirmed co-participants (profile_private RLS);
        // everyone else gets nothing extra here.
        const { data: priv } = await supabase
          .from('profile_private')
          .select('id, real_name, photo_url')
          .in('id', ids)
        const byId = new Map((priv ?? []).map((p) => [p.id, p]))
        list.forEach((p) => Object.assign(p, byId.get(p.id) ?? {}))
      }

      if (active) setPeople(list)
    })()
    return () => {
      active = false
    }
  }, [sessionId])

  if (people.length === 0) return null

  const list = (
    <div className={'participants-list' + (embedded ? ' participants-list-bare' : '')}>
      {people.map((p) => {
        const name = p.nickname || p.display_name || t('Player')
        const extras = [p.real_name].filter(Boolean)
        return (
          <div className="participant-card card" key={p.id}>
            <Avatar name={name} src={p.photo_url || p.avatar_url} size={52} />
            <div style={{ minWidth: 0 }}>
              <Link to={userPath(p.nickname || p.id)} className="user-link">
                {name}
                {p.isHost && <span className="badge badge-area">{t('Host')}</span>}
                {!p.isHost && cohostIds.has(p.id) && <span className="badge badge-cohost">{t('Co-host')}</span>}
                {p.id === user.id && <span className="muted" style={{ fontWeight: 400 }}>· {t('you')}</span>}
              </Link>
              {extras.length > 0 && (
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{extras.join(' · ')}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  if (embedded) {
    return (
      <AccordionSection title={t('Participants')} count={people.length} flush>
        {list}
      </AccordionSection>
    )
  }

  return (
    <>
      <h2 className="section-title">
        {finished ? t('Participants') : t("Who's Coming")} ({people.length})
      </h2>
      {list}
    </>
  )
}
