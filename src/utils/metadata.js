import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';

const METADATA_KEY = '_meta/deployments.json';

/**
 * Create S3-compatible client for Cloudflare R2
 */
function createR2Client() {
    return new S3Client({
        region: 'auto',
        endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: config.r2.accessKeyId,
            secretAccessKey: config.r2.secretAccessKey,
        },
    });
}

/**
 * Get existing deployments metadata from R2
 * @returns {Promise<{version: number, deployments: Array}>}
 */
async function getDeploymentsData(client) {
    try {
        const response = await client.send(new GetObjectCommand({
            Bucket: config.r2.bucketName,
            Key: METADATA_KEY,
        }));
        const text = await response.Body.transformToString();
        return JSON.parse(text);
    } catch {
        // File doesn't exist yet, return empty structure
        return { version: 1, deployments: [] };
    }
}

/**
 * Create a timestamped backup of the metadata before overwriting
 * @param {S3Client} client
 * @param {object} data - Current metadata to backup
 */
async function backupMetadata(client, data) {
    if (data.deployments.length === 0) return; // Nothing to backup

    const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
    const backupKey = `_meta/backups/deployments-${timestamp}.json`;

    await client.send(new PutObjectCommand({
        Bucket: config.r2.bucketName,
        Key: backupKey,
        Body: JSON.stringify(data, null, 2),
        ContentType: 'application/json',
    }));
}

/**
 * Record a deployment to R2 metadata
 * @param {string} subdomain - Deployed subdomain
 * @param {string} folderPath - Original folder path
 * @param {number} fileCount - Number of files deployed
 * @param {number} totalBytes - Total bytes uploaded
 * @param {number} version - Version number for this deployment
 * @param {string|null} expiresAt - ISO timestamp for expiration, or null for no expiration
 */
export async function recordDeployment(subdomain, folderPath, fileCount, totalBytes = 0, version = 1, expiresAt = null) {
    const client = createR2Client();

    // Get existing data
    const data = await getDeploymentsData(client);

    // Backup before modifying (prevents accidental data loss)
    await backupMetadata(client, data);

    // Extract folder name from path
    const folderName = folderPath.split(/[\\/]/).pop() || 'unknown';

    // Append new deployment
    const deployment = {
        subdomain,
        timestamp: new Date().toISOString(),
        folderName,
        fileCount,
        totalBytes,
        cliVersion: '0.1.0',
        version,
        isActive: true,
        expiresAt,
    };

    data.deployments.push(deployment);

    // Write back to R2
    await client.send(new PutObjectCommand({
        Bucket: config.r2.bucketName,
        Key: METADATA_KEY,
        Body: JSON.stringify(data, null, 2),
        ContentType: 'application/json',
    }));

    return deployment;
}

/**
 * List all deployments from R2 metadata
 * @returns {Promise<Array>} Array of deployment records
 */
export async function listDeploymentsFromR2() {
    const client = createR2Client();
    const data = await getDeploymentsData(client);
    return data.deployments;
}

/**
 * Get the next version number for a subdomain
 * @param {string} subdomain - The subdomain to check
 * @returns {Promise<number>} Next version number
 */
export async function getNextVersion(subdomain) {
    const client = createR2Client();
    const data = await getDeploymentsData(client);

    const existingDeployments = data.deployments.filter(d => d.subdomain === subdomain);
    if (existingDeployments.length === 0) {
        return 1;
    }

    const maxVersion = Math.max(...existingDeployments.map(d => d.version || 1));
    return maxVersion + 1;
}

/**
 * Get all versions for a specific subdomain
 * @param {string} subdomain - The subdomain to get versions for
 * @returns {Promise<Array>} Array of deployment versions
 */
export async function getVersionsForSubdomain(subdomain) {
    const client = createR2Client();
    const data = await getDeploymentsData(client);

    return data.deployments
        .filter(d => d.subdomain === subdomain)
        .sort((a, b) => (b.version || 1) - (a.version || 1));
}

/**
 * Copy files from one version to another (for rollback)
 * @param {string} subdomain - The subdomain
 * @param {number} fromVersion - Source version
 * @param {number} toVersion - Target version (new active version)
 */
export async function copyVersionFiles(subdomain, fromVersion, toVersion) {
    const client = createR2Client();

    // List all files in the source version
    const sourcePrefix = `${subdomain}/v${fromVersion}/`;
    const targetPrefix = `${subdomain}/v${toVersion}/`;

    const listResponse = await client.send(new ListObjectsV2Command({
        Bucket: config.r2.bucketName,
        Prefix: sourcePrefix,
    }));

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
        throw new Error(`No files found for version ${fromVersion}`);
    }

    let copiedCount = 0;

    for (const object of listResponse.Contents) {
        const sourceKey = object.Key;
        const targetKey = sourceKey.replace(sourcePrefix, targetPrefix);

        // Copy file to new version
        await client.send(new CopyObjectCommand({
            Bucket: config.r2.bucketName,
            CopySource: `${config.r2.bucketName}/${sourceKey}`,
            Key: targetKey,
        }));

        copiedCount++;
    }

    return { copiedCount, fromVersion, toVersion };
}

