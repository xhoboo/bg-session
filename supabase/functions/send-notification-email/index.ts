// ============================================================================
// send-notification-email
//
// Deployed as a Supabase Edge Function and wired to a Database Webhook that
// fires on INSERT into public.notifications. For every new in-app notification
// we look up the recipient's email and send a matching transactional email
// via Resend (https://resend.com).
//
// Deploy:
//   supabase functions deploy send-notification-email --no-verify-jwt
//
// Secrets (set in the dashboard or CLI):
//   supabase secrets set RESEND_API_KEY=re_xxx
//   supabase secrets set EMAIL_FROM="BG Session <notify@yourdomain.com>"
//   supabase secrets set APP_URL=https://your-app-url
//   # SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Database Webhook (Dashboard -> Database -> Webhooks):
//   Table: notifications   Events: INSERT   Type: Supabase Edge Function
//   Function: send-notification-email
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface NotificationRow {
  id: string
  user_id: string
  type: string
  title: string
  body: string
  session_id: string | null
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: NotificationRow
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'BG Session <onboarding@resend.dev>'
const APP_URL = Deno.env.get('APP_URL') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  try {
    const payload = (await req.json()) as WebhookPayload

    if (payload.table !== 'notifications' || payload.type !== 'INSERT') {
      return new Response('ignored', { status: 200 })
    }

    const note = payload.record

    // Look up the recipient's email via the Auth admin API.
    const { data: userData, error: userErr } = await admin.auth.admin.getUserById(note.user_id)
    if (userErr || !userData?.user?.email) {
      console.error('Could not resolve recipient email', userErr)
      return new Response('no recipient', { status: 200 })
    }
    const to = userData.user.email

    const ctaUrl = note.session_id && APP_URL
      ? `${APP_URL}/sessions/${note.session_id}`
      : APP_URL

    const html = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color:#0f766e; margin:0 0 8px;">${escapeHtml(note.title)}</h2>
        <p style="color:#334155; font-size:15px; line-height:1.5;">${escapeHtml(note.body)}</p>
        ${ctaUrl ? `<p style="margin-top:24px;">
          <a href="${ctaUrl}" style="background:#0f766e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block;">Open BG Session</a>
        </p>` : ''}
        <p style="color:#94a3b8;font-size:12px;margin-top:32px;">You received this because you use BG Session.</p>
      </div>`

    if (!RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set — skipping email send (in-app notification still delivered).')
      return new Response('email skipped (no api key)', { status: 200 })
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject: note.title, html }),
    })

    if (!res.ok) {
      console.error('Resend error', await res.text())
      return new Response('email failed', { status: 200 })
    }

    return new Response('sent', { status: 200 })
  } catch (err) {
    console.error('Unhandled error', err)
    return new Response('error', { status: 200 })
  }
})

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
