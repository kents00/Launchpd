import { getLocalDeployments } from '../utils/localConfig.js';
import { listDeployments as listFromAPI } from '../utils/api.js';
import { errorWithSuggestions, info, spinner, formatSize } from '../utils/logger.js';
import { formatTimeRemaining, isExpired } from '../utils/expiration.js';
import chalk from 'chalk';

/**
 * List all deployments (from API or local storage)
 * @param {object} options - Command options
 * @param {boolean} options.json - Output as JSON
 * @param {boolean} options.local - Only show local deployments
 * @param {boolean} options.verbose - Show verbose error details
 */
export async function list(options) {
    const verbose = options.verbose || false;

    try {
        let deployments = [];
        let source = 'local';

        const fetchSpinner = spinner('Fetching deployments...');

        // Try API first unless --local flag is set
        if (!options.local) {
            const apiResult = await listFromAPI();
            if (apiResult && apiResult.deployments) {
                deployments = apiResult.deployments.map(d => ({
                    subdomain: d.subdomain,
                    folderName: d.folder_name,
                    fileCount: d.file_count,
                    totalBytes: d.total_bytes,
                    version: d.version,
                    timestamp: d.created_at,
                    expiresAt: d.expires_at,
                    isActive: d.active_version === d.version,
                }));
                source = 'api';
            }
        }

        // Fallback to local storage if API unavailable
        if (deployments.length === 0) {
            deployments = await getLocalDeployments();
            source = 'local';
        }

        if (deployments.length === 0) {
            fetchSpinner.warn('No deployments found');
            info('Deploy a folder with: ' + chalk.cyan('launchpd deploy ./my-folder'));
            return;
        }

        fetchSpinner.succeed(`Found ${deployments.length} deployment(s)`);

        if (options.json) {
            console.log(JSON.stringify(deployments, null, 2));
            return;
        }

        // Display as table
        console.log('');
        console.log(chalk.bold('Your Deployments:'));
        console.log(chalk.gray('─'.repeat(100)));

        // Header
        console.log(
            chalk.gray(
                padRight('URL', 40) +
                padRight('Folder', 15) +
                padRight('Files', 7) +
                padRight('Size', 12) +
                padRight('Date', 12) +
                'Status'
            )
        );
        console.log(chalk.gray('─'.repeat(100)));

        // Rows (most recent first)
        const sorted = [...deployments].reverse();
        for (const dep of sorted) {
            const url = `https://${dep.subdomain}.launchpd.cloud`;
            const date = new Date(dep.timestamp).toLocaleDateString();
            const size = dep.totalBytes ? formatSize(dep.totalBytes) : '-';

            // Determine status with colors
            let status;
            if (dep.expiresAt) {
                if (isExpired(dep.expiresAt)) {
                    status = chalk.red.bold('● expired');
                } else {
                    status = chalk.yellow(`⏱ ${formatTimeRemaining(dep.expiresAt)}`);
                }
            } else {
                status = chalk.green.bold('● active');
            }

            // Version badge
            const versionBadge = chalk.magenta(`v${dep.version || 1}`);

            console.log(
                chalk.cyan(padRight(url, 40)) +
                chalk.white(padRight(dep.folderName || '-', 15)) +
                chalk.white(padRight(String(dep.fileCount), 7)) +
                chalk.white(padRight(size, 12)) +
                chalk.gray(padRight(date, 12)) +
                status + ' ' + versionBadge
            );
        }

        console.log(chalk.gray('─'.repeat(100)));
        const syncStatus = source === 'api'
            ? chalk.green(' ✓ synced')
            : chalk.yellow(' ⚠ local only');
        console.log(chalk.gray(`Total: ${deployments.length} deployment(s)`) + syncStatus);
        console.log('');

    } catch (err) {
        errorWithSuggestions(`Failed to list deployments: ${err.message}`, [
            'Check your internet connection',
            'Use --local flag to show local deployments only',
            'Try running with --verbose for more details',
        ], { verbose, cause: err });
        process.exit(1);
    }
}

/**
 * Pad string to the right
 */
function padRight(str, len) {
    if (str.length >= len) return str.substring(0, len - 1) + ' ';
    return str + ' '.repeat(len - str.length);
}