/**
 * Update the active pointer for a subdomain (for rollback)
 * @param {string} subdomain - The subdomain
 * @param {number} version - Version to make active
 */
export async function setActiveVersion(subdomain, version) {
    const client = createR2Client();

    // Create/update an active pointer file
    const pointerKey = `${subdomain}/_active`;

    await client.send(new PutObjectCommand({
        Bucket: config.r2.bucketName,
        Key: pointerKey,
        Body: JSON.stringify({ activeVersion: version, updatedAt: new Date().toISOString() }),
        ContentType: 'application/json',
    }));

    return { subdomain, activeVersion: version };
}

/**
 * Get the active version for a subdomain
 * @param {string} subdomain - The subdomain
 * @returns {Promise<number>} Active version number
 */
export async function getActiveVersion(subdomain) {
    const client = createR2Client();

    try {
        const response = await client.send(new GetObjectCommand({
            Bucket: config.r2.bucketName,
            Key: `${subdomain}/_active`,
        }));
        const text = await response.Body.transformToString();
        const data = JSON.parse(text);
        return data.activeVersion || 1;
    } catch {
        // No active pointer, default to version 1
        return 1;
    }
}

/**
 * List all files for a specific version
 * @param {string} subdomain - The subdomain
 * @param {number} version - Version number
 * @returns {Promise<Array>} Array of file keys
 */
export async function listVersionFiles(subdomain, version) {
    const client = createR2Client();

    const prefix = `${subdomain}/v${version}/`;

    const response = await client.send(new ListObjectsV2Command({
        Bucket: config.r2.bucketName,
        Prefix: prefix,
    }));

    if (!response.Contents) {
        return [];
    }

    return response.Contents.map(obj => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
    }));
}

/**
 * Delete all files for a subdomain (all versions)
 * @param {string} subdomain - The subdomain to delete
 * @returns {Promise<{deletedCount: number}>}
 */
export async function deleteSubdomain(subdomain) {
    const client = createR2Client();

    // List all files for this subdomain
    const prefix = `${subdomain}/`;

    let deletedCount = 0;
    let continuationToken;

    do {
        const response = await client.send(new ListObjectsV2Command({
            Bucket: config.r2.bucketName,
            Prefix: prefix,
            ContinuationToken: continuationToken,
        }));

        if (response.Contents && response.Contents.length > 0) {
            for (const object of response.Contents) {
                await client.send(new DeleteObjectCommand({
                    Bucket: config.r2.bucketName,
                    Key: object.Key,
                }));
                deletedCount++;
            }
        }

        continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return { deletedCount };
}

/**
 * Get all expired deployments
 * @returns {Promise<Array>} Array of expired deployment records
 */
export async function getExpiredDeployments() {
    const client = createR2Client();
    const data = await getDeploymentsData(client);
    const now = Date.now();

    return data.deployments.filter(d =>
        d.expiresAt && new Date(d.expiresAt).getTime() < now
    );
}

/**
 * Remove deployment records for a subdomain from metadata
 * @param {string} subdomain - The subdomain to remove
 */
export async function removeDeploymentRecords(subdomain) {
    const client = createR2Client();
    const data = await getDeploymentsData(client);

    // Backup before modifying
    await backupMetadata(client, data);

    // Filter out the subdomain's deployments
    data.deployments = data.deployments.filter(d => d.subdomain !== subdomain);

    // Write back
    await client.send(new PutObjectCommand({
        Bucket: config.r2.bucketName,
        Key: METADATA_KEY,
        Body: JSON.stringify(data, null, 2),
        ContentType: 'application/json',
    }));
}

/**
 * Clean up all expired deployments
 * @returns {Promise<{cleaned: string[], errors: string[]}>}
 */
export async function cleanupExpiredDeployments() {
    const expired = await getExpiredDeployments();
    const cleaned = [];
    const errors = [];

    // Get unique subdomains
    const subdomains = [...new Set(expired.map(d => d.subdomain))];

    for (const subdomain of subdomains) {
        try {
            await deleteSubdomain(subdomain);
            await removeDeploymentRecords(subdomain);
            cleaned.push(subdomain);
        } catch (err) {
            errors.push(`${subdomain}: ${err.message}`);
        }
    }

    return { cleaned, errors };
}
