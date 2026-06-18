import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import { timeAgo } from '../lib/format'

export default function Conversation() {
  const { userId } = useParams()
  const { user } = useAuth()
  const [other, setOther] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const endRef = useRef(null)

  const markRead = useCallback(async () => {
    await supabase
      .from('direct_messages')
      .update({ read: true })
      .eq('sender_id', userId)
      .eq('recipient_id', user.id)
      .eq('read', false)
  }, [userId, user.id])

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      supabase.from('profiles').select('id, display_name, nickname, avatar_url').eq('id', userId).maybeSingle(),
      supabase
        .from('direct_messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${user.id})`)
        .order('created_at', { ascending: true }),
    ]).then(([prof, msgs]) => {
      if (!active) return
      setOther(prof.data ?? null)
      setMessages(msgs.data ?? [])
      setLoading(false)
      markRead()
    })

    const channel = supabase
      .channel('dm-' + userId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, (payload) => {
        const m = payload.new
        const inThread =
          (m.sender_id === user.id && m.recipient_id === userId) ||
          (m.sender_id === userId && m.recipient_id === user.id)
        if (!inThread) return
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
        if (m.recipient_id === user.id) markRead()
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [userId, user.id, markRead])

  // Scroll to the newest message after the DOM updates.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (e) => {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setText('')
    const { data } = await supabase
      .from('direct_messages')
      .insert({ sender_id: user.id, recipient_id: userId, body })
      .select('*')
      .single()
    if (data) setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data]))
  }

  if (user && userId === user.id) return <Navigate to="/messages" replace />
  if (loading) return <div className="spinner" aria-label="Loading" />

  const name = other?.nickname || other?.display_name || 'Player'

  return (
    <div className="container container-narrow">
      <Link to="/messages" className="muted" style={{ fontSize: 14 }}>← Messages</Link>
      <div className="row-between" style={{ marginTop: 12, marginBottom: 12 }}>
        <Link to={`/users/${userId}`} className="user-link" style={{ fontSize: 18 }}>
          <Avatar name={name} src={other?.avatar_url} size={36} />
          {name}
        </Link>
      </div>

      <div className="card">
        <div className="chat-thread">
          {messages.length === 0 ? (
            <p className="muted center" style={{ margin: 'auto' }}>Say hello 👋</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={'bubble ' + (m.sender_id === user.id ? 'me' : 'them')}>
                {m.body}
                <span className="bubble-time">{timeAgo(m.created_at)}</span>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        <form className="chat-input-row" onSubmit={send}>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            maxLength={2000}
          />
          <button className="btn btn-primary" type="submit" disabled={!text.trim()}>Send</button>
        </form>
      </div>
    </div>
  )
}
