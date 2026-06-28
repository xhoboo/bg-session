// Lightweight cross-component trigger for the "Host a session" type chooser
// popup (CreateSessionModal). The FAB and any "Host a Session" CTA fire this
// window event instead of navigating to a chooser page, so the One-Time /
// Weekly choice shows up as a popup wherever it's invoked from.
export const CREATE_PROMPT_EVENT = 'bg:create-prompt'

export const promptCreate = () => window.dispatchEvent(new Event(CREATE_PROMPT_EVENT))
