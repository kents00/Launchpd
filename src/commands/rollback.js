import { getVersionsForSubdomain, setActiveVersion, getActiveVersion } from '../utils/metadata.js';
import { getVersions as getVersionsFromAPI, rollbackVersion as rollbackViaAPI } from '../utils/api.js';
import { success, error, info, warning } from '../utils/logger.js';

/**
 * Rollback a subdomain to a previous version
 * @param {string} subdomain - Subdomain to rollback
 * @param {object} options - Command options
 * @param {number} options.to - Specific version to rollback to (optional)
 */
export async function rollback(subdomain, options) {
    try {
        info(`Checking versions for ${subdomain}...`);

        // Get all versions for this subdomain (try API first)
        let versions = [];
        let currentActive = 1;
        let useAPI = false;

        const apiResult = await getVersionsFromAPI(subdomain);
        if (apiResult && apiResult.versions) {
            versions = apiResult.versions.map(v => ({
                version: v.version,
                timestamp: v.created_at,
                fileCount: v.file_count,
            }));
            currentActive = apiResult.activeVersion || 1;
            useAPI = true;
        } else {
            // Fallback to R2 metadata
            versions = await getVersionsForSubdomain(subdomain);
            currentActive = await getActiveVersion(subdomain);
        }

        if (versions.length === 0) {
            error(`No deployments found for subdomain: ${subdomain}`);
            process.exit(1);
        }

        if (versions.length === 1) {
            warning('Only one version exists. Nothing to rollback to.');
            process.exit(1);
        }

        info(`Current active version: v${currentActive}`);

        // Determine target version
        let targetVersion;
        if (options.to) {
            targetVersion = Number.parseInt(options.to, 10);
            const versionExists = versions.some(v => v.version === targetVersion);
            if (!versionExists) {
                error(`Version ${targetVersion} does not exist.`);
                info('Available versions:');
                versions.forEach(v => {
                    info(`  v${v.version} - ${v.timestamp}`);
                });
                process.exit(1);
            }
        } else {
            // Default: rollback to previous version
            const sortedVersions = versions.map(v => v.version).sort((a, b) => b - a);
            const currentIndex = sortedVersions.indexOf(currentActive);
            if (currentIndex === sortedVersions.length - 1) {
                warning('Already at the oldest version. Cannot rollback further.');
                process.exit(1);
            }
            targetVersion = sortedVersions[currentIndex + 1];
        }

        if (targetVersion === currentActive) {
            warning(`Version ${targetVersion} is already active.`);
            process.exit(0);
        }

        info(`Rolling back from v${currentActive} to v${targetVersion}...`);

        // Set the target version as active
        if (useAPI) {
            // Use API for centralized rollback (updates both D1 and R2)
            const result = await rollbackViaAPI(subdomain, targetVersion);
            if (!result) {
                warning('API unavailable, falling back to local rollback');
                await setActiveVersion(subdomain, targetVersion);
            }
        } else {
            await setActiveVersion(subdomain, targetVersion);
        }

        // Find the target version's deployment record for file count
        const targetDeployment = versions.find(v => v.version === targetVersion);

        success(`Rolled back to v${targetVersion} successfully!`);
        console.log(`\n  🔄 https://${subdomain}.launchpd.cloud\n`);
        info(`Restored deployment from: ${targetDeployment?.timestamp || 'unknown'}`);

    } catch (err) {
        error(`Rollback failed: ${err.message}`);
        process.exit(1);
    }
}
