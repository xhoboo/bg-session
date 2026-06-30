import { useEffect, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import { timeAgo } from '../lib/format'
import { userPath } from '../lib/nickname'
import AccordionSection from './AccordionSection'

// Group chat for a session, shown to confirmed participants (RLS-gated). Once
// the session is finished the thread becomes read-only history (`readOnly`).
// `embedded` renders the thread as a collapsible section inside a finished
// session's history group (no standalone heading or card frame).
export default function SessionChat({ sessionId, readOnly = false, embedded = false }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [authors, setAuthors] = useState({}) // userId -> profile
  const [text, setText] = useState('')
  const [sendError, setSendError] = useState('')
  const endRef = useRef(null)
  const knownAuthors = useRef(new Set()) // uids already fetched/cached

  // Fetch a message author's public profile once and cache it.
  const ensureAuthor = useCallback(async (uid) => {
    if (!uid || knownAuthors.current.has(uid)) return
    knownAuthors.current.add(uid)
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, nickname, avatar_url')
      .eq('id', uid)
      .maybeSingle()
    if (data) setAuthors((prev) => ({ ...prev, [uid]: data }))
  }, [])

  useEffect(() => {
    let active = true
    supabase
      .from('session_messages')
      .select('*, author:profiles(id, display_name, nickname, avatar_url)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!active) return
        const rows = data ?? []
        const map = {}
        rows.forEach((m) => {
          if (m.author) {
            map[m.user_id] = m.author
            knownAuthors.current.add(m.user_id)
          }
        })
        setAuthors(map)
        setMessages(rows)
      })

    const channel = supabase
      .channel('session-chat-' + sessionId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'session_messages', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const m = payload.new
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
          ensureAuthor(m.user_id)
        },
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [sessionId, ensureAuthor])

  // Scroll to the newest message after the DOM updates.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (e) => {
    e.preventDefault()
    if (readOnly) return
    const body = text.trim()
    if (!body) return
    setSendError('')
    // Keep the text until the insert succeeds, so a rejected send (e.g. the
    // rate-limit trigger in migration 0052) doesn't lose what was typed.
    const { data, error } = await supabase
      .from('session_messages')
      .insert({ session_id: sessionId, user_id: user.id, body })
      .select('*, author:profiles(id, display_name, nickname, avatar_url)')
      .single()
    if (error) {
      setSendError(error.code === '53400'
        ? 'You’re sending messages too quickly. Wait a moment and try again.'
        : 'Couldn’t send your message. Please try again.')
      return
    }
    setText('')
    if (data) {
      setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data]))
      if (data.author) {
        knownAuthors.current.add(data.user_id)
        setAuthors((p) => ({ ...p, [data.user_id]: data.author }))
      }
    }
  }

  const body = (
    <>
      <div className="chat-thread">
          {messages.length === 0 ? (
            <p className="muted center" style={{ margin: 'auto' }}>No messages yet — start the conversation.</p>
          ) : (
            messages.map((m) => {
              const mine = m.user_id === user.id
              const author = m.author || authors[m.user_id]
              const name = author?.nickname || author?.display_name || 'Player'
              return (
                <div key={m.id} className={'chat-msg ' + (mine ? 'me' : 'them')}>
                  {!mine && <Avatar name={name} src={author?.avatar_url} size={28} />}
                  <div className={'bubble ' + (mine ? 'me' : 'them')}>
                    {!mine && (
                      <Link to={userPath(author?.nickname || m.user_id)} className="bubble-author">{name}</Link>
                    )}
                    {m.body}
                    <span className="bubble-time">{timeAgo(m.created_at)}</span>
                  </div>
                </div>
              )
            })
          )}
          <div ref={endRef} />
        </div>

        {readOnly ? (
          <p className="muted center" style={{ margin: '12px 0 0', fontSize: 13 }}>
            This session has ended — chat is now read-only.
          </p>
        ) : (
          <>
            <form className="chat-input-row" onSubmit={send}>
              <input type="text" value={text} onChange={(e) => { setText(e.target.value); if (sendError) setSendError('') }} placeholder="Message participants…" maxLength={2000} />
              <button className="btn btn-primary" type="submit" disabled={!text.trim()}>Send</button>
            </form>
            {sendError && (
              <p className="center" style={{ color: 'var(--red-600)', fontSize: 13, marginTop: 8, marginBottom: 0 }}>{sendError}</p>
            )}
          </>
        )}
    </>
  )

  if (embedded) {
    return <AccordionSection title="Session Chat">{body}</AccordionSection>
  }

  return (
    <>
      <h2 className="section-title">Session Chat</h2>
      <div className="card">{body}</div>
    </>
  )
}
