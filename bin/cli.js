#!/usr/bin/env node

import { Command } from 'commander';
import { deploy } from '../src/commands/deploy.js';
import { list } from '../src/commands/list.js';
import { rollback } from '../src/commands/rollback.js';
import { versions } from '../src/commands/versions.js';
import { login, logout, register, whoami, quota } from '../src/commands/auth.js';

const program = new Command();

program
    .name('launchpd')
    .description('Deploy static sites instantly to a live URL')
    .version('0.1.0');

program
    .command('deploy')
    .description('Deploy a folder to a live URL')
    .argument('<folder>', 'Path to the folder to deploy')
    .option('--dry-run', 'Simulate deployment without uploading to R2')
    .option('--name <subdomain>', 'Use a custom subdomain (optional)')
    .option('--expires <time>', 'Auto-delete after time (e.g., 30m, 2h, 1d). Minimum: 30m')
    .option('--verbose', 'Show detailed error information')
    .action(async (folder, options) => {
        await deploy(folder, options);
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

program.parseAsync();
