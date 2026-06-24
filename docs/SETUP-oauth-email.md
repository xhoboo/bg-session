# BG Session — Google OAuth & Email Notification Setup

Your Supabase project ref: **`tylooqnsukrbxuangjbp`**
Supabase auth callback: **`https://tylooqnsukrbxuangjbp.supabase.co/auth/v1/callback`**

These are the two V1 features that need config/secrets you control. The app
code for both is already written and tested.

---

## 1. Google OAuth (~10 min)

### a. Create Google OAuth credentials
1. Go to https://console.cloud.google.com → create/select a project.
2. **APIs & Services → OAuth consent screen**: choose *External*, fill app name,
   support email, developer email. Save. (You can leave it in "Testing" mode and
   add your own Google account under *Test users* for now.)
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**:
     - `http://localhost:5173`
     - (later) your production URL
   - **Authorized redirect URIs**:
     - `https://tylooqnsukrbxuangjbp.supabase.co/auth/v1/callback`
4. Click Create and copy the **Client ID** and **Client Secret**.

### b. Enable in Supabase
1. Supabase Dashboard → **Authentication → Sign In / Providers → Google**.
2. Toggle **Enable**, paste **Client ID** and **Client Secret**, **Save**.
3. **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:5173`
   - **Redirect URLs** (add): `http://localhost:5173/auth/callback`
   - (later) add your production URLs too.

### c. Test
Open the app → **Continue with Google**. After consenting you land on
`/auth/callback` and get signed in. A `profiles` row is auto-created with your
Google name + avatar.

---

## 2. Email notifications (~15 min)

In-app notifications already work. This adds real emails on top, using
[Resend](https://resend.com) sent **directly from the database** — a trigger on
`notifications` (`send_notification_email()`, migrations `0003` + `0047`) posts to
Resend via the `pg_net` extension. No edge function or webhook to deploy.

### a. Resend
1. Sign up at https://resend.com.
2. For real sending, **add & verify your domain** (Domains → Add). For quick
   testing you can send *from* `onboarding@resend.dev` to your own email.
3. **API Keys → Create** → copy the key (`re_...`).

### b. Enable pg_net
Supabase Dashboard → **Database → Extensions** → enable **`pg_net`** (the trigger
uses `net.http_post` to call Resend asynchronously).

### c. Configure the trigger
The migrations create the trigger already; it reads its settings from the
`app_config` table. Add your keys (Dashboard → **SQL Editor**):

```sql
insert into app_config (key, value) values
  ('resend_api_key', 're_xxxxxxxx'),
  ('email_from',     'BG Session <onboarding@resend.dev>'),
  ('app_url',        'http://localhost:5173')
on conflict (key) do update set value = excluded.value;
```

### d. Test
Have one account request to join another account's session → the host should get
an email; on approve/reject the guest gets one. If `resend_api_key` is missing
the trigger no-ops (in-app notifications still work). Check delivery in the
**Resend dashboard → Logs** if an email doesn't arrive.

---

## 3. Before going to production
- Re-enable **Authentication → Providers → Email → Confirm email** (turned off
  for local testing).
- Add your production domain to **URL Configuration** and the Google OAuth
  origins/redirects.
- Set `APP_URL` secret to your production URL so email links point to the live site.
- Delete the `bgs.*@gmail.com` test users (Authentication → Users) — cascades
  remove their test sessions/requests/notifications.
