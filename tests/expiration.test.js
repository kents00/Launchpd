import { describe, it, expect } from 'vitest'
import {
  parseTimeString,
  calculateExpiresAt,
  formatTimeRemaining,
  isExpired
} from '../src/utils/expiration.js'

describe('expiration utils', () => {
  describe('parseTimeString', () => {
    it('parses minutes correctly', () => {
      expect(parseTimeString('30m')).toBe(30 * 60 * 1000)
      expect(parseTimeString('60m')).toBe(60 * 60 * 1000)
    })

    it('parses hours correctly', () => {
      expect(parseTimeString('1h')).toBe(60 * 60 * 1000)
      expect(parseTimeString('2h')).toBe(2 * 60 * 60 * 1000)
    })

    it('parses days correctly', () => {
      expect(parseTimeString('1d')).toBe(24 * 60 * 60 * 1000)
      expect(parseTimeString('7d')).toBe(7 * 24 * 60 * 60 * 1000)
    })

    it('throws on invalid format', () => {
      expect(() => parseTimeString('invalid')).toThrow()
      expect(() => parseTimeString('30')).toThrow()
      expect(() => parseTimeString('m30')).toThrow()
    })

    it('throws if less than 30 minutes', () => {
      expect(() => parseTimeString('29m')).toThrow(
        'Minimum expiration time is 30 minutes'
      )
      expect(() => parseTimeString('15m')).toThrow()
    })
  })

  describe('calculateExpiresAt', () => {
    it('returns ISO string in the future', () => {
      const result = calculateExpiresAt('1h')
      const expiry = new Date(result).getTime()
      const now = Date.now()

      // Should be roughly 1 hour from now (within 1 second tolerance)
      expect(expiry - now).toBeGreaterThan(59 * 60 * 1000)
      expect(expiry - now).toBeLessThan(61 * 60 * 1000)
    })
  })

  describe('formatTimeRemaining', () => {
    it('formats days and hours', () => {
      // Add buffer to account for test execution time
      const future = new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000 + 60000
      ).toISOString()
      const result = formatTimeRemaining(future)
      expect(result).toContain('2d')
    })

    it('formats hours and minutes', () => {
      const future = new Date(
        Date.now() + 3 * 60 * 60 * 1000 + 60000
      ).toISOString()
      const result = formatTimeRemaining(future)
      expect(result).toContain('3h')
    })

    it('formats minutes only', () => {
      const future = new Date(
        Date.now() + 45 * 60 * 1000 + 60000
      ).toISOString()
      const result = formatTimeRemaining(future)
      expect(result).toContain('m remaining')
    })

    it('returns expired for past dates', () => {
      const past = new Date(Date.now() - 1000).toISOString()
      expect(formatTimeRemaining(past)).toBe('expired')
    })
  })

  describe('isExpired', () => {
    it('returns false for null', () => {
      expect(isExpired(null)).toBe(false)
    })

    it('returns false for future dates', () => {
      const future = new Date(Date.now() + 1000).toISOString()
      expect(isExpired(future)).toBe(false)
    })

    it('returns true for past dates', () => {
      const past = new Date(Date.now() - 1000).toISOString()
      expect(isExpired(past)).toBe(true)
    })
  })
})
