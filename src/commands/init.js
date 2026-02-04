import { initProjectConfig, findProjectRoot, getProjectConfig, saveProjectConfig } from '../utils/projectConfig.js';
import { checkSubdomainAvailable, reserveSubdomain, listSubdomains } from '../utils/api.js';
import { isLoggedIn } from '../utils/credentials.js';
import { success, errorWithSuggestions, info, spinner, warning } from '../utils/logger.js';
import { prompt } from '../utils/prompt.js';
import chalk from 'chalk';

/**
 * Initialize a new project in the current directory
 * @param {object} options - Command options
 * @param {string} options.name - Optional subdomain name
 */
export async function init(options) {
    const projectRoot = findProjectRoot();
    if (projectRoot) {
        const config = await getProjectConfig(projectRoot);
        warning("This directory is already part of a Launchpd project linked to: "+chalk.bold(config?.subdomain));

        const confirm = await prompt('Would you like to re-link this project to a different subdomain? (y/N): ');
        if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
            return;
        }
    }

    if (!await isLoggedIn()) {
        errorWithSuggestions('You must be logged in to initialize a project.', [
            'Run "launchpd login" to log in',
            'Run "launchpd register" to create an account'
        ]);
        return;
    }

    let subdomain = options.name;

    if (!subdomain) {
        info('Linking this directory to a Launchpd subdomain...');
        subdomain = await prompt('Enter subdomain name (e.g. my-awesome-site): ');
    }

    if (!subdomain || !/^[a-z0-9-]+$/.test(subdomain)) {
        errorWithSuggestions('Invalid subdomain. Use lowercase alphanumeric and hyphens only.', [
            'Example: my-site-123',
            'No spaces or special characters'
        ]);
        return;
    }

    const checkSpinner = spinner("Checking if \""+subdomain+"\" is available...");
    try {
        const isAvailable = await checkSubdomainAvailable(subdomain);
        let owned = false;

        if (!isAvailable) {
            // Check if user owns it
            const apiResult = await listSubdomains();
            const ownedSubdomains = apiResult?.subdomains || [];
            owned = ownedSubdomains.some(function(s) { return s.subdomain === subdomain });

            if (!owned) {
                checkSpinner.fail("Subdomain \""+subdomain+"\" is already taken.");
                return;
            }
            checkSpinner.info("Subdomain \""+subdomain+"\" is already yours.");
        } else {
            checkSpinner.succeed("Subdomain \""+subdomain+"\" is available!");
        }

        const reserveStatus = owned ? true : await reserveSubdomain(subdomain);
        if (reserveStatus) {
            if (projectRoot) {
                // Re-link
                const config = await getProjectConfig(projectRoot);
                config.subdomain = subdomain;
                config.updatedAt = new Date().toISOString();
                await saveProjectConfig(config, projectRoot);
                success("Project re-linked! New subdomain: "+subdomain+".launchpd.cloud");
            } else {
                await initProjectConfig(subdomain);
                success("Project initialized! Linked to: "+subdomain+".launchpd.cloud");
            }
            info('Now you can run "launchpd deploy" without specifying a name.');
        }
    } catch (err) {
        checkSpinner.fail('Failed to initialize project');
        errorWithSuggestions(err.message, [
            'Check your internet connection',
            'Try a different subdomain name'
        ]);
    }
}
