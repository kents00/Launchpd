/**
 * API Client for StaticLaunch Metadata API
 * Communicates with the Cloudflare Worker API endpoints
 */

import { config } from '../config.js'
import { getApiKey, getApiSecret } from './credentials.js'
import { createHmac } from 'node:crypto'
import { getMachineId } from './machineId.js'
import {
  APIError,
  MaintenanceError,
  AuthError,
  NetworkError,
  TwoFactorRequiredError
} from './errors.js'

const API_BASE_URL = config.apiUrl

// Re-export error classes for convenience
export {
  APIError,
  MaintenanceError,
  AuthError,
  NetworkError,
  TwoFactorRequiredError
} from './errors.js'

/**
 * Make an authenticated API request
 */
async function apiRequest (endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`

  const apiKey = await getApiKey()
  const apiSecret = await getApiSecret()
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
    'X-Device-Fingerprint': getMachineId(),
    ...options.headers
  }

  // Add HMAC signature if secret is available
  if (apiSecret) {
    const timestamp = Date.now().toString()
    const method = (options.method || 'GET').toUpperCase()
    const body = options.body || ''

    // HMAC-SHA256 for REQUEST SIGNING - this is NOT password hashing.
    // The request body (which may contain passwords) is signed to authenticate
    // the API request. Password hashing happens server-side using bcrypt/argon2.
    // skipcq: JS-D003 - HMAC-SHA256 is appropriate for request signing
    const hmac = createHmac('sha256', apiSecret)
    hmac.update(method)
    hmac.update(endpoint)
    hmac.update(timestamp)
    // skipcq: JS-D003 - Request body signing, not password storage
    hmac.update(body)

    const signature = hmac.digest('hex')

    headers['X-Timestamp'] = timestamp
    headers['X-Signature'] = signature
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers
    })

    // Handle maintenance mode (503 with maintenance_mode flag)
    if (response.status === 503) {
      const data = await response.json().catch(() => ({}))
      if (data.maintenance_mode) {
        throw new MaintenanceError(
          data.message || 'LaunchPd is under maintenance'
        )
      }
      throw new APIError(data.message || 'Service unavailable', 503, data)
    }

    // Handle authentication errors
    if (response.status === 401) {
      const data = await response.json().catch(() => ({}))
      // Check if 2FA is required (special case - not a real auth error)
      if (data.requires_2fa) {
        throw new TwoFactorRequiredError(data.two_factor_type, data.message)
      }
      throw new AuthError(data.message || 'Authentication failed', data)
    }

    // Handle rate limiting / quota errors
    if (response.status === 429) {
      const data = await response.json().catch(() => ({}))
      throw new APIError(data.message || 'Rate limit exceeded', 429, data)
    }

    const data = await response.json()

    if (!response.ok) {
      throw new APIError(
        data.error || data.message || `API error: ${response.status}`,
        response.status,
        data
      )
    }

    return data
  } catch (err) {
    // Re-throw our custom errors
    if (err instanceof APIError || err instanceof NetworkError) {
      throw err
    }
    // If API is unavailable, throw NetworkError for consistent handling
    if (
      err.message.includes('fetch failed') ||
      err.message.includes('ENOTFOUND') ||
      err.message.includes('ECONNREFUSED')
    ) {
      throw new NetworkError('Unable to connect to LaunchPd servers')
    }
    throw err
  }
}

/**
 * Get the next version number for a subdomain
 */
export async function getNextVersionFromAPI (subdomain) {
  const result = await apiRequest(`/api/versions/${subdomain}`)
  if (!result?.versions?.length) return 1
  const maxVersion = Math.max(...result.versions.map((v) => v.version))
  return maxVersion + 1
}

/**
 * Record a new deployment in the API
 */
export async function recordDeployment (deploymentData) {
  const {
    subdomain,
    folderName,
    fileCount,
    totalBytes,
    version,
    expiresAt,
    message
  } = deploymentData

  return await apiRequest('/api/deployments', {
    method: 'POST',
    body: JSON.stringify({
      subdomain,
      folderName,
      fileCount,
      totalBytes,
      version,
      cliVersion: config.version,
      expiresAt,
      message
    })
  })
}

/**
 * Get list of user's deployments
 */
export async function listDeployments (limit = 50, offset = 0) {
  return await apiRequest(`/api/deployments?limit=${limit}&offset=${offset}`)
}

/**
 * Get deployment details for a subdomain
 */
export async function getDeployment (subdomain) {
  return await apiRequest(`/api/deployments/${subdomain}`)
}

/**
 * Get version history for a subdomain
 */
export async function getVersions (subdomain) {
  return await apiRequest(`/api/versions/${subdomain}`)
}

/**
 * Rollback to a specific version
 */
export async function rollbackVersion (subdomain, version) {
  return await apiRequest(`/api/versions/${subdomain}/rollback`, {
    method: 'PUT',
    body: JSON.stringify({ version })
  })
}

/**
 * Check if a subdomain is available
 */
export async function checkSubdomainAvailable (subdomain) {
  const result = await apiRequest(`/api/public/check/${subdomain}`)
  return result?.available ?? true
}

/**
 * Reserve a subdomain
 */
export async function reserveSubdomain (subdomain) {
  return await apiRequest('/api/subdomains/reserve', {
    method: 'POST',
    body: JSON.stringify({ subdomain })
  })
}

/**
 * Unreserve a subdomain
 */
export async function unreserveSubdomain (subdomain) {
  // Note: Admin only, but good to have in client client lib
  return await apiRequest(`/api/admin/reserve-subdomain/${subdomain}`, {
    method: 'DELETE'
  })
}

/**
 * Get user's subdomains
 */
export async function listSubdomains () {
  return await apiRequest('/api/subdomains')
}

/**
 * Get current user info
 */
export async function getCurrentUser () {
  return await apiRequest('/api/users/me')
}

/**
 * Health check
 */
export async function healthCheck () {
  return await apiRequest('/api/health')
}

/**
 * Resend email verification
 */
export async function resendVerification () {
  return await apiRequest('/api/auth/resend-verification', {
    method: 'POST'
  })
}

/**
 * Regenerate API key
 */
export async function regenerateApiKey () {
  return await apiRequest('/api/api-key/regenerate', {
    method: 'POST',
    body: JSON.stringify({ confirm: 'yes' })
  })
}

/**
 * Change password
 */
export async function changePassword (
  currentPassword,
  newPassword,
  confirmPassword
) {
  return await apiRequest('/api/settings/change-password', {
    method: 'POST',
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword
    })
  })
}

/**
 * Server-side logout
 */
export async function serverLogout () {
  return await apiRequest('/api/auth/logout', {
    method: 'POST'
  })
}

export default {
  recordDeployment,
  listDeployments,
  getDeployment,
  getVersions,
  rollbackVersion,
  checkSubdomainAvailable,
  reserveSubdomain,
  unreserveSubdomain,
  listSubdomains,
  getCurrentUser,
  healthCheck,
  resendVerification,
  regenerateApiKey,
  changePassword,
  serverLogout
}
