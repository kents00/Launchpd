/**
 * Authentication commands for StaticLaunch CLI
 * login, logout, register, whoami
 */

import { createInterface } from 'node:readline';
import { exec } from 'node:child_process';
import { config } from '../config.js';
import { getCredentials, saveCredentials, clearCredentials, isLoggedIn } from '../utils/credentials.js';
import { success, error, info, warning } from '../utils/logger.js';

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
    } catch (err) {
        error(`Failed to validate API key: ${err.message}`);
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
        warning(`Already logged in as ${creds.email || creds.userId}`);
        info('Run "launchpd logout" to switch accounts');
        return;
    }

    console.log('\n🔐 Launchpd Login\n');
    console.log('Enter your API key from the dashboard.');
    console.log(`Don't have one? Run "launchpd register" first.\n`);

    const apiKey = await prompt('API Key: ');

    if (!apiKey) {
        error('API key is required');
        process.exit(1);
    }

    info('Validating API key...');

    const result = await validateApiKey(apiKey);

    if (!result) {
        error('Invalid API key. Please check and try again.');
        console.log(`\nGet your API key at: https://portal.${config.domain}/api-keys`);
        process.exit(1);
    }

    // Save credentials
    await saveCredentials({
        apiKey,
        userId: result.user?.id,
        email: result.user?.email,
        tier: result.tier,
    });

    success(`Logged in successfully!`);
    console.log(`\n  Email: ${result.user?.email || 'N/A'}`);
    console.log(`  Tier: ${result.tier}`);
    console.log(`  Sites: ${result.usage?.siteCount || 0}/${result.limits?.maxSites || '?'}`);
    console.log(`  Storage: ${result.usage?.storageUsedMB || 0}MB/${result.limits?.maxStorageMB || '?'}MB\n`);
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

    success(`Logged out successfully`);
    if (creds?.email) {
        info(`Was logged in as: ${creds.email}`);
    }
    console.log(`\nYou can still deploy anonymously (limited to 3 sites, 50MB).`);
}

/**
 * Register command - opens browser to registration page
 */
export async function register() {
    console.log('\n🚀 Register for Launchpd\n');
    console.log(`Opening registration page: ${REGISTER_URL}\n`);

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
            console.log(`Please open this URL in your browser:\n  ${REGISTER_URL}\n`);
        }
    });

    console.log('After registering:');
    console.log('  1. Get your API key from the dashboard');
    console.log('  2. Run: launchpd login');
    console.log('');

    info('Registration benefits:');
    console.log('  ✓ 10 sites (instead of 3)');
    console.log('  ✓ 100MB storage (instead of 50MB)');
    console.log('  ✓ 30-day retention (instead of 7 days)');
    console.log('  ✓ 10 versions per site');
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
        console.log('  • 3 sites maximum');
        console.log('  • 50MB total storage');
        console.log('  • 7-day retention');
        console.log('  • 1 version per site');
        console.log(`\nRun "launchpd login" to authenticate`);
        console.log(`Run "launchpd register" to create an account\n`);
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

    console.log(`\n👤 Logged in as: ${result.user?.email || result.user?.id}\n`);

    console.log('Account Info:');
    console.log(`  User ID: ${result.user?.id}`);
    console.log(`  Email: ${result.user?.email || 'Not set'}`);
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
        console.log('\n📊 Anonymous Quota Status\n');
        console.log('You are not logged in.');
        console.log('');
        console.log('Anonymous tier limits:');
        console.log('  ┌─────────────────────────────────┐');
        console.log('  │ Sites:      3 maximum           │');
        console.log('  │ Storage:    50MB total          │');
        console.log('  │ Retention:  7 days              │');
        console.log('  │ Versions:   1 per site          │');
        console.log('  └─────────────────────────────────┘');
        console.log('');
        console.log('💡 Register for FREE to unlock more:');
        console.log('   → 10 sites');
        console.log('   → 100MB storage');
        console.log('   → 30-day retention');
        console.log('   → 10 versions per site');
        console.log('');
        console.log('Run: launchpd register');
        console.log('');
        return;
    }

    info('Fetching quota status...');

    const result = await validateApiKey(creds.apiKey);

    if (!result) {
        error('Failed to fetch quota. API key may be invalid.');
        process.exit(1);
    }

    console.log(`\n📊 Quota Status for: ${result.user?.email || creds.email}\n`);

    // Sites usage
    const sitesUsed = result.usage?.siteCount || 0;
    const sitesMax = result.limits?.maxSites || 10;
    const sitesPercent = Math.round((sitesUsed / sitesMax) * 100);
    const sitesBar = createProgressBar(sitesUsed, sitesMax);

    console.log(`Sites:    ${sitesBar} ${sitesUsed}/${sitesMax} (${sitesPercent}%)`);

    // Storage usage
    const storageMB = result.usage?.storageUsedMB || 0;
    const storageMaxMB = result.limits?.maxStorageMB || 100;
    const storagePercent = Math.round((storageMB / storageMaxMB) * 100);
    const storageBar = createProgressBar(storageMB, storageMaxMB);

    console.log(`Storage:  ${storageBar} ${storageMB}MB/${storageMaxMB}MB (${storagePercent}%)`);

    console.log('');
    console.log(`Tier:         ${result.tier || 'free'}`);
    console.log(`Retention:    ${result.limits?.retentionDays || 30} days`);
    console.log(`Max versions: ${result.limits?.maxVersionsPerSite || 10} per site`);
    console.log('');

    // Status indicators
    if (result.canCreateNewSite === false) {
        warning('⚠️ Site limit reached - cannot create new sites');
    }

    if (storagePercent > 80) {
        warning(`⚠️ Storage ${storagePercent}% used - consider cleaning up old deployments`);
    }

    if (result.tier === 'free') {
        console.log('');
        info('💎 Upgrade to Pro for 50 sites, 1GB storage, and 50 versions');
    }
    console.log('');
}

/**
 * Create a simple progress bar
 */
function createProgressBar(current, max, width = 20) {
    const filled = Math.round((current / max) * width);
    const empty = width - filled;
    const percent = (current / max) * 100;

    let bar = '';
    if (percent >= 90) {
        bar = '█'.repeat(filled) + '░'.repeat(empty);
    } else if (percent >= 70) {
        bar = '█'.repeat(filled) + '░'.repeat(empty);
    } else {
        bar = '█'.repeat(filled) + '░'.repeat(empty);
    }

    return `[${bar}]`;
}
