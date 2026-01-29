/**
 * Metadata utilities for Launchpd CLI
 * All operations now go through the API proxy
 */

import { config } from '../config.js'

const API_BASE_URL = config.apiUrl

/**
 * Get API key for requests
 */
function getApiKey () {
  return process.env.STATICLAUNCH_API_KEY || 'public-beta-key'
}

/**
 * Make an authenticated API request
 */
async function apiRequest (endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`

  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': getApiKey(),
    ...options.headers
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || `API error: ${response.status}`)
    }

    return data
  } catch (err) {
    if (
      err.message.includes('fetch failed') ||
      err.message.includes('ENOTFOUND')
    ) {
      return null
    }
    throw err
  }
}

/**
 * Record a deployment to the API
 * @param {string} subdomain - Deployed subdomain
 * @param {string} folderPath - Original folder path
 * @param {number} fileCount - Number of files deployed
 * @param {number} totalBytes - Total bytes uploaded
 * @param {number} version - Version number for this deployment
 * @param {Date|null} expiresAt - Expiration date, or null for no expiration
 */
export async function recordDeploymentInMetadata (
  subdomain,
  folderPath,
  fileCount,
  totalBytes = 0,
  version = 1,
  expiresAt = null
) {
  const folderName = folderPath.split(/[\\/]/).pop() || 'unknown'

  return await apiRequest('/api/deployments', {
    method: 'POST',
    body: JSON.stringify({
      subdomain,
      folderName,
      fileCount,
      totalBytes,
      version,
      cliVersion: config.version,
      expiresAt: expiresAt?.toISOString() || null
    })
  })
}

/**
 * List all deployments for the current user
 * @returns {Promise<Array>} Array of deployment records
 */
export async function listDeploymentsFromR2 () {
  const result = await apiRequest('/api/deployments')
  return result?.deployments || []
}

/**
 * Get the next version number for a subdomain
 * @param {string} subdomain - The subdomain to check
 * @returns {Promise<number>} Next version number
 */
export async function getNextVersion (subdomain) {
  const result = await apiRequest(`/api/versions/${subdomain}`)

  if (!result || !result.versions || result.versions.length === 0) {
    return 1
  }

  const maxVersion = Math.max(...result.versions.map((v) => v.version))
  return maxVersion + 1
}

/**
 * Get all versions for a specific subdomain
 * @param {string} subdomain - The subdomain to get versions for
 * @returns {Promise<Array>} Array of deployment versions
 */
export async function getVersionsForSubdomain (subdomain) {
  const result = await apiRequest(`/api/versions/${subdomain}`)
  return result?.versions || []
}

/**
 * Set the active version for a subdomain (rollback)
 * @param {string} subdomain - The subdomain
 * @param {number} version - Version to make active
 */
export async function setActiveVersion (subdomain, version) {
  return await apiRequest(`/api/versions/${subdomain}/rollback`, {
    method: 'PUT',
    body: JSON.stringify({ version })
  })
}

/**
 * Get the active version for a subdomain
 * @param {string} subdomain - The subdomain
 * @returns {Promise<number>} Active version number
 */
export async function getActiveVersion (subdomain) {
  const result = await apiRequest(`/api/versions/${subdomain}`)
  return result?.activeVersion || 1
}

/**
 * Copy files from one version to another (for rollback)
 * Note: This is now handled server-side by the API
 * @param {string} subdomain - The subdomain
 * @param {number} fromVersion - Source version
 * @param {number} toVersion - Target version
 */
export function copyVersionFiles (subdomain, fromVersion, toVersion) {
  // Rollback is now handled by setActiveVersion - no need to copy files
  // The worker serves files from the specified version directly
  return Promise.resolve({ fromVersion, toVersion, note: 'Handled by API' })
}

/**
 * List all files for a specific version
 * @param {string} subdomain - The subdomain
 * @param {number} version - Version number
 * @returns {Promise<Array>} Array of file info
 */
export async function listVersionFiles (subdomain, version) {
  const result = await apiRequest(`/api/deployments/${subdomain}`)

  if (!result || !result.versions) {
    return []
  }

  const versionInfo = result.versions.find((v) => v.version === version)
  return versionInfo
    ? [
        {
          version,
          fileCount: versionInfo.file_count,
          totalBytes: versionInfo.total_bytes
        }
      ]
    : []
}

/**
 * Delete all files for a subdomain (all versions)
 * Note: This should be an admin operation, not available to CLI users
 * @param {string} _subdomain - The subdomain to delete
 */
export async function deleteSubdomain (_subdomain) {
  // This operation is not available in the consumer CLI
  // It should be handled through the admin dashboard or worker
  throw new Error(
    'Subdomain deletion is not available in the CLI. Contact support.'
  )
}

/**
 * Get all expired deployments
 * Note: Cleanup is handled server-side automatically
 * @returns {Promise<Array>} Array of expired deployment records
 */
export function getExpiredDeployments () {
  // Expiration cleanup is handled server-side
  return Promise.resolve([])
}

/**
 * Remove deployment records for a subdomain from metadata
 * Note: This should be an admin operation
 * @param {string} _subdomain - The subdomain to remove
 */
export async function removeDeploymentRecords (_subdomain) {
  throw new Error(
    'Deployment record removal is not available in the CLI. Contact support.'
  )
}

/**
 * Clean up all expired deployments
 * Note: This is now handled automatically by the worker
 * @returns {Promise<{cleaned: string[], errors: string[]}>}
 */
export function cleanupExpiredDeployments () {
  // Cleanup is handled server-side automatically
  return Promise.resolve({
    cleaned: [],
    errors: [],
    note: 'Handled automatically by server'
  })
}
