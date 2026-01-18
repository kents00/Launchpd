/**
 * Authentication commands for StaticLaunch CLI
 * login, logout, register, whoami
 */

import { createInterface } from 'node:readline';
import { exec } from 'node:child_process';
import { config } from '../config.js';
import { getCredentials, saveCredentials, clearCredentials, isLoggedIn } from '../utils/credentials.js';
import { success, error, errorWithSuggestions, info, warning, spinner } from '../utils/logger.js';
import chalk from 'chalk';

const API_BASE_URL = `https://api.${config.domain}`;
const REGISTER_URL = `https://portal.${config.domain}/auth/register`;

/**
 * Prompt for user input
 */
function prompt(question) {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

/**
 * Validate API key with the server
 */
async function validateApiKey(apiKey) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/quota`, {
            headers: {
                'X-API-Key': apiKey,
            },
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        if (data.authenticated) {
            return data;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Login command - prompts for API key and validates it
 */
export async function login() {
    // Check if already logged in
    if (await isLoggedIn()) {
        const creds = await getCredentials();
        warning(`Already logged in as ${chalk.cyan(creds.email || creds.userId)}`);
        info('Run "launchpd logout" to switch accounts');
        return;
    }

    console.log('\nLaunchpd Login\n');
    console.log('Enter your API key from the dashboard.');
    console.log(`Don't have one? Run ${chalk.cyan('"launchpd register"')} first.\n`);

    const apiKey = await prompt('API Key: ');

    if (!apiKey) {
        errorWithSuggestions('API key is required', [
            'Get your API key from the dashboard',
            `Visit: https://portal.${config.domain}/api-keys`,
            'Run "launchpd register" if you don\'t have an account',
        ]);
        process.exit(1);
    }

    const validateSpinner = spinner('Validating API key...');

    const result = await validateApiKey(apiKey);

    if (!result) {
        validateSpinner.fail('Invalid API key');
        errorWithSuggestions('Please check and try again.', [
            `Get your API key at: https://portal.${config.domain}/api-keys`,
            'Make sure you copied the full key',
            'API keys start with "lpd_"',
        ]);
        process.exit(1);
    }

    // Save credentials
    await saveCredentials({
        apiKey,
        userId: result.user?.id,
        email: result.user?.email,
        tier: result.tier,
    });

    validateSpinner.succeed('Logged in successfully!');
    console.log('');
    console.log(`  ${chalk.gray('Email:')} ${chalk.cyan(result.user?.email || 'N/A')}`);
    console.log(`  ${chalk.gray('Tier:')} ${chalk.green(result.tier)}`);
    console.log(`  ${chalk.gray('Sites:')} ${result.usage?.siteCount || 0}/${result.limits?.maxSites || '?'}`);
    console.log(`  ${chalk.gray('Storage:')} ${result.usage?.storageUsedMB || 0}MB/${result.limits?.maxStorageMB || '?'}MB`);
    console.log('');
}

/**
 * Logout command - clears stored credentials
 */
export async function logout() {
    const loggedIn = await isLoggedIn();

    if (!loggedIn) {
        warning('Not currently logged in');
        return;
    }

    const creds = await getCredentials();
    await clearCredentials();

    success('Logged out successfully');
    if (creds?.email) {
        info(`Was logged in as: ${chalk.cyan(creds.email)}`);
    }
    console.log(`\nYou can still deploy anonymously (limited to ${chalk.yellow('3 sites')}, ${chalk.yellow('50MB')}).`);
}

/**
 * Register command - opens browser to registration page
 */
