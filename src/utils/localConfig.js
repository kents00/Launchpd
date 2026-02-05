import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * Get the local config directory path
 * ~/.staticlaunch/ on Unix, %USERPROFILE%\.staticlaunch\ on Windows
 */
function getConfigDir() {
    return path.join(os.homedir(), '.staticlaunch');
}

/**
 * Get the local deployments file path
 */
function getDeploymentsPath() {
    return path.join(getConfigDir(), 'deployments.json');
}

/**
 * Ensure config directory exists
 */
async function ensureConfigDir() {
    const dir = getConfigDir();
    if (!fs.existsSync(dir)) {
        await fsp.mkdir(dir, { recursive: true });
    }
}

/**
 * Get local deployments data
 * @returns {Promise<{version: number, deployments: Array}>}
 */
async function getLocalData() {
    const filePath = getDeploymentsPath();
    try {
        if (fs.existsSync(filePath)) {
            const text = await fsp.readFile(filePath, 'utf-8');
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

    const filePath = getDeploymentsPath();
    const content = JSON.stringify(data, undefined, 2);
    await fsp.writeFile(
        filePath,
        content,
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
    const filePath = getDeploymentsPath();
    const content = JSON.stringify({ version: 1, deployments: [] }, undefined, 2);
    await fsp.writeFile(
        filePath,
        content,
        'utf-8'
    );
}
