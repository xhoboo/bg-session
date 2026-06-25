import { Component } from 'react'
import { reportError } from '../lib/sentry'

// App-wide error boundary. A render error anywhere below this would otherwise
// blank the whole screen; instead we show a small recoverable fallback and
// forward the error to Sentry (when configured). Kept as a class because React
// only supports error boundaries via the class lifecycle.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    reportError(error, { componentStack: info?.componentStack })
  }

  // Send the user back to a known-good route and force a fresh load, which
  // clears the broken component state.
  handleReload = () => {
    window.location.assign('/')
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="card error-boundary-card">
            <div className="error-boundary-emoji" aria-hidden="true">🎲</div>
            <h1>Something went wrong</h1>
            <p className="muted">
              An unexpected error stopped this page from loading. Reloading usually fixes it.
            </p>
            <button className="btn btn-primary" onClick={this.handleReload}>Reload App</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
