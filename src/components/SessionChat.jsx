import { useEffect, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import { timeAgo } from '../lib/format'
import { userPath } from '../lib/nickname'

// Group chat for a session, shown to confirmed participants (RLS-gated). Once
// the session is finished the thread becomes read-only history (`readOnly`).
export default function SessionChat({ sessionId, readOnly = false }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [authors, setAuthors] = useState({}) // userId -> profile
  const [text, setText] = useState('')
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
    setText('')
    const { data } = await supabase
      .from('session_messages')
      .insert({ session_id: sessionId, user_id: user.id, body })
      .select('*, author:profiles(id, display_name, nickname, avatar_url)')
      .single()
    if (data) {
      setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data]))
      if (data.author) {
        knownAuthors.current.add(data.user_id)
        setAuthors((p) => ({ ...p, [data.user_id]: data.author }))
      }
    }
  }

  return (
    <>
      <h2 className="section-title">Session chat</h2>
      <div className="card">
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
          <form className="chat-input-row" onSubmit={send}>
            <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message participants…" maxLength={2000} />
            <button className="btn btn-primary" type="submit" disabled={!text.trim()}>Send</button>
          </form>
        )}
      </div>
    </>
  )
}
