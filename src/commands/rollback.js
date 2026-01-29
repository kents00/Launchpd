import { getVersionsForSubdomain, setActiveVersion, getActiveVersion } from '../utils/metadata.js';
import { getVersions as getVersionsFromAPI, rollbackVersion as rollbackViaAPI } from '../utils/api.js';
import { error, errorWithSuggestions, info, warning, spinner, log } from '../utils/logger.js';
import chalk from 'chalk';

/**
 * Rollback a subdomain to a previous version
 * @param {string} subdomain - Subdomain to rollback
 * @param {object} options - Command options
 * @param {number} options.to - Specific version to rollback to (optional)
 * @param {boolean} options.verbose - Show verbose error details
 */
export async function rollback(subdomainInput, options) {
    const subdomain = subdomainInput.toLowerCase();
    const verbose = options.verbose || false;

    try {
        const fetchSpinner = spinner(`Checking versions for ${subdomain}...`);

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
                message: v.message,
            }));
            currentActive = apiResult.activeVersion || 1;
            useAPI = true;
        } else {
            // Fallback to R2 metadata
            versions = await getVersionsForSubdomain(subdomain);
            currentActive = await getActiveVersion(subdomain);
        }

        if (versions.length === 0) {
            fetchSpinner.fail('No deployments found');
            errorWithSuggestions(`No deployments found for subdomain: ${subdomain}`, [
                'Check the subdomain name is correct',
                'Run "launchpd list" to see your deployments',
            ], { verbose });
            process.exit(1);
        }

        if (versions.length === 1) {
            fetchSpinner.warn('Only one version exists');
            warning('Nothing to rollback to.');
            process.exit(1);
        }

        fetchSpinner.succeed(`Found ${versions.length} versions`);
        info(`Current active version: ${chalk.cyan(`v${currentActive}`)}`);

        // Determine target version
        let targetVersion;
        if (options.to) {
            targetVersion = Number.parseInt(options.to, 10);
            const versionExists = versions.some(v => v.version === targetVersion);
            if (!versionExists) {
                error(`Version ${targetVersion} does not exist.`);
                log('');
                info('Available versions:');
                versions.forEach(v => {
                    const isActive = v.version === currentActive;
                    const marker = isActive ? chalk.green(' (active)') : '';
                    const message = v.message ? ` - "${v.message}"` : '';
                    log(`  ${chalk.cyan(`v${v.version}`)}${message} - ${chalk.gray(v.timestamp)}${marker}`);
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
            warning(`Version ${chalk.cyan(`v${targetVersion}`)} is already active.`);
            process.exit(0);
        }

        const rollbackSpinner = spinner(`Rolling back from v${currentActive} to v${targetVersion}...`);

        // Set the target version as active
        if (useAPI) {
            // Use API for centralized rollback (updates both D1 and R2)
            const result = await rollbackViaAPI(subdomain, targetVersion);
            if (!result) {
                rollbackSpinner.warn('API unavailable, using local rollback');
                await setActiveVersion(subdomain, targetVersion);
            }
        } else {
            await setActiveVersion(subdomain, targetVersion);
        }

        // Find the target version's deployment record for file count
        const targetDeployment = versions.find(v => v.version === targetVersion);

        rollbackSpinner.succeed(`Rolled back to ${chalk.cyan(`v${targetVersion}`)}`);
        log(`\n  🔄 https://${subdomain}.launchpd.cloud\n`);
        if (targetDeployment?.message) {
            info(`Version message: "${chalk.italic(targetDeployment.message)}"`);
        }
        info(`Restored deployment from: ${chalk.gray(targetDeployment?.timestamp || 'unknown')}`);

    } catch (err) {
        errorWithSuggestions(`Rollback failed: ${err.message}`, [
            'Check your internet connection',
            'Verify the subdomain and version exist',
            'Run "launchpd versions <subdomain>" to see available versions',
        ], { verbose, cause: err });
        process.exit(1);
    }
}
