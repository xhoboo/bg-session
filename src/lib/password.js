// Shared password policy for sign-up and password reset. A password must be at
// least 8 characters and mix an upper-case letter, a lower-case letter, and a
// digit. Kept in one place so both forms (and any future ones) stay in sync.
export const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/

export function isStrongPassword(pw) {
  return PASSWORD_RE.test(pw || '')
}
