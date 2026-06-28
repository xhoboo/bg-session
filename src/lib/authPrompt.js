// Lightweight cross-component trigger for the guest auth popup (WelcomeModal).
// Any component (the FAB, a "Host a Session" CTA, …) can ask the modal to open
// without prop-drilling or a context provider — it just fires a window event the
// already-mounted WelcomeModal listens for.
export const AUTH_PROMPT_EVENT = 'bg:auth-prompt'

export const promptAuth = () => window.dispatchEvent(new Event(AUTH_PROMPT_EVENT))
