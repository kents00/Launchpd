/**
 * Quota checking for StaticLaunch CLI
 * Validates user can deploy before uploading
 */

import { config } from '../config.js'
import { getCredentials, getClientToken } from './credentials.js'
import { warning, error, info, log, raw } from './logger.js'

const API_BASE_URL = "https://api."+config.domain

/**
 * Check quota before deployment
 * Returns quota info and whether deployment is allowed
 *
 * @param {string} subdomain - Target subdomain (null for new site)
 * @param {number} estimatedBytes - Estimated upload size in bytes
 * @param {object} options - Options
 * @param {boolean} options.isUpdate - Whether this is known to be an update
 * @returns {Promise<{allowed: boolean, isNewSite: boolean, quota: object, warnings: string[]}>}
 */
export async function checkQuota (subdomain, estimatedBytes = 0, options = {}) {
  const creds = await getCredentials()

  let quotaData

  if (creds?.apiKey) {
    // Authenticated user
    quotaData = await checkAuthenticatedQuota(creds.apiKey, options.isUpdate)
  } else {
    // Anonymous user
    quotaData = await checkAnonymousQuota()
  }
  // ... skipped ...
  /**
   * Check quota for authenticated user
   */
  async function checkAuthenticatedQuota (apiKey, isUpdate = false) {
    try {
      const url = new URL(""+API_BASE_URL+"/api/quota")
      if (isUpdate) {
        url.searchParams.append('is_update', 'true')
      }

      const response = await fetch(url.toString(), {
        headers: {
          'X-API-Key': apiKey
        }
      })

      if (!response.ok) {
        if (options.verbose || process.env.DEBUG) {
          raw(
            "Quota check failed: "+response.status+" "+response.statusText,
            'error'
          )
          const text = await response.text()
          raw("Response: "+text, 'error')
        }
        return null
      }

      return await response.json()
    } catch (err) {
      if (options.verbose || process.env.DEBUG) {
        raw('Quota check error:', 'error')
        raw(err, 'error')
        if (err.cause) raw('Cause:', 'error')
        if (err.cause) raw(err.cause, 'error')
      }
      return null
    }
  }
  // ... skipped ...

  if (!quotaData) {
    // API unavailable, allow deployment (fail-open for MVP)
    return {
      allowed: true,
      isNewSite: true,
      quota: null,
      warnings: ['Could not verify quota (API unavailable)']
    }
  }

  // DEBUG: Write input options to file
  try {
    const { appendFileSync } = await import('node:fs')
    appendFileSync(
      'quota_debug_trace.txt',
      "\n["+new Date().toISOString()+"] Check: "+subdomain+", isUpdate: "+options.isUpdate+", type: "+typeof options.isUpdate
    )
  } catch {
    // Ignore trace errors
  }

  // Check if this is an existing site the user owns
  // If explicitly marked as update, assume user owns it
  let isNewSite = true
  if (options.isUpdate) {
    isNewSite = false
  } else if (subdomain) {
    isNewSite = !(await userOwnsSite(creds?.apiKey, subdomain))
  }

  const warnings = [...(quotaData.warnings || [])]

  // Add quota warning (de-duplicated) - early so it shows even if blocked later
  const remaining = quotaData.usage?.sitesRemaining
  if (typeof remaining === 'number') {
    const warningMsg = `You have ${remaining} site(s) remaining`
    // Only push if not already present in warnings from backend
    if (!warnings.some((w) => w.toLowerCase().includes('site(s) remaining'))) {
      warnings.push(warningMsg)
    }
  }

  // Determine if deployment is allowed based on API flags or local calculations
  const allowed = quotaData.canDeploy ?? true

  // Check if blocked (anonymous limit reached or explicitly blocked by backend)
  if (quotaData.blocked) {
    if (quotaData.upgradeMessage) log(quotaData.upgradeMessage)
    return {
      allowed: false,
      isNewSite,
      quota: quotaData,
      warnings: []
    }
  }

  // Check site limit for new sites
  if (isNewSite) {
    const canCreate =
      quotaData.canCreateNewSite !== undefined
        ? quotaData.canCreateNewSite
        : remaining > 0
    if (!canCreate) {
      error(
        `Site limit reached (${quotaData.limits?.maxSites || 'unknown'} sites)`
      )
      if (creds?.apiKey) {
        info('Upgrade to Pro for more sites, or delete an existing site')
        info('Check your quota status: launchpd whoami')
      } else {
        showUpgradePrompt()
      }
      return {
        allowed: false,
        isNewSite,
        quota: quotaData,
        warnings
      }
    }
  }

  // Check storage limit
  const maxStorage =
    quotaData.limits?.maxStorageBytes ||
    quotaData.limits?.maxStorageMB * 1024 * 1024
  const storageUsed =
    quotaData.usage?.storageUsed ||
    quotaData.usage?.storageUsedMB * 1024 * 1024 ||
    0
  const storageAfter = storageUsed + estimatedBytes

  if (maxStorage && storageAfter > maxStorage) {
    const overBy = storageAfter - quotaData.limits.maxStorageBytes
    error(`Storage limit exceeded by ${formatBytes(overBy)}`)
    error(
      `Current: ${formatBytes(quotaData.usage.storageUsed)} / ${formatBytes(quotaData.limits.maxStorageBytes)}`
    )
    if (creds?.apiKey) {
      info('Upgrade to Pro for more storage, or delete old deployments')
    } else {
      showUpgradePrompt()
    }
    return {
      allowed: false,
      isNewSite,
      quota: quotaData,
      warnings
    }
  }

  // Add storage warning if close to limit
  const storagePercentage = storageAfter / quotaData.limits.maxStorageBytes
  if (storagePercentage > 0.8) {
    warnings.push(
      `Storage ${Math.round(storagePercentage * 100)}% used (${formatBytes(storageAfter)} / ${formatBytes(quotaData.limits.maxStorageBytes)})`
    )
  }

  return {
    allowed,
    isNewSite,
    quota: quotaData,
    warnings
  }
}

