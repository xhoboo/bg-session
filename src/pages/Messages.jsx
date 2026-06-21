import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'
import Avatar from '../components/Avatar'
import { timeAgo } from '../lib/format'
import { ConversationListSkeleton } from '../components/Skeleton'

export default function Messages() {
  const { user } = useAuth()
  const { t } = useLang()
  const [convos, setConvos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: msgs } = await supabase
        .from('direct_messages')
        .select('*')
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false })

      const rows = msgs ?? []
      // Group by the other party; keep the latest message + count unread.
      const byOther = new Map()
      for (const m of rows) {
        const otherId = m.sender_id === user.id ? m.recipient_id : m.sender_id
        if (!byOther.has(otherId)) byOther.set(otherId, { otherId, last: m, unread: 0 })
        if (m.recipient_id === user.id && !m.read) byOther.get(otherId).unread += 1
      }

      // Hide conversations with people I've blocked.
      const { data: blocks } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', user.id)
      const blockedSet = new Set((blocks ?? []).map((b) => b.blocked_id))
      const list = [...byOther.values()].filter((c) => !blockedSet.has(c.otherId))
      if (list.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name, nickname, avatar_url')
          .in('id', list.map((c) => c.otherId))
        const pById = new Map((profs ?? []).map((p) => [p.id, p]))
        list.forEach((c) => { c.profile = pById.get(c.otherId) })
      }
      if (active) {
        setConvos(list)
        setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [user.id])

  if (loading) {
    return (
      <div className="container container-narrow">
        <h1>{t('Messages')}</h1>
        <p className="subtitle">{t('Your private chats with other players.')}</p>
        <ConversationListSkeleton />
      </div>
    )
  }

  return (
    <div className="container container-narrow">
      <h1>{t('Messages')}</h1>
      <p className="subtitle">{t('Your private chats with other players.')}</p>

      {convos.length === 0 ? (
        <div className="empty-state">
          <p>{t('No conversations yet.')}</p>
          <p className="muted">{t('Open someone’s profile and tap “Message” to start chatting.')}</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {convos.map((c) => {
            const name = c.profile?.nickname || c.profile?.display_name || 'Player'
            const mine = c.last.sender_id === user.id
            return (
              <Link to={`/messages/${c.otherId}`} key={c.otherId} className="conv-item">
                <Avatar name={name} src={c.profile?.avatar_url} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row-between">
                    <strong>{name}</strong>
                    <span className="muted" style={{ fontSize: 12 }}>{timeAgo(c.last.created_at)}</span>
                  </div>
                  <div className="conv-preview">{mine ? t('You: ') : ''}{c.last.body}</div>
                </div>
                {c.unread > 0 && <span className="bell-badge" style={{ position: 'static' }}>{c.unread > 9 ? '9+' : c.unread}</span>}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
