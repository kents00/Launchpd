/**
 * Quota checking for StaticLaunch CLI
 * Validates user can deploy before uploading
 */

import { config } from '../config.js';
import { getCredentials, getClientToken } from './credentials.js';
import { warning, error, info } from './logger.js';

const API_BASE_URL = `https://api.${config.domain}`;

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
export async function checkQuota(subdomain, estimatedBytes = 0, options = {}) {
    const creds = await getCredentials();

    let quotaData;

    if (creds?.apiKey) {
        // Authenticated user
        quotaData = await checkAuthenticatedQuota(creds.apiKey, options.isUpdate);
    } else {
        // Anonymous user
        quotaData = await checkAnonymousQuota();
    }
    // ... skipped ...
    /**
     * Check quota for authenticated user
     */
    async function checkAuthenticatedQuota(apiKey, isUpdate = false) {
        try {
            const url = new URL(`${API_BASE_URL}/api/quota`);
            if (isUpdate) {
                url.searchParams.append('is_update', 'true');
            }

            const response = await fetch(url.toString(), {
                headers: {
                    'X-API-Key': apiKey,
                },
            });

            if (!response.ok) {
                return null;
            }

            return await response.json();
        } catch (err) {
            return null;
        }
    }
    // ... skipped ...

    if (!quotaData) {
        // API unavailable, allow deployment (fail-open for MVP)
        return {
            allowed: true,
            isNewSite: true,
            quota: null,
            warnings: ['⚠️ Could not verify quota (API unavailable)'],
        };
    }

    // DEBUG: Write input options to file
    try {
        const { appendFileSync } = await import('node:fs');
        appendFileSync('quota_debug_trace.txt', `\n[${new Date().toISOString()}] Check: ${subdomain}, isUpdate: ${options.isUpdate}, type: ${typeof options.isUpdate}`);
    } catch (_err) {
    }

    // Check if this is an existing site the user owns
    // If explicitly marked as update, assume user owns it
    let isNewSite = true;
    if (options.isUpdate) {
        isNewSite = false;
    } else if (subdomain) {
        isNewSite = !await userOwnsSite(creds?.apiKey, subdomain);
    }

    const warnings = [...(quotaData.warnings || [])];

    const allowed = true;

    // Check if blocked (anonymous limit reached)
    if (quotaData.blocked) {
        console.log(quotaData.upgradeMessage);
        return {
            allowed: false,
            isNewSite,
            quota: quotaData,
            warnings: [],
        };
    }

    // Check site limit for new sites
    if (isNewSite && !quotaData.canCreateNewSite) {
        error(`Site limit reached (${quotaData.limits.maxSites} sites)`);
        if (!creds?.apiKey) {
            showUpgradePrompt();
        } else {
            info('Upgrade to Pro for more sites, or delete an existing site');
        }
        return {
            allowed: false,
            isNewSite,
            quota: quotaData,
            warnings,
        };
    }

    // Check storage limit
    const storageAfter = (quotaData.usage?.storageUsed || 0) + estimatedBytes;
    if (storageAfter > quotaData.limits.maxStorageBytes) {
        const overBy = storageAfter - quotaData.limits.maxStorageBytes;
        error(`Storage limit exceeded by ${formatBytes(overBy)}`);
        error(`Current: ${formatBytes(quotaData.usage.storageUsed)} / ${formatBytes(quotaData.limits.maxStorageBytes)}`);
        if (!creds?.apiKey) {
            showUpgradePrompt();
        } else {
            info('Upgrade to Pro for more storage, or delete old deployments');
        }
        return {
            allowed: false,
            isNewSite,
            quota: quotaData,
            warnings,
        };
    }

    // Add storage warning if close to limit
    const storagePercentage = storageAfter / quotaData.limits.maxStorageBytes;
    if (storagePercentage > 0.8) {
        warnings.push(`⚠️ Storage ${Math.round(storagePercentage * 100)}% used (${formatBytes(storageAfter)} / ${formatBytes(quotaData.limits.maxStorageBytes)})`);
    }

    // Add site count warning if close to limit
    if (isNewSite) {
        const sitesAfter = (quotaData.usage?.siteCount || 0) + 1;
        const sitePercentage = sitesAfter / quotaData.limits.maxSites;
        if (sitePercentage > 0.8) {
            warnings.push(`⚠️ ${quotaData.limits.maxSites - sitesAfter} site(s) remaining after this deploy`);
        }
    }



    return {
        allowed,
        isNewSite,
        quota: quotaData,
        warnings,
    };
}

/**
 * Check quota for authenticated user
 */
async function checkAuthenticatedQuota(apiKey, isUpdate = false) {
    try {
        const url = new URL(`${API_BASE_URL}/api/quota`);
        if (isUpdate) {
            url.searchParams.append('is_update', 'true');
        }

        const response = await fetch(url.toString(), {
            headers: {
                'X-API-Key': apiKey,
            },
        });

        if (!response.ok) {
            return null;
        }

        return await response.json();
    } catch {
        return null;
    }
}

/**
 * Check quota for anonymous user
 */
async function checkAnonymousQuota() {
    try {
        const clientToken = await getClientToken();

        const response = await fetch(`${API_BASE_URL}/api/quota/anonymous`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                clientToken,
            }),
        });

        if (!response.ok) {
            return null;
        }

        return await response.json();
    } catch {
        return null;
    }
}

/**
 * Check if user owns a subdomain
 */
async function userOwnsSite(apiKey, subdomain) {
    if (!apiKey) {
        // For anonymous, we track by client token in deployments
        return false;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/subdomains`, {
            headers: {
                'X-API-Key': apiKey,
            },
        });

        if (!response.ok) {
            console.log('Fetch subdomains failed:', response.status);
            return false;
        }

        const data = await response.json();
        console.log('User subdomains:', data.subdomains?.map(s => s.subdomain));
        console.log('Checking for:', subdomain);
        const owns = data.subdomains?.some(s => s.subdomain === subdomain) || false;
        console.log('Owns site?', owns);
        return owns;
    } catch (err) {
        console.log('Error checking ownership:', err);
        return false;
    }
}

/**
 * Show upgrade prompt for anonymous users
 */
function showUpgradePrompt() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  Upgrade to Launchpd Free Tier                               ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║  Register for FREE to unlock:                                ║');
    console.log('║    → 10 sites (instead of 3)                                 ║');
    console.log('║    → 100MB storage (instead of 50MB)                         ║');
    console.log('║    → 30-day retention (instead of 7 days)                    ║');
    console.log('║    → 10 version history per site                             ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║  Run: launchpd register                                      ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
}

/**
 * Display quota warnings
 */
export function displayQuotaWarnings(warnings) {
    if (warnings && warnings.length > 0) {
        console.log('');
        warnings.forEach(w => warning(w));
    }
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
