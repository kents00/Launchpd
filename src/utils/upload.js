import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, posix, sep } from 'node:path';
import mime from 'mime-types';
import { config } from '../config.js';
import { info } from './logger.js';

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
 * Convert Windows path to POSIX for R2 keys
 * @param {string} windowsPath
 * @returns {string}
 */
function toPosixPath(windowsPath) {
    return windowsPath.split(sep).join(posix.sep);
}

/**
 * Upload a folder to R2 under a subdomain prefix with versioning
 * @param {string} localPath - Local folder path
 * @param {string} subdomain - Subdomain to use as bucket prefix
 * @param {number} version - Version number for this deployment
 */
export async function uploadFolder(localPath, subdomain, version = 1) {
    const client = createR2Client();
    const files = await readdir(localPath, { recursive: true, withFileTypes: true });

    let uploaded = 0;
    let totalBytes = 0;
    const total = files.filter(f => f.isFile()).length;

    for (const file of files) {
        if (!file.isFile()) continue;

        // Build full local path
        const fullPath = join(file.parentPath || file.path, file.name);

        // Build R2 key: subdomain/v{version}/relative/path/to/file.ext
        const relativePath = relative(localPath, fullPath);
        const key = `${subdomain}/v${version}/${toPosixPath(relativePath)}`;

        // Detect content type
        const contentType = mime.lookup(file.name) || 'application/octet-stream';

        // Read file and upload
        const body = await readFile(fullPath);
        totalBytes += body.length;

        await client.send(new PutObjectCommand({
            Bucket: config.r2.bucketName,
            Key: key,
            Body: body,
            ContentType: contentType,
        }));

        uploaded++;
        info(`  Uploaded (${uploaded}/${total}): ${toPosixPath(relativePath)}`);
    }

    return { uploaded, subdomain, totalBytes };
}