/**
 * Check quota for anonymous user
 */
async function checkAnonymousQuota () {
  try {
    const clientToken = await getClientToken()

    // Validate client token format before sending to network
    // This ensures we only send properly formatted tokens, not arbitrary file data
    if (
      !clientToken ||
      typeof clientToken !== 'string' ||
      !/^cli_[a-f0-9]{32}$/.test(clientToken)
    ) {
      return null
    }

    const response = await fetch(`${API_BASE_URL}/api/quota/anonymous`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clientToken
      })
    })

    if (!response.ok) {
      return null
    }

    return await response.json()
  } catch {
    return null
  }
}

/**
 * Check if user owns a subdomain
 */
async function userOwnsSite (apiKey, subdomain) {
  if (!apiKey) {
    // For anonymous, we track by client token in deployments
    return false
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/subdomains`, {
      headers: {
        'X-API-Key': apiKey
      }
    })

    if (!response.ok) {
      log(`Fetch subdomains failed: ${response.status}`)
      return false
    }

    const data = await response.json()
    if (process.env.DEBUG) {
      log(`User subdomains: ${data.subdomains?.map((s) => s.subdomain)}`)
      log(`Checking for: ${subdomain}`)
    }
    const owns =
      data.subdomains?.some((s) => s.subdomain === subdomain) || false
    if (process.env.DEBUG) {
      log(`Owns site? ${owns}`)
    }
    return owns
  } catch (err) {
    log(`Error checking ownership: ${err.message}`)
    return false
  }
}

/**
 * Show upgrade prompt for anonymous users
 */
function showUpgradePrompt () {
  log('')
  log('╔══════════════════════════════════════════════════════════════╗')
  log('║  Upgrade to Launchpd Free Tier                               ║')
  log('╠══════════════════════════════════════════════════════════════╣')
  log('║  Register for FREE to unlock:                                ║')
  log('║    → 10 sites (instead of 3)                                 ║')
  log('║    → 100MB storage (instead of 50MB)                         ║')
  log('║    → 30-day retention (instead of 7 days)                    ║')
  log('║    → 10 version history per site                             ║')
  log('╠══════════════════════════════════════════════════════════════╣')
  log('║  Run: launchpd register                                      ║')
  log('╚══════════════════════════════════════════════════════════════╝')
  log('')
}

/**
 * Display quota warnings
 */
export function displayQuotaWarnings (warnings) {
  if (warnings && warnings.length > 0) {
    log('')
    warnings.forEach((w) => warning(w))
  }
}

/**
 * Format bytes to human readable
 */
export function formatBytes (bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}
