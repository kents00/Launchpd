#!/usr/bin/env node

import fs from 'fs';
import { Command } from 'commander';
import updateNotifier from 'update-notifier';
import { deploy, list, rollback, versions, init, status, login, logout, register, whoami, quota, resendEmailVerification } from '../src/commands/index.js';
import { config } from '../src/config.js';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
updateNotifier({ pkg: packageJson }).notify();


const program = new Command();

program
    .name('launchpd')
    .description('Deploy static sites instantly to a live URL')
    .version(packageJson.version);

program
    .command('deploy')
    .description('Deploy a folder to a live URL')
    .argument('[folder]', 'Path to the folder to deploy', '.')
    .option('--name <subdomain>', 'Use a custom subdomain (optional)')
    .option('-m, --message <text>', 'Deployment message (optional)')
    .option('--expires <time>', 'Auto-delete after time (e.g., 30m, 2h, 1d). Minimum: 30m')
    .option('-y, --yes', 'Auto-confirm all prompts')
    .option('--force', 'Force deployment even with warnings')
    .option('-o, --open', 'Open the site URL in the default browser after deployment')
    .option('--verbose', 'Show detailed error information')
    .option('--qr', 'Show QR code for deployment')
    .action(async (folder, options) => {
        await deploy(folder || '.', options);
    });

program
    .command('list')
    .description('List your past deployments')
    .option('--json', 'Output as JSON')
    .option('--local', 'Only show local deployments')
    .option('--verbose', 'Show detailed error information')
    .action(async (options) => {
        await list(options);
    });

program
    .command('versions')
    .description('List all versions for a subdomain')
    .argument('<subdomain>', 'The subdomain to list versions for')
    .option('--json', 'Output as JSON')
    .option('--to <n>', 'Specific version number to rollback to (use with rollback)')
    .option('--verbose', 'Show detailed error information')
    .action(async (subdomain, options) => {
        await versions(subdomain, options);
    });

program
    .command('rollback')
    .description('Rollback a subdomain to a previous version')
    .argument('<subdomain>', 'The subdomain to rollback')
    .option('--to <n>', 'Specific version number to rollback to')
    .option('--verbose', 'Show detailed error information')
    .action(async (subdomain, options) => {
        await rollback(subdomain, options);
    });

program
    .command('init')
    .description('Initialize a new project in the current directory')
    .option('--name <subdomain>', 'Subdomain to link to')
    .action(async (options) => {
        await init(options);
    });

program
    .command('status')
    .description('Show current project status')
    .action(async () => {
        await status();
    });

// Authentication commands
program
    .command('login')
    .description('Login with your API key')
    .action(async () => {
        await login();
    });

program
    .command('logout')
    .description('Clear stored credentials')
    .action(async () => {
        await logout();
    });

program
    .command('register')
    .description('Open browser to create a new account')
    .action(async () => {
        await register();
    });

program
    .command('whoami')
    .description('Show current user info and quota status')
    .action(async () => {
        await whoami();
    });

program
    .command('quota')
    .description('Check current quota and usage')
    .action(async () => {
        await quota();
    });

program
    .command('verify')
    .description('Resend email verification')
    .action(async () => {
        await resendEmailVerification();
    });

program.parseAsync();