export async function register() {
    console.log('\nRegister for Launchpd\n');
    console.log(`Opening registration page: ${chalk.cyan(REGISTER_URL)}\n`);

    // Open browser based on platform
    const platform = process.platform;
    let cmd;

    if (platform === 'darwin') {
        cmd = `open "${REGISTER_URL}"`;
    } else if (platform === 'win32') {
        cmd = `start "" "${REGISTER_URL}"`;
    } else {
        cmd = `xdg-open "${REGISTER_URL}"`;
    }

    exec(cmd, (err) => {
        if (err) {
            console.log(`Please open this URL in your browser:\n  ${chalk.cyan(REGISTER_URL)}\n`);
        }
    });

    console.log('After registering:');
    console.log(`  1. Get your API key from the dashboard`);
    console.log(`  2. Run: ${chalk.cyan('launchpd login')}`);
    console.log('');

    info('Registration benefits:');
    console.log(`  ${chalk.green('✓')} ${chalk.white('10 sites')} ${chalk.gray('(instead of 3)')}`);
    console.log(`  ${chalk.green('✓')} ${chalk.white('100MB storage')} ${chalk.gray('(instead of 50MB)')}`);
    console.log(`  ${chalk.green('✓')} ${chalk.white('30-day retention')} ${chalk.gray('(instead of 7 days)')}`);
    console.log(`  ${chalk.green('✓')} ${chalk.white('10 versions per site')}`);
    console.log('');
}

/**
 * Whoami command - shows current user info and quota status
 */
export async function whoami() {
    const creds = await getCredentials();

    if (!creds) {
        console.log('\n👤 Not logged in (anonymous mode)\n');
        console.log('Anonymous limits:');
        console.log(`  • ${chalk.white('3 sites')} maximum`);
        console.log(`  • ${chalk.white('50MB')} total storage`);
        console.log(`  • ${chalk.white('7-day')} retention`);
        console.log(`  • ${chalk.white('1 version')} per site`);
        console.log(`\nRun ${chalk.cyan('"launchpd login"')} to authenticate`);
        console.log(`Run ${chalk.cyan('"launchpd register"')} to create an account\n`);
        return;
    }

    info('Fetching account status...');

    // Validate and get current quota
    const result = await validateApiKey(creds.apiKey);

    if (!result) {
        warning('Session expired or API key invalid');
        await clearCredentials();
        error('Please login again with: launchpd login');
        process.exit(1);
    }

    console.log(`\nLogged in as: ${result.user?.email || result.user?.id}\n`);

    console.log('Account Info:');
    console.log(`  User ID: ${result.user?.id}`);
    console.log(`  Email: ${result.user?.email || 'Not set'} ${result.user?.email_verified ? chalk.green('(Verified)') : chalk.yellow('(Unverified)')}`);
    console.log(`  2FA: ${result.user?.is_2fa_enabled ? chalk.green('Enabled') : chalk.gray('Disabled')}`);
    console.log(`  Tier: ${result.tier}`);
    console.log('');

    console.log('Usage:');
    console.log(`  Sites: ${result.usage?.siteCount || 0} / ${result.limits?.maxSites}`);
    console.log(`  Storage: ${result.usage?.storageUsedMB || 0}MB / ${result.limits?.maxStorageMB}MB`);
    console.log(`  Sites remaining: ${result.usage?.sitesRemaining || 0}`);
    console.log(`  Storage remaining: ${result.usage?.storageRemainingMB || 0}MB`);
    console.log('');

    console.log('Limits:');
    console.log(`  Max versions per site: ${result.limits?.maxVersionsPerSite}`);
    console.log(`  Retention: ${result.limits?.retentionDays} days`);
    console.log('');

    // Show warnings
    if (result.warnings && result.warnings.length > 0) {
        console.log('⚠️ Warnings:');
        result.warnings.forEach(w => console.log(`  ${w}`));
        console.log('');
    }

    if (!result.canCreateNewSite) {
        warning('You cannot create new sites (limit reached)');
        info('You can still update existing sites');
    }
}

/**
 * Quota command - shows detailed quota information
 */
