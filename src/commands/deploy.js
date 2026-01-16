import { existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve, basename, join } from 'node:path';
import { generateSubdomain } from '../utils/id.js';
import { uploadFolder, finalizeUpload } from '../utils/upload.js';
import { getNextVersion } from '../utils/metadata.js';
import { saveLocalDeployment } from '../utils/localConfig.js';
import { getNextVersionFromAPI } from '../utils/api.js';
import { success, error, info, warning } from '../utils/logger.js';
import { calculateExpiresAt, formatTimeRemaining } from '../utils/expiration.js';
import { checkQuota, displayQuotaWarnings } from '../utils/quota.js';
import { getCredentials } from '../utils/credentials.js';

/**
 * Calculate total size of a folder
 */
async function calculateFolderSize(folderPath) {
    const files = await readdir(folderPath, { recursive: true, withFileTypes: true });
    let totalSize = 0;

    for (const file of files) {
        if (file.isFile()) {
            const fullPath = file.parentPath
                ? join(file.parentPath, file.name)
                : join(folderPath, file.name);
            try {
                const stats = statSync(fullPath);
                totalSize += stats.size;
            } catch {
                // File may have been deleted
            }
        }
    }

    return totalSize;
}

/**
 * Deploy a local folder to StaticLaunch
 * @param {string} folder - Path to folder to deploy
 * @param {object} options - Command options
 * @param {boolean} options.dryRun - Skip actual upload
 * @param {string} options.name - Custom subdomain
 * @param {string} options.expires - Expiration time (e.g., "30m", "2h", "1d")
 */
export async function deploy(folder, options) {
    const folderPath = resolve(folder);

    // Parse expiration if provided
    let expiresAt = null;
    if (options.expires) {
        try {
            expiresAt = calculateExpiresAt(options.expires);
        } catch (err) {
            error(err.message);
            process.exit(1);
        }
    }

    // Validate folder exists
    if (!existsSync(folderPath)) {
        error(`Folder not found: ${folderPath}`);
        process.exit(1);
    }

    // Check folder is not empty
    const files = await readdir(folderPath, { recursive: true, withFileTypes: true });
    const fileCount = files.filter(f => f.isFile()).length;

    if (fileCount === 0) {
        error('Folder is empty. Nothing to deploy.');
        process.exit(1);
    }

    // Generate or use provided subdomain
    const subdomain = options.name || generateSubdomain();
    const url = `https://${subdomain}.launchpd.cloud`;

    // Calculate estimated upload size
    const estimatedBytes = await calculateFolderSize(folderPath);

    // Check quota before deploying
    info('Checking quota...');
    const quotaCheck = await checkQuota(subdomain, estimatedBytes);

    if (!quotaCheck.allowed) {
        error('Deployment blocked due to quota limits');
        process.exit(1);
    }

    // Display any warnings
    displayQuotaWarnings(quotaCheck.warnings);

    // Show current user status
    const creds = await getCredentials();
    if (creds?.email) {
        info(`Deploying as: ${creds.email}`);
    } else {
        info('Deploying as: anonymous (run "launchpd login" for more quota)');
    }

    info(`Deploying ${fileCount} file(s) from ${folderPath}`);
    info(`Target: ${url}`);
    info(`Size: ${(estimatedBytes / 1024 / 1024).toFixed(2)}MB`);

    if (options.dryRun) {
        warning('Dry run mode - skipping upload');

        // List files that would be uploaded
        for (const file of files) {
            if (file.isFile()) {
                const relativePath = file.parentPath
                    ? `${file.parentPath.replace(folderPath, '')}/${file.name}`.replace(/^[\\/]/, '')
                    : file.name;
                info(`  Would upload: ${relativePath.replaceAll('\\', '/')}`);
            }
        }

        success(`Dry run complete. ${fileCount} file(s) would be deployed to:`);
        console.log(`\n  ${url}\n`);

        // Show quota status after dry run
        if (quotaCheck.quota) {
            console.log('Quota after this deploy:');
            const storageAfter = (quotaCheck.quota.usage?.storageUsed || 0) + estimatedBytes;
            const sitesAfter = quotaCheck.isNewSite
                ? (quotaCheck.quota.usage?.siteCount || 0) + 1
                : quotaCheck.quota.usage?.siteCount || 0;
            console.log(`  Sites: ${sitesAfter}/${quotaCheck.quota.limits.maxSites}`);
            console.log(`  Storage: ${(storageAfter / 1024 / 1024).toFixed(1)}MB/${quotaCheck.quota.limits.maxStorageMB}MB`);
            console.log('');
        }
        return;
    }

    // Perform actual upload
    try {
        // Get next version number for this subdomain (try API first, fallback to local)
        let version = await getNextVersionFromAPI(subdomain);
        if (version === null) {
            version = await getNextVersion(subdomain);
        }
        info(`Deploying as version ${version}...`);

        // Upload all files via API proxy
        const folderName = basename(folderPath);
        const { totalBytes } = await uploadFolder(folderPath, subdomain, version);

        // Finalize upload: set active version and record metadata
        info('Finalizing deployment...');
        await finalizeUpload(
            subdomain,
            version,
            fileCount,
            totalBytes,
            folderName,
            expiresAt?.toISOString() || null
        );

        // Save locally for quick access
        await saveLocalDeployment({
            subdomain,
            folderName,
            fileCount,
            totalBytes,
            version,
            timestamp: new Date().toISOString(),
            expiresAt: expiresAt?.toISOString() || null,
        });

        success(`Deployed successfully! (v${version})`);
        console.log(`\n  🚀 ${url}`);
        if (expiresAt) {
            warning(`  ⏰ Expires: ${formatTimeRemaining(expiresAt)}`);
        }
        console.log('');
    } catch (err) {
        error(`Upload failed: ${err.message}`);
        process.exit(1);
    }
}
