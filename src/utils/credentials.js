/**
 * Credentials management for StaticLaunch CLI
 * Stores API key and user info in ~/.staticlaunch/credentials.json
 */

import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'

/**
 * Get the credentials directory path
 */
function getConfigDir () {
  return join(homedir(), '.staticlaunch')
}

/**
 * Get the credentials file path
 */
function getCredentialsPath () {
  return join(getConfigDir(), 'credentials.json')
}

/**
 * Get the client token path (for anonymous tracking)
 */
function getClientTokenPath () {
  return join(getConfigDir(), 'client_token')
}

/**
 * Ensure config directory exists
 */
async function ensureConfigDir () {
  const dir = getConfigDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

/**
 * Get or create a persistent client token for anonymous tracking
 * This helps identify the same anonymous user across sessions
 */
export async function getClientToken () {
  await ensureConfigDir()
  const tokenPath = getClientTokenPath()

  try {
    if (existsSync(tokenPath)) {
      return readFile(tokenPath, 'utf-8')
    }
  } catch {
    // Token file corrupted, regenerate
  }

  // Generate new token
  const token = `cli_${randomBytes(16).toString('hex')}`
  await writeFile(tokenPath, token, 'utf-8')
  return token
}

/**
 * Get stored credentials
 * @returns {Promise<{apiKey: string, userId: string, email: string, tier: string} | null>}
 */
export async function getCredentials () {
  const filePath = getCredentialsPath()
  try {
    if (existsSync(filePath)) {
      const text = await readFile(filePath, 'utf-8')
      const data = JSON.parse(text)

      // Validate the structure
      if (data.apiKey) {
        return {
          apiKey: data.apiKey,
          apiSecret: data.apiSecret || null,
          userId: data.userId || null,
          email: data.email || null,
          tier: data.tier || 'free',
          savedAt: data.savedAt || null
        }
      }
    }
  } catch {
    // Corrupted or invalid JSON file
  }
  return null
}

/**
 * Save credentials
 * @param {object} credentials - Credentials to save
 */
export async function saveCredentials (credentials) {
  await ensureConfigDir()

  const data = {
    apiKey: credentials.apiKey,
    apiSecret: credentials.apiSecret || null,
    userId: credentials.userId || null,
    email: credentials.email || null,
    tier: credentials.tier || 'free',
    savedAt: new Date().toISOString()
  }

  await writeFile(getCredentialsPath(), JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * Delete stored credentials (logout)
 */
export async function clearCredentials () {
  const filePath = getCredentialsPath()
  try {
    if (existsSync(filePath)) {
      await unlink(filePath)
    }
  } catch {
    // File doesn't exist or can't be deleted
  }
}

/**
 * Check if user is logged in
 */
export async function isLoggedIn () {
  const creds = await getCredentials()
  return creds !== null && creds.apiKey !== null
}

/**
 * Get the API key for requests (falls back to public beta key)
 */
export async function getApiKey () {
  const creds = await getCredentials()
  return creds?.apiKey || process.env.STATICLAUNCH_API_KEY || 'public-beta-key'
}

/**
 * Get the API secret for requests
 */
export async function getApiSecret () {
  const creds = await getCredentials()
  return creds?.apiSecret || process.env.STATICLAUNCH_API_SECRET || null
}
