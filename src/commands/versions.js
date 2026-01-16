import { getVersionsForSubdomain, getActiveVersion } from '../utils/metadata.js';
import { getVersions as getVersionsFromAPI } from '../utils/api.js';
import { success, error, info } from '../utils/logger.js';

/**
 * List all versions for a subdomain
 * @param {string} subdomain - Subdomain to list versions for
 * @param {object} options - Command options
 * @param {boolean} options.json - Output as JSON
 */
export async function versions(subdomain, options) {
    try {
        info(`Fetching versions for ${subdomain}...`);

        let versionList = [];
        let activeVersion = 1;

        // Try API first
        const apiResult = await getVersionsFromAPI(subdomain);
        if (apiResult && apiResult.versions) {
            versionList = apiResult.versions.map(v => ({
                version: v.version,
                timestamp: v.created_at,
                fileCount: v.file_count,
                totalBytes: v.total_bytes,
            }));
            activeVersion = apiResult.activeVersion || 1;
        } else {
            // Fallback to R2 metadata
            versionList = await getVersionsForSubdomain(subdomain);
            activeVersion = await getActiveVersion(subdomain);
        }

        if (versionList.length === 0) {
            error(`No deployments found for subdomain: ${subdomain}`);
            process.exit(1);
        }

        if (options.json) {
            console.log(JSON.stringify({
                subdomain,
                activeVersion,
                versions: versionList.map(v => ({
                    version: v.version,
                    timestamp: v.timestamp,
                    fileCount: v.fileCount,
                    totalBytes: v.totalBytes,
                    isActive: v.version === activeVersion,
                })),
            }, null, 2));
            return;
        }

        console.log('');
        success(`Versions for ${subdomain}.launchpd.cloud:`);
        console.log('');

        for (const v of versionList) {
            const isActive = v.version === activeVersion;
            const activeMarker = isActive ? ' ← active' : '';
            const sizeKB = v.totalBytes ? `${(v.totalBytes / 1024).toFixed(1)} KB` : 'unknown size';
            const date = new Date(v.timestamp).toLocaleString();

            console.log(`  v${v.version}  │  ${date}  │  ${v.fileCount} files  │  ${sizeKB}${activeMarker}`);
        }

        console.log('');
        info(`Use 'launchpd rollback ${subdomain} --to <n>' to restore a version.`);
        console.log('');

    } catch (err) {
        error(`Failed to list versions: ${err.message}`);
        process.exit(1);
    }
}
