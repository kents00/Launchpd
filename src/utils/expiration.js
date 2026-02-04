/**
 * Parse a time string into milliseconds
 * Supports: 30m, 1h, 2h, 1d, 7d, etc.
 * Minimum: 30 minutes
 */

export const MIN_EXPIRATION_MS = 30 * 60 * 1000
export function parseTimeString (timeStr) {
  const regex = /^(\d+)([mhd])$/i
  const match = regex.exec(timeStr)

  if (!match) {
    throw new Error(
      'Invalid time format: "' + timeStr + '". Use format like 30m, 2h, 1d'
    )
  }

  const value = Number.parseInt(match[1], 10)
  const unit = match[2].toLowerCase()

  let ms
  switch (unit) {
    case 'm':
      ms = value * 60 * 1000
      break
    case 'h':
      ms = value * 60 * 60 * 1000
      break
    case 'd':
      ms = value * 24 * 60 * 60 * 1000
      break
    default:
      throw new Error('Unknown time unit: ' + unit)
  }

  // Minimum 30 minutes
  if (ms < MIN_EXPIRATION_MS) {
    throw new Error('Minimum expiration time is 30 minutes (30m)')
  }

  return ms
}

/**
 * Calculate expiration timestamp from a time string
 * @param {string} timeStr - Time string (e.g., "30m", "2h", "1d")
 * @returns {Date} Date object of expiration
 */
export function calculateExpiresAt (timeStr) {
  const ms = parseTimeString(timeStr)
  return new Date(Date.now() + ms)
}

/**
 * Format remaining time until expiration
 * @param {string} expiresAt - ISO timestamp
 * @returns {string} Human-readable time remaining
 */
export function formatTimeRemaining (expiresAt) {
  const now = Date.now()
  const expiry = new Date(expiresAt).getTime()
  const remaining = expiry - now

  if (remaining <= 0) {
    return 'expired'
  }

  const minutes = Math.floor(remaining / (60 * 1000))
  const hours = Math.floor(remaining / (60 * 60 * 1000))
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000))

  if (days > 0) {
    return '' + days + 'd ' + (hours % 24) + 'h remaining'
  } else if (hours > 0) {
    return '' + hours + 'h ' + (minutes % 60) + 'm remaining'
  } else {
    return '' + minutes + 'm remaining'
  }
}

/**
 * Check if a deployment has expired
 * @param {string} expiresAt - ISO timestamp or null
 * @returns {boolean}
 */
export function isExpired (expiresAt) {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() < Date.now()
}
