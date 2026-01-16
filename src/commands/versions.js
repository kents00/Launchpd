import { getVersionsForSubdomain, getActiveVersion } from '../utils/metadata.js';
import { getVersions as getVersionsFromAPI } from '../utils/api.js';
import { success, errorWithSuggestions, info, spinner, formatSize } from '../utils/logger.js';
import chalk from 'chalk';

/**
 * List all versions for a subdomain
 * @param {string} subdomain - Subdomain to list versions for
 * @param {object} options - Command options
 * @param {boolean} options.json - Output as JSON
 * @param {boolean} options.verbose - Show verbose error details
 */
export async function versions(subdomain, options) {
    const verbose = options.verbose || false;

    try {
        const fetchSpinner = spinner(`Fetching versions for ${subdomain}...`);

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
            fetchSpinner.fail(`No deployments found for: ${subdomain}`);
            errorWithSuggestions(`No deployments found for subdomain: ${subdomain}`, [
                'Check the subdomain name is correct',
                'Run "launchpd list" to see your deployments',
                'Deploy a new site with "launchpd deploy ./folder"',
            ], { verbose });
            process.exit(1);
        }

        fetchSpinner.succeed(`Found ${versionList.length} version(s)`);

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
        success(`Versions for ${chalk.cyan(subdomain)}.launchpd.cloud:`);
        console.log('');

        // Table header
        console.log(chalk.gray('  Version   Date                     Files    Size         Status'));
        console.log(chalk.gray('  ' + '─'.repeat(70)));

        for (const v of versionList) {
            const isActive = v.version === activeVersion;
            const versionStr = chalk.bold.cyan(`v${v.version}`);
            const date = chalk.gray(new Date(v.timestamp).toLocaleString());
            const files = chalk.white(`${v.fileCount} files`);
            const size = v.totalBytes ? chalk.white(formatSize(v.totalBytes)) : chalk.gray('unknown');
            const status = isActive
                ? chalk.green.bold('● active')
                : chalk.gray('○ inactive');

            console.log(`  ${versionStr.padEnd(18)}${date.padEnd(30)}${files.padEnd(12)}${size.padEnd(14)}${status}`);
        }

        console.log(chalk.gray('  ' + '─'.repeat(70)));
        console.log('');
        info(`Use ${chalk.cyan(`launchpd rollback ${subdomain} --to <n>`)} to restore a version.`);
        console.log('');

    } catch (err) {
        errorWithSuggestions(`Failed to list versions: ${err.message}`, [
            'Check your internet connection',
            'Verify the subdomain exists',
            'Try running with --verbose for more details',
        ], { verbose, cause: err });
        process.exit(1);
    }
}
