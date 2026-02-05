import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

/**
 * Get the local config directory path
 * ~/.staticlaunch/ on Unix, %USERPROFILE%\.staticlaunch\ on Windows
 */
function getConfigDir() {
    return join(homedir(), '.staticlaunch');
}

/**
 * Get the local deployments file path
 */
function getDeploymentsPath() {
    return join(getConfigDir(), 'deployments.json');
}

/**
 * Ensure config directory exists
 */
async function ensureConfigDir() {
    const dir = getConfigDir();
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
    }
}

/**
 * Get local deployments data
 * @returns {Promise<{version: number, deployments: Array}>}
 */
async function getLocalData() {
    const filePath = getDeploymentsPath();
    try {
        if (existsSync(filePath)) {
            const text = await readFile(filePath, 'utf-8');
            return JSON.parse(text);
        }
    } catch {
        // Corrupted or invalid JSON file, return empty structure
    }
    return { version: 1, deployments: [] };
}

/**
 * Save a deployment record locally
 * This provides quick access to user's own deployments without R2 read
 * @param {object} deployment - Deployment record
 */
export async function saveLocalDeployment(deployment) {
    await ensureConfigDir();

    const data = await getLocalData();
    data.deployments.push(deployment);

    await writeFile(
        getDeploymentsPath(),
        JSON.stringify(data, null, 2),
        'utf-8'
    );
}

/**
 * Get all local deployments (user's own deployments from this machine)
 * @returns {Promise<Array>} Array of deployment records
 */
export async function getLocalDeployments() {
    const data = await getLocalData();
    return data.deployments;
}

/**
 * Clear local deployments history
 */
export async function clearLocalDeployments() {
    await ensureConfigDir();
    await writeFile(
        getDeploymentsPath(),
        JSON.stringify({ version: 1, deployments: [] }, null, 2),
        'utf-8'
    );
}
