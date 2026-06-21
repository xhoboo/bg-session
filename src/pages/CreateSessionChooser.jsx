import { Link } from 'react-router-dom'

// Shown when the user taps "+" / "Host a session". Picks between a one-off
// meetup and a recurring weekly session.
export default function CreateSessionChooser() {
  return (
    <div className="container container-narrow">
      <h1>Host a session</h1>
      <p className="subtitle">Choose how you want to host.</p>

      <div className="choice-grid">
        <Link to="/create/one-time" className="card choice-card">
          <span className="choice-emoji" aria-hidden="true">🎲</span>
          <div>
            <div className="choice-title">One-time session</div>
            <div className="choice-desc">A single meetup on a specific date and time.</div>
          </div>
        </Link>

        <Link to="/create/weekly" className="card choice-card">
          <span className="choice-emoji" aria-hidden="true">🔁</span>
          <div>
            <div className="choice-title">Weekly session</div>
            <div className="choice-desc">
              Repeats every week on the day you pick. You keep your co-hosts; players and board games
              reset each week and roll forward to the next date automatically.
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
