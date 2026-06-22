# BG Session 🎲

A platform for board game players in Indonesia to **host and join play sessions**.
Built with **React (Vite)** + **Supabase** (database, auth, realtime, email).

> V1 scope: auth, host a session, browse & filter by area, request/approve to
> join, private address revealed only to confirmed guests, plus email + in-app
> notifications. **No payments.**

---

## 1. Prerequisites

- Node.js 18+ and npm
- A free [Supabase](https://supabase.com) project
- (Optional, for emails) a free [Resend](https://resend.com) account

## 2. Local setup

```bash
npm install
cp .env.example .env   # then fill in your Supabase URL + anon key
npm run dev
```

Open http://localhost:5173. If the env vars are missing the app shows a setup
notice instead of crashing.

## 3. Database schema

In the Supabase dashboard open **SQL Editor → New query** and run each file in
[`supabase/migrations/`](supabase/migrations/) **in order**, from
`0001_init.sql` through the latest (`0023_…`). They're incremental. Later
migrations add richer profiles, private profile fields, avatar storage, ratings
& reviews, the board-game catalog, the regions/areas location model, session
chat, reminders, and online-presence (last-seen) tracking.

The base migration creates:

| Table | Purpose |
|-------|---------|
| `profiles` | Public display name/avatar, auto-created on signup |
| `sessions` | Public session info — **never** stores the address |
| `session_addresses` | Private address; RLS limits reads to host + approved guests |
| `join_requests` | Guest requests with `pending / approved / rejected` status |
| `notifications` | In-app inbox; also drives emails |

Row Level Security is enabled on every table. Notably, the **full address is in
its own table** so RLS can guarantee only the host and approved guests can read
it — the client can't simply ask for a hidden column.

In-app notifications are written by `SECURITY DEFINER` triggers when a request is
created or its status changes, and streamed to the bell icon via Supabase
Realtime.

## 4. Authentication

In the Supabase dashboard:

1. **Authentication → Providers → Email**: enable it. For the smoothest local
   testing you can turn *Confirm email* off (turn it back on for production).
2. **Authentication → Providers → Google**: enable and paste your Google OAuth
   client ID/secret (create them in the Google Cloud console). Set the authorized
   redirect URI to the value Supabase shows
   (`https://<ref>.supabase.co/auth/v1/callback`).
3. **Authentication → URL Configuration**: add your site URL
   (`http://localhost:5173`) and redirect URL (`http://localhost:5173/auth/callback`).

The app handles Google OAuth and email/password out of the box. New users get a
`profiles` row automatically.

## 5. Email notifications (optional but recommended)

In-app notifications work with zero extra setup. To also send **emails**:

1. Deploy the edge function:
   ```bash
   supabase functions deploy send-notification-email --no-verify-jwt
   supabase secrets set RESEND_API_KEY=re_xxx
   supabase secrets set EMAIL_FROM="BG Session <notify@yourdomain.com>"
   supabase secrets set APP_URL=https://your-deployed-app
   ```
2. Create a **Database Webhook** (Dashboard → Database → Webhooks):
   - Table: `notifications`, Events: **INSERT**
   - Type: **Supabase Edge Function** → `send-notification-email`

Every new in-app notification then triggers a matching email to the recipient.
Without `RESEND_API_KEY` the function no-ops gracefully and in-app notifications
still work.

## 6. Project structure

```
src/
  lib/            supabaseClient.js, format.js, useRegions.js,
                  useGameCatalog.js, useDebouncedCallback.js
  context/        AuthContext.jsx        (session + profile)
  components/     Layout, Navbar, BottomNav, NotificationBell, SettingsMenu,
                  ProfileForm/ProfileView, SessionForm/SessionCard,
                  SessionChat, StarRating, Avatar, …
  pages/          Login, Signup, AuthCallback, Onboarding, Browse,
                  Create/EditSession, SessionDetail, MySessions, Profile,
                  EditProfile, UserProfile, GameDetail, Messages, Conversation
supabase/
  migrations/     0001_init.sql … 0023_drop_domiciles.sql
  functions/      send-notification-email/
```

> Regions & areas (the Host form's location pickers and Browse filters) and the
> board-game catalog are data-driven from Supabase, managed out-of-band by a
> local-only admin tool — there's no hardcoded list in the source.

## 7. How the flows work

- **Host a session** (`/create`): saves public info to `sessions` and the address
  to `session_addresses`. Choose *Open* (instant confirm) or *Approval required*.
- **Browse** (`/`): lists upcoming sessions, filterable by area; shows confirmed
  player counts without leaking other guests' requests.
- **Request to join**: open sessions auto-confirm; approval sessions go to the
  host's queue. The host gets an in-app + email notification.
- **Approve / decline**: the guest gets notified; approval unlocks the address.

## 8. Build for production

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

Deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages). Remember
to set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` and update the Supabase
URL configuration + Google redirect URIs to your production domain.
