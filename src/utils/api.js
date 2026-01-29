/**
 * API Client for StaticLaunch Metadata API
 * Communicates with the Cloudflare Worker API endpoints
 */

import { config } from '../config.js';
import { getApiKey, getApiSecret } from './credentials.js';
import { createHmac } from 'node:crypto';
import { getMachineId } from './machineId.js';

const API_BASE_URL = config.apiUrl;

/**
 * Make an authenticated API request
 */
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    const apiKey = await getApiKey();
    const apiSecret = await getApiSecret();
    const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-Device-Fingerprint': getMachineId(),
        ...options.headers,
    };

    // Add HMAC signature if secret is available
    if (apiSecret) {
        const timestamp = Date.now().toString();
        const method = (options.method || 'GET').toUpperCase();
        const body = options.body || '';

        // HMAC-SHA256(secret, method + path + timestamp + body)
        const hmac = createHmac('sha256', apiSecret);
        hmac.update(method);
        hmac.update(endpoint);
        hmac.update(timestamp);
        hmac.update(body);

        const signature = hmac.digest('hex');

        headers['X-Timestamp'] = timestamp;
        headers['X-Signature'] = signature;
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `API error: ${response.status}`);
        }

        return data;
    } catch (err) {
        // If API is unavailable, return null to allow fallback to local storage
        if (err.message.includes('fetch failed') || err.message.includes('ENOTFOUND')) {
            return null;
        }
        throw err;
    }
}

/**
 * Get the next version number for a subdomain
 */
export async function getNextVersionFromAPI(subdomain) {
    const result = await apiRequest(`/api/versions/${subdomain}`);
    if (!result || !result.versions || result.versions.length === 0) {
        return 1;
    }
    const maxVersion = Math.max(...result.versions.map(v => v.version));
    return maxVersion + 1;
}

/**
 * Record a new deployment in the API
 */
export async function recordDeployment(deploymentData) {
    const { subdomain, folderName, fileCount, totalBytes, version, expiresAt, message } = deploymentData;

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
            message,
        }),
    });
}

/**
 * Get list of user's deployments
 */
export async function listDeployments(limit = 50, offset = 0) {
    return await apiRequest(`/api/deployments?limit=${limit}&offset=${offset}`);
}

/**
 * Get deployment details for a subdomain
 */
export async function getDeployment(subdomain) {
    return await apiRequest(`/api/deployments/${subdomain}`);
}

/**
 * Get version history for a subdomain
 */
export async function getVersions(subdomain) {
    return await apiRequest(`/api/versions/${subdomain}`);
}

/**
 * Rollback to a specific version
 */
export async function rollbackVersion(subdomain, version) {
    return await apiRequest(`/api/versions/${subdomain}/rollback`, {
        method: 'PUT',
        body: JSON.stringify({ version }),
    });
}

/**
 * Check if a subdomain is available
 */
export async function checkSubdomainAvailable(subdomain) {
    const result = await apiRequest(`/api/public/check/${subdomain}`);
    return result?.available ?? true;
}

/**
 * Reserve a subdomain
 */
export async function reserveSubdomain(subdomain) {
    return await apiRequest('/api/subdomains/reserve', {
        method: 'POST',
        body: JSON.stringify({ subdomain }),
    });
}

/**
 * Delete a site (subdomain)
 */
export async function deleteSite(subdomain) {
    return await apiRequest(`/api/subdomains/${subdomain}`, {
        method: 'DELETE',
    });
}

/**
 * Unreserve a subdomain
 */
export async function unreserveSubdomain(subdomain) {
    // Note: Admin only, but good to have in client client lib
    return await apiRequest(`/api/admin/reserve-subdomain/${subdomain}`, {
        method: 'DELETE',
    });
}

/**
 * Get user's subdomains
 */
export async function listSubdomains() {
    return await apiRequest('/api/subdomains');
}

/**
 * Get current user info
 */
export async function getCurrentUser() {
    return await apiRequest('/api/users/me');
}

/**
 * Health check
 */
export async function healthCheck() {
    return await apiRequest('/api/health');
}

export default {
    recordDeployment,
    listDeployments,
    getDeployment,
    getVersions,
    rollbackVersion,
    checkSubdomainAvailable,
    reserveSubdomain,
    deleteSite,
    unreserveSubdomain,
    listSubdomains,
    getCurrentUser,
    healthCheck,
};
