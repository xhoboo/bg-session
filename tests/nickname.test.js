import { describe, it, expect } from 'vitest'
import { nicknameFormatError, userPath, NICKNAME_MAX, UUID_RE } from '../src/lib/nickname.js'

describe('nicknameFormatError', () => {
  it('rejects an empty nickname', () => {
    expect(nicknameFormatError('')).toMatch(/enter a nickname/i)
    expect(nicknameFormatError('   ')).toMatch(/enter a nickname/i)
  })
  it('rejects one that is too long', () => {
    expect(nicknameFormatError('a'.repeat(NICKNAME_MAX + 1))).toMatch(/characters or fewer/i)
  })
  it('rejects spaces and stray symbols', () => {
    expect(nicknameFormatError('has space')).toMatch(/letters, numbers/i)
    expect(nicknameFormatError('no!')).toMatch(/letters, numbers/i)
  })
  it('accepts letters, digits and . _ -', () => {
    expect(nicknameFormatError('Andi.123_x-y')).toBe('')
    expect(nicknameFormatError('  trimmed  ')).toBe('')
  })
})

describe('userPath', () => {
  it('encodes the handle', () => {
    expect(userPath('Andi')).toBe('/users/Andi')
    expect(userPath('a b')).toBe('/users/a%20b')
    expect(userPath('')).toBe('/users/')
  })
})

describe('UUID_RE', () => {
  it('matches a v4-style id and rejects a nickname', () => {
    expect(UUID_RE.test('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true)
    expect(UUID_RE.test('Andi')).toBe(false)
  })
})
