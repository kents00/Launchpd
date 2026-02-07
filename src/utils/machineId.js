import { createHash, randomBytes } from 'node:crypto'
import { hostname, platform, arch, userInfo } from 'node:os'
import { warning } from './logger.js'

/**
 * Generate a unique machine identifier based on system traits.
 * Uses SHA-256 to hash a combination of hostname, platform, architecture, and username.
 * This provides a persistent ID even if the IP address changes.
 *
 * @returns {string} Hex string of the machine ID hash
 */
export function getMachineId () {
  try {
    const parts = [hostname(), platform(), arch(), userInfo().username]

    const rawId = parts.join('|')
    return createHash('sha256').update(rawId).digest('hex')
  } catch (err) {
    // Fallback if userInfo() fails (e.g. restricted environments)
    // Use a random ID for this session, better than crashing
    warning(`Could not generate stable machine ID: ${err.message}`)
    const randomId = randomBytes(16).toString('hex')
    return `unknown-device-${randomId}`
  }
}
