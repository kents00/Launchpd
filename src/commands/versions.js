import { getVersionsForSubdomain, getActiveVersion } from '../utils/metadata.js';
import { getVersions as getVersionsFromAPI } from '../utils/api.js';
import { isLoggedIn } from '../utils/credentials.js';
import { success, errorWithSuggestions, info, spinner, formatSize } from '../utils/logger.js';
import chalk from 'chalk';

/**
 * List all versions for a subdomain
 * @param {string} subdomain - Subdomain to list versions for
 * @param {object} options - Command options
 * @param {boolean} options.json - Output as JSON
 * @param {boolean} options.verbose - Show verbose error details
 */
export async function versions(subdomainInput, options) {
    const subdomain = subdomainInput.toLowerCase();
    const verbose = options.verbose || false;

    if (!await isLoggedIn()) {
        errorWithSuggestions('The versions feature is only available for authenticated users.', [
            'Run "launchpd login" to log in to your account',
            'Run "launchpd register" to create a new account',
        ], { verbose });
        process.exit(1);
    }

    try {
        const fetchSpinner = spinner(`Fetching versions for ${subdomain}...`);

        let versionList = [];
        let activeVersion = 1;

        // Try API first
        const apiResult = await getVersionsFromAPI(subdomain);
        if (apiResult && apiResult.versions) {
            versionList = apiResult.versions.map(v => ({
                version: v.version,
                timestamp: v.created_at || v.timestamp,
                fileCount: v.file_count || v.fileCount,
                totalBytes: v.total_bytes || v.totalBytes,
                message: v.message || '',
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
                    message: v.message,
                })),
            }, null, 2));
            return;
        }

        console.log('');
        success(`Versions for ${chalk.cyan(subdomain)}.launchpd.cloud:`);
        console.log('');

        // Table header
        console.log(chalk.gray('  Version   Date                     Files    Size         Status       Message'));
        console.log(chalk.gray('  ' + '─'.repeat(100)));

        for (const v of versionList) {
            const isActive = v.version === activeVersion;

            // Format raw strings for correct padding calculation
            const versionRaw = `v${v.version}`;
            const dateRaw = new Date(v.timestamp).toLocaleString();
            const filesRaw = `${v.fileCount} files`;
            const sizeRaw = v.totalBytes ? formatSize(v.totalBytes) : 'unknown';

            // Apply colors and padding separately
            const versionStr = chalk.bold.cyan(versionRaw.padEnd(12));
            const dateStr = chalk.gray(dateRaw.padEnd(25));
            const filesStr = chalk.white(filesRaw.padEnd(10));
            const sizeStr = chalk.white(sizeRaw.padEnd(12));
            const statusStr = isActive
                ? chalk.green.bold('● active'.padEnd(12))
                : chalk.gray('○ inactive'.padEnd(12));

            const messageStr = chalk.italic.gray(v.message || '');

            console.log(`  ${versionStr}${dateStr}${filesStr}${sizeStr}${statusStr}${messageStr}`);
        }

        console.log(chalk.gray('  ' + '─'.repeat(100)));
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
