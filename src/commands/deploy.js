import { existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve, basename, join } from 'node:path';
import { generateSubdomain } from '../utils/id.js';
import { uploadFolder, finalizeUpload } from '../utils/upload.js';
import { getNextVersion } from '../utils/metadata.js';
import { saveLocalDeployment } from '../utils/localConfig.js';
import { getNextVersionFromAPI } from '../utils/api.js';
import { success, errorWithSuggestions, info, warning, spinner, formatSize } from '../utils/logger.js';
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
 * @param {boolean} options.verbose - Show verbose error details
 */
export async function deploy(folder, options) {
    const folderPath = resolve(folder);
    const verbose = options.verbose || false;

    // Parse expiration if provided
    let expiresAt = null;
    if (options.expires) {
        try {
            expiresAt = calculateExpiresAt(options.expires);
        } catch (err) {
            errorWithSuggestions(err.message, [
                'Use format like: 30m, 2h, 1d, 7d',
                'Minimum expiration is 30 minutes',
                'Examples: --expires 1h, --expires 2d',
            ], { verbose, cause: err });
            process.exit(1);
        }
    }

    // Validate folder exists
    if (!existsSync(folderPath)) {
        errorWithSuggestions(`Folder not found: ${folderPath}`, [
            'Check the path is correct',
            'Use an absolute path or path relative to current directory',
            `Current directory: ${process.cwd()}`,
        ], { verbose });
        process.exit(1);
    }

    // Check folder is not empty
    const scanSpinner = spinner('Scanning folder...');
    const files = await readdir(folderPath, { recursive: true, withFileTypes: true });
    const fileCount = files.filter(f => f.isFile()).length;

    if (fileCount === 0) {
        scanSpinner.fail('Folder is empty');
        errorWithSuggestions('Nothing to deploy.', [
            'Add some files to your folder',
            'Make sure index.html exists for static sites',
        ], { verbose });
        process.exit(1);
    }
    scanSpinner.succeed(`Found ${fileCount} file(s)`);

    // Generate or use provided subdomain
    const subdomain = options.name || generateSubdomain();
    const url = `https://${subdomain}.launchpd.cloud`;

    // Calculate estimated upload size
    const sizeSpinner = spinner('Calculating folder size...');
    const estimatedBytes = await calculateFolderSize(folderPath);
    sizeSpinner.succeed(`Size: ${formatSize(estimatedBytes)}`);

    // Check quota before deploying
    const quotaSpinner = spinner('Checking quota...');
    const quotaCheck = await checkQuota(subdomain, estimatedBytes);

    if (!quotaCheck.allowed) {
        quotaSpinner.fail('Deployment blocked due to quota limits');
        process.exit(1);
    }
    quotaSpinner.succeed('Quota check passed');

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
            console.log(`  Storage: ${formatSize(storageAfter)}/${quotaCheck.quota.limits.maxStorageMB}MB`);
            console.log('');
        }
        return;
    }

    // Perform actual upload
    try {
        // Get next version number for this subdomain (try API first, fallback to local)
        const versionSpinner = spinner('Fetching version info...');
        let version = await getNextVersionFromAPI(subdomain);
        if (version === null) {
            version = await getNextVersion(subdomain);
        }
        versionSpinner.succeed(`Deploying as version ${version}`);

        // Upload all files via API proxy
        const folderName = basename(folderPath);
        const uploadSpinner = spinner(`Uploading files... 0/${fileCount}`);

        const { totalBytes } = await uploadFolder(folderPath, subdomain, version, (uploaded, total, fileName) => {
            uploadSpinner.update(`Uploading files... ${uploaded}/${total} (${fileName})`);
        });

        uploadSpinner.succeed(`Uploaded ${fileCount} files (${formatSize(totalBytes)})`);

        // Finalize upload: set active version and record metadata
        const finalizeSpinner = spinner('Finalizing deployment...');
        await finalizeUpload(
            subdomain,
            version,
            fileCount,
            totalBytes,
            folderName,
            expiresAt?.toISOString() || null
        );
        finalizeSpinner.succeed('Deployment finalized');

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
        console.log(`\n${url}`);
        if (expiresAt) {
            warning(`Expires: ${formatTimeRemaining(expiresAt)}`);
        }

        // Show anonymous limit warnings
        if (!creds?.email) {
            console.log('');
            warning('⚠️  Anonymous deployment limits:');
            console.log('   • 3 active sites per IP');
            console.log('   • 50MB total storage');
            console.log('   • 7-day site expiration');
            console.log('');
            info('Run "launchpd register" to unlock unlimited sites and permanent storage!');
        }
        console.log('');
    } catch (err) {
        const suggestions = [];

        // Provide context-specific suggestions
        if (err.message.includes('fetch failed') || err.message.includes('ENOTFOUND')) {
            suggestions.push('Check your internet connection');
            suggestions.push('The API server may be temporarily unavailable');
        } else if (err.message.includes('401') || err.message.includes('Unauthorized')) {
            suggestions.push('Run "launchpd login" to authenticate');
            suggestions.push('Your API key may have expired');
        } else if (err.message.includes('413') || err.message.includes('too large')) {
            suggestions.push('Try deploying fewer or smaller files');
            suggestions.push('Check your storage quota with "launchpd quota"');
        } else if (err.message.includes('429') || err.message.includes('rate limit')) {
            suggestions.push('Wait a few minutes and try again');
            suggestions.push('You may be deploying too frequently');
        } else {
            suggestions.push('Try running with --verbose for more details');
            suggestions.push('Check https://status.launchpd.cloud for service status');
        }

        errorWithSuggestions(`Upload failed: ${err.message}`, suggestions, { verbose, cause: err });
        process.exit(1);
    }
}
