#!/usr/bin/env node

import { config } from '../src/config.js';
import { info, success } from '../src/utils/logger.js';
import chalk from 'chalk';

/**
 * Setup script to display CLI information
 */
async function setup() {
    console.log('\n' + chalk.bold.blue('═══════════════════════════════════════'));
    console.log(chalk.bold.blue('  Launchpd CLI'));
    console.log(chalk.bold.blue('═══════════════════════════════════════\n'));

    info('Launchpd is ready to use!\n');

    console.log(chalk.bold('Configuration:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.cyan('  Domain:        '), config.domain);
    console.log(chalk.cyan('  API:           '), config.apiUrl);
    console.log(chalk.cyan('  Version:       '), config.version);
    console.log(chalk.gray('─'.repeat(50)) + '\n');

    console.log(chalk.bold('Quick Start:'));
    console.log(chalk.gray('  Deploy your first site:'));
    console.log(chalk.cyan('     launchpd deploy ./your-folder\n'));

    console.log(chalk.gray('  Login for more quota:'));
    console.log(chalk.cyan('     launchpd login\n'));

    console.log(chalk.gray('  List your deployments:'));
    console.log(chalk.cyan('     launchpd list\n'));

    success('No configuration needed - just deploy!');
}

setup().catch(err => {
    console.error(`Setup failed: ${err.message}`);
    process.exit(1);
});
