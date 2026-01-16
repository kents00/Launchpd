/**
 * API Client for StaticLaunch Metadata API
 * Communicates with the Cloudflare Worker API endpoints
 */

import { config } from '../config.js';

const API_BASE_URL = `https://api.${config.domain}`;
const API_KEY = process.env.STATICLAUNCH_API_KEY || 'public-beta-key';

/**
 * Make an authenticated API request
 */
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        ...options.headers,
    };

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
    const { subdomain, folderName, fileCount, totalBytes, version, expiresAt } = deploymentData;

    return apiRequest('/api/deployments', {
        method: 'POST',
        body: JSON.stringify({
            subdomain,
            folderName,
            fileCount,
            totalBytes,
            version,
            cliVersion: '0.1.0',
            expiresAt,
        }),
    });
}

/**
 * Get list of user's deployments
 */
export async function listDeployments(limit = 50, offset = 0) {
    return apiRequest(`/api/deployments?limit=${limit}&offset=${offset}`);
}

/**
 * Get deployment details for a subdomain
 */
export async function getDeployment(subdomain) {
    return apiRequest(`/api/deployments/${subdomain}`);
}

/**
 * Get version history for a subdomain
 */
export async function getVersions(subdomain) {
    return apiRequest(`/api/versions/${subdomain}`);
}

/**
 * Rollback to a specific version
 */
export async function rollbackVersion(subdomain, version) {
    return apiRequest(`/api/versions/${subdomain}/rollback`, {
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
    return apiRequest('/api/subdomains/reserve', {
        method: 'POST',
        body: JSON.stringify({ subdomain }),
    });
}

/**
 * Get user's subdomains
 */
export async function listSubdomains() {
    return apiRequest('/api/subdomains');
}

/**
 * Get current user info
 */
export async function getCurrentUser() {
    return apiRequest('/api/users/me');
}

/**
 * Health check
 */
export async function healthCheck() {
    return apiRequest('/api/health');
}

export default {
    recordDeployment,
    listDeployments,
    getDeployment,
    getVersions,
    rollbackVersion,
    checkSubdomainAvailable,
    reserveSubdomain,
    listSubdomains,
    getCurrentUser,
    healthCheck,
};