export async function quota() {
    const creds = await getCredentials();

    if (!creds) {
        console.log(`\n${chalk.bold('Anonymous Quota Status')}\n`);
        console.log(chalk.gray('You are not logged in.'));
        console.log('');
        console.log(chalk.bold('Anonymous tier limits:'));
        console.log(chalk.gray('  ┌─────────────────────────────────┐'));
        console.log(chalk.gray('  │') + ` Sites:      ${chalk.white('3 maximum')}           ` + chalk.gray('│'));
        console.log(chalk.gray('  │') + ` Storage:    ${chalk.white('50MB total')}          ` + chalk.gray('│'));
        console.log(chalk.gray('  │') + ` Retention:  ${chalk.white('7 days')}              ` + chalk.gray('│'));
        console.log(chalk.gray('  │') + ` Versions:   ${chalk.white('1 per site')}          ` + chalk.gray('│'));
        console.log(chalk.gray('  └─────────────────────────────────┘'));
        console.log('');
        console.log(`${chalk.cyan('Register for FREE')} to unlock more:`);
        console.log(`   ${chalk.green('→')} ${chalk.white('10 sites')}`);
        console.log(`   ${chalk.green('→')} ${chalk.white('100MB storage')}`);
        console.log(`   ${chalk.green('→')} ${chalk.white('30-day retention')}`);
        console.log(`   ${chalk.green('→')} ${chalk.white('10 versions per site')}`);
        console.log('');
        console.log(`Run: ${chalk.cyan('launchpd register')}`);
        console.log('');
        return;
    }

    const fetchSpinner = spinner('Fetching quota status...');

    const result = await validateApiKey(creds.apiKey);

    if (!result) {
        fetchSpinner.fail('Failed to fetch quota');
        errorWithSuggestions('API key may be invalid.', [
            'Run "launchpd login" to re-authenticate',
            'Check your internet connection',
        ]);
        process.exit(1);
    }

    fetchSpinner.succeed('Quota fetched');
    console.log(`\n${chalk.bold('Quota Status for:')} ${chalk.cyan(result.user?.email || creds.email)}\n`);

    // Sites usage
    const sitesUsed = result.usage?.siteCount || 0;
    const sitesMax = result.limits?.maxSites || 10;
    const sitesPercent = Math.round((sitesUsed / sitesMax) * 100);
    const sitesBar = createProgressBar(sitesUsed, sitesMax);

    console.log(`${chalk.gray('Sites:')}    ${sitesBar} ${chalk.white(sitesUsed)}/${sitesMax} (${getPercentColor(sitesPercent)})`);

    // Storage usage
    const storageMB = result.usage?.storageUsedMB || 0;
    const storageMaxMB = result.limits?.maxStorageMB || 100;
    const storagePercent = Math.round((storageMB / storageMaxMB) * 100);
    const storageBar = createProgressBar(storageMB, storageMaxMB);

    console.log(`${chalk.gray('Storage:')}  ${storageBar} ${chalk.white(storageMB)}MB/${storageMaxMB}MB (${getPercentColor(storagePercent)})`);

    console.log('');
    console.log(`${chalk.gray('Tier:')}         ${chalk.green(result.tier || 'free')}`);
    console.log(`${chalk.gray('Retention:')}    ${chalk.white(result.limits?.retentionDays || 30)} days`);
    console.log(`${chalk.gray('Max versions:')} ${chalk.white(result.limits?.maxVersionsPerSite || 10)} per site`);
    console.log('');

    // Status indicators
    if (result.canCreateNewSite === false) {
        warning('Site limit reached - cannot create new sites');
    }

    if (storagePercent > 80) {
        warning(`Storage ${storagePercent}% used - consider cleaning up old deployments`);
    }

    if (result.tier === 'free') {
        console.log('');
        info(`Upgrade to ${chalk.magenta('Pro')} for 50 sites, 1GB storage, and 50 versions`);
    }
    console.log('');
}

/**
 * Create a simple progress bar with color coding
 */
function createProgressBar(current, max, width = 20) {
    const filled = Math.round((current / max) * width);
    const empty = width - filled;
    const percent = (current / max) * 100;

    const filledChar = '█';
    let barColor;

    if (percent >= 90) {
        barColor = chalk.red;
    } else if (percent >= 70) {
        barColor = chalk.yellow;
    } else {
        barColor = chalk.green;
    }

    const bar = barColor(filledChar.repeat(filled)) + chalk.gray('░'.repeat(empty));
    return `[${bar}]`;
}

/**
 * Get colored percentage text
 */
function getPercentColor(percent) {
    if (percent >= 90) {
        return chalk.red(`${percent}%`);
    } else if (percent >= 70) {
        return chalk.yellow(`${percent}%`);
    }
    return chalk.green(`${percent}%`);
}
