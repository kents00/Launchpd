#!/usr/bin/env node

import { config, validateConfig } from '../src/config.js';
import { info, success, error } from '../src/utils/logger.js';
import chalk from 'chalk';

/**
 * Setup script to validate and display configuration status
 */
async function setup() {
    console.log('\n' + chalk.bold.blue('═══════════════════════════════════════'));
    console.log(chalk.bold.blue('  Launchpd Configuration Check'));
    console.log(chalk.bold.blue('═══════════════════════════════════════\n'));

    // Check environment variables
    info('Checking configuration...\n');

    const validation = validateConfig();

    if (!validation.valid) {
        error(`Missing required environment variables:`);
        for (const missing of validation.missing) {
            console.log(chalk.red(`  ✗ ${missing}`));
        }
        console.log('\n' + chalk.yellow('Setup Instructions:'));
        console.log('  1. Copy .env.example to .env:');
        console.log(chalk.gray('     cp .env.example .env'));
        console.log('  2. Edit .env and add your Cloudflare R2 credentials');
        console.log('  3. Get credentials from: https://dash.cloudflare.com → R2 → API Tokens\n');
        process.exit(1);
    }

    // Display current configuration
    console.log(chalk.green('✓ All required environment variables set\n'));

    console.log(chalk.bold('Current Configuration:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.cyan('  Domain:        '), config.domain);
    console.log(chalk.cyan('  R2 Bucket:     '), config.r2.bucketName);
    console.log(chalk.cyan('  Account ID:    '), config.r2.accountId ? '✓ Set' : '✗ Missing');
    console.log(chalk.cyan('  Access Key:    '), config.r2.accessKeyId ? '✓ Set' : '✗ Missing');
    console.log(chalk.cyan('  Secret Key:    '), config.r2.secretAccessKey ? '✓ Set' : '✗ Missing');
    console.log(chalk.gray('─'.repeat(50)) + '\n');

    // Next steps
    console.log(chalk.bold('Next Steps:'));
    console.log(chalk.gray('  1. Test dry-run deployment:'));
    console.log(chalk.cyan('     npm run dev'));
    console.log(chalk.gray('  2. Deploy Worker:'));
    console.log(chalk.cyan('     cd worker && wrangler deploy'));
    console.log(chalk.gray('  3. Verify DNS settings in Cloudflare Dashboard:'));
    console.log(chalk.cyan(`     DNS → Records → Add A record * → 192.0.2.1 (Proxied)`));
    console.log(chalk.gray('  4. Deploy your first site:'));
    console.log(chalk.cyan('     launchpd deploy ./your-folder\n'));

    success('Setup validation complete!');
}

setup().catch(err => {
    error(`Setup failed: ${err.message}`);
    process.exit(1);
});
