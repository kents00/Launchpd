import { readdir, readFile } from 'node:fs/promises';
import { join, relative, posix, sep } from 'node:path';
import mime from 'mime-types';
import { config } from '../config.js';
import { info } from './logger.js';

const API_BASE_URL = `https://api.${config.domain}`;

/**
 * Get API key for requests
 */
function getApiKey() {
    return process.env.STATICLAUNCH_API_KEY || 'public-beta-key';
}

/**
 * Convert Windows path to POSIX for R2 keys
 * @param {string} windowsPath
 * @returns {string}
 */
function toPosixPath(windowsPath) {
    return windowsPath.split(sep).join(posix.sep);
}

/**
 * Upload a single file via API proxy
 * @param {Buffer} content - File content
 * @param {string} subdomain - Target subdomain
 * @param {number} version - Version number
 * @param {string} filePath - Relative file path
 * @param {string} contentType - MIME type
 */
async function uploadFile(content, subdomain, version, filePath, contentType) {
    const response = await fetch(`${API_BASE_URL}/api/upload/file`, {
        method: 'POST',
        headers: {
            'X-API-Key': getApiKey(),
            'X-Subdomain': subdomain,
            'X-Version': String(version),
            'X-File-Path': filePath,
            'X-Content-Type': contentType,
            'Content-Type': 'application/octet-stream',
        },
        body: content,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(error.error || `Upload failed: ${response.status}`);
    }

    return response.json();
}

/**
 * Mark upload complete and set active version
 * @param {string} subdomain - Target subdomain
 * @param {number} version - Version number
 * @param {number} fileCount - Number of files uploaded
 * @param {number} totalBytes - Total bytes uploaded
 * @param {string} folderName - Original folder name
 * @param {string|null} expiresAt - ISO expiration timestamp
 */
async function completeUpload(subdomain, version, fileCount, totalBytes, folderName, expiresAt) {
    const response = await fetch(`${API_BASE_URL}/api/upload/complete`, {
        method: 'POST',
        headers: {
            'X-API-Key': getApiKey(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            subdomain,
            version,
            fileCount,
            totalBytes,
            folderName,
            expiresAt,
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Complete upload failed' }));
        throw new Error(error.error || `Complete upload failed: ${response.status}`);
    }

    return response.json();
}

/**
 * Upload a folder to Launchpd via API proxy
 * @param {string} localPath - Local folder path
 * @param {string} subdomain - Subdomain to use as bucket prefix
 * @param {number} version - Version number for this deployment
 */
export async function uploadFolder(localPath, subdomain, version = 1) {
    const files = await readdir(localPath, { recursive: true, withFileTypes: true });

    let uploaded = 0;
    let totalBytes = 0;
    const total = files.filter(f => f.isFile()).length;

    for (const file of files) {
        if (!file.isFile()) continue;

        // Build full local path
        const fullPath = join(file.parentPath || file.path, file.name);

        // Build relative path for R2 key
        const relativePath = relative(localPath, fullPath);
        const posixPath = toPosixPath(relativePath);

        // Detect content type
        const contentType = mime.lookup(file.name) || 'application/octet-stream';

        // Read file and upload via API
        const body = await readFile(fullPath);
        totalBytes += body.length;

        await uploadFile(body, subdomain, version, posixPath, contentType);

        uploaded++;
        info(`  Uploaded (${uploaded}/${total}): ${posixPath}`);
    }

    return { uploaded, subdomain, totalBytes };
}

/**
 * Complete the upload and set active version
 * @param {string} subdomain - Target subdomain
 * @param {number} version - Version number
 * @param {number} fileCount - Number of files
 * @param {number} totalBytes - Total bytes
 * @param {string} folderName - Folder name
 * @param {string|null} expiresAt - Expiration ISO timestamp
 */
export async function finalizeUpload(subdomain, version, fileCount, totalBytes, folderName, expiresAt = null) {
    return completeUpload(subdomain, version, fileCount, totalBytes, folderName, expiresAt);
}
