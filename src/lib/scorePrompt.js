// Lightweight cross-component trigger for the "score a game" picker popup
// (ScorePickerModal). The FAB fires this with the live session's id so the game
// chooser opens as a popup wherever the user happens to be — without first
// routing to the Game Results page.
export const SCORE_PROMPT_EVENT = 'bg:score-prompt'

export const promptScore = (sessionId) =>
  window.dispatchEvent(new CustomEvent(SCORE_PROMPT_EVENT, { detail: { sessionId } }))
