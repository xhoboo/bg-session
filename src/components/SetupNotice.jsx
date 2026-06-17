// Shown when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing so the app
// fails gracefully with actionable guidance instead of a blank screen.
export default function SetupNotice() {
  return (
    <div className="container container-narrow">
      <div className="spacer" />
      <h1>BG Session</h1>
      <p className="subtitle">Almost there — connect your Supabase project.</p>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Create a <code>.env</code> file in the project root (copy from{' '}
          <code>.env.example</code>) and add your Supabase credentials:
        </p>
        <pre
          style={{
            background: 'var(--slate-100)',
            padding: 14,
            borderRadius: 10,
            overflowX: 'auto',
            fontSize: 13,
          }}
        >
{`VITE_SUPABASE_URL=https://your-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
        </pre>
        <p className="muted" style={{ marginBottom: 0 }}>
          Then restart the dev server with <code>npm run dev</code>. See the
          README for the full schema + auth setup.
        </p>
      </div>
    </div>
  )
}
