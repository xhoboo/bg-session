import { describe, it, expect, beforeAll, afterAll } from 'vitest'

// ---------------------------------------------------------------------------
// Integration tests for the critical maintenance RPCs (roll_weekly_sessions,
// cancel_understaffed_sessions). These need a real Postgres connection, so they
// are SKIPPED unless SUPABASE_DB_URL is set:
//
//   SUPABASE_DB_URL="postgres://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres" npm test
//
// Grab the string from Supabase → Project Settings → Database → Connection
// string (use the direct/session connection, not the pooler, for transactions).
//
// SAFETY: everything runs inside a single transaction that is ROLLED BACK in
// afterAll, so these never persist anything to the database — even though
// roll/cancel mutate rows, nothing is committed.
// ---------------------------------------------------------------------------

const DB_URL = process.env.SUPABASE_DB_URL

describe.skipIf(!DB_URL)('critical maintenance RPCs (DB integration)', () => {
  let client

  beforeAll(async () => {
    const { default: pg } = await import('pg')
    client = new pg.Client({ connectionString: DB_URL })
    await client.connect()
    await client.query('begin')
  })

  afterAll(async () => {
    if (!client) return
    await client.query('rollback').catch(() => {})
    await client.end()
  })

  it('the functions exist with the expected names', async () => {
    const { rows } = await client.query(
      `select proname from pg_proc
        where proname in ('roll_weekly_sessions', 'cancel_understaffed_sessions', 'next_weekly_occurrence')`,
    )
    const names = rows.map((r) => r.proname)
    expect(names).toContain('roll_weekly_sessions')
    expect(names).toContain('cancel_understaffed_sessions')
  })

  it('cancel_understaffed_sessions runs without error', async () => {
    await expect(client.query('select cancel_understaffed_sessions()')).resolves.toBeTruthy()
  })

  it('roll_weekly_sessions runs and is idempotent (no new rows on a second call)', async () => {
    await client.query('select roll_weekly_sessions()')
    const first = await client.query('select count(*)::int as n from sessions')
    await client.query('select roll_weekly_sessions()')
    const second = await client.query('select count(*)::int as n from sessions')
    expect(second.rows[0].n).toBe(first.rows[0].n)
  })
})
