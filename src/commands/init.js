import { initProjectConfig, findProjectRoot } from '../utils/projectConfig.js';
import { checkSubdomainAvailable, reserveSubdomain } from '../utils/api.js';
import { isLoggedIn } from '../utils/credentials.js';
import { success, errorWithSuggestions, info, spinner, warning } from '../utils/logger.js';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

/**
 * Initialize a new project in the current directory
 * @param {object} options - Command options
 * @param {string} options.name - Optional subdomain name
 */
export async function init(options) {
    const projectRoot = findProjectRoot();
    if (projectRoot) {
        warning('This directory is already part of a Launchpd project.');
        info(`Project root: ${projectRoot}`);
        return;
    }

    if (!await isLoggedIn()) {
        errorWithSuggestions('You must be logged in to initialize a project.', [
            'Run "launchpd login" to log in',
            'Run "launchpd register" to create an account'
        ]);
        process.exit(1);
    }

    const rl = readline.createInterface({ input, output });
    let subdomain = options.name;

    if (!subdomain) {
        info('Linking this directory to a Launchpd subdomain...');
        subdomain = await rl.question('Enter subdomain name (e.g. my-awesome-site): ');
    }

    if (!subdomain || !/^[a-z0-9-]+$/.test(subdomain)) {
        rl.close();
        errorWithSuggestions('Invalid subdomain. Use lowercase alphanumeric and hyphens only.', [
            'Example: my-site-123',
            'No spaces or special characters'
        ]);
        process.exit(1);
    }

    const checkSpinner = spinner(`Checking if "${subdomain}" is available...`);
    try {
        const isAvailable = await checkSubdomainAvailable(subdomain);
        if (!isAvailable) {
            checkSpinner.fail(`Subdomain "${subdomain}" is already taken.`);
            rl.close();
            process.exit(1);
        }
        checkSpinner.succeed(`Subdomain "${subdomain}" is available!`);

        const reserveStatus = await reserveSubdomain(subdomain);
        if (reserveStatus) {
            await initProjectConfig(subdomain);
            success(`Project initialized! Linked to: ${subdomain}.launchpd.cloud`);
            info('Now you can run "launchpd deploy" without specifying a name.');
        }
    } catch (err) {
        checkSpinner.fail('Failed to initialize project');
        errorWithSuggestions(err.message, [
            'Check your internet connection',
            'Try a different subdomain name'
        ]);
    } finally {
        rl.close();
    }
}
