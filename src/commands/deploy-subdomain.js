/**
 * Subdomain resolution and availability checking for deploy command
 */

import chalk from 'chalk'
import {
    checkSubdomainAvailable,
    listSubdomains
} from '../utils/api.js'
import {
    getProjectConfig,
    findProjectRoot,
    updateProjectConfig,
    initProjectConfig
} from '../utils/projectConfig.js'
import { generateSubdomain } from '../utils/id.js'
import {
    success,
    info,
    warning,
    spinner
} from '../utils/logger.js'
import { prompt } from '../utils/prompt.js'

/**
 * Resolve subdomain from options and project config
 * @param {object} params - Parameters
 * @param {string} params.folderPath - Folder path
 * @param {string|undefined} params.optionName - Subdomain from --name option
 * @param {object|null} params.creds - User credentials
 * @returns {Promise<{subdomain: string, configSubdomain: string|null, projectRoot: string}>}
 */
export async function resolveSubdomain({ folderPath, optionName, creds }) {
    // Anonymous users cannot use custom subdomains
    if (optionName && !creds?.email) {
        warning('Custom subdomains require registration!')
        info('Anonymous deployments use random subdomains.')
        info('Run "launchpd register" to use --name option.')
    }

    let subdomain = optionName && creds?.email ? optionName.toLowerCase() : null
    let configSubdomain = null

    const projectRoot = findProjectRoot(folderPath)
    const config = await getProjectConfig(projectRoot)
    if (config?.subdomain) {
        configSubdomain = config.subdomain
    }

    if (!subdomain) {
        if (configSubdomain) {
            subdomain = configSubdomain
            info(`Using project subdomain: ${chalk.bold(subdomain)}`)
        } else {
            subdomain = generateSubdomain()
        }
    }

    return { subdomain, configSubdomain, projectRoot }
}

/**
 * Handle subdomain mismatch when user provides different subdomain than config
 * @param {object} params - Parameters
 * @param {string} params.subdomain - Requested subdomain
 * @param {string} params.configSubdomain - Config subdomain
 * @param {string} params.projectRoot - Project root
 * @param {boolean} params.autoYes - Auto-yes option
 */
export async function handleSubdomainMismatch({ subdomain, configSubdomain, projectRoot, autoYes }) {
    if (!configSubdomain || subdomain === configSubdomain) {
        return
    }

    warning(
        `Mismatch: This project is linked to ${chalk.bold(configSubdomain)} but you are deploying to ${chalk.bold(subdomain)}`
    )

    let shouldUpdate = autoYes
    if (!shouldUpdate) {
        const confirm = await prompt(
            `Would you like to update this project's default subdomain to "${subdomain}"? (Y/N): `
        )
        shouldUpdate =
            confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes'
    }

    if (shouldUpdate) {
        await updateProjectConfig({ subdomain }, projectRoot)
        success(`Project configuration updated to: ${subdomain}`)
    }
}

/**
 * Check subdomain availability and ownership
 * @param {string} subdomain - Subdomain to check
 * @returns {Promise<void>}
 */
export async function checkSubdomainOwnership(subdomain) {
    const checkSpinner = spinner('Checking subdomain availability...')

    try {
        const isAvailable = await checkSubdomainAvailable(subdomain)

        if (!isAvailable) {
            // Check if the current user owns it
            const result = await listSubdomains()
            const owned = result?.subdomains?.some((s) => s.subdomain === subdomain)

            if (owned) {
                checkSpinner.succeed(
                    `Deploying new version to your subdomain: "${subdomain}"`
                )
            } else {
                checkSpinner.fail(
                    `Subdomain "${subdomain}" is already taken by another user`
                )
                warning(
                    'You do not own this subdomain. Please choose a different name.'
                )
                process.exit(1)
            }
        } else {
            // If strictly new, it's available
            checkSpinner.succeed(`Subdomain "${subdomain}" is available`)
        }
    } catch {
        checkSpinner.warn(
            'Could not verify subdomain availability (skipping check)'
        )
    }
}

/**
 * Auto-init project if using --name without config
 * @param {object} params - Parameters
 * @param {string} params.optionName - Subdomain from --name option
 * @param {string|null} params.configSubdomain - Config subdomain
 * @param {string} params.folderPath - Folder path
 * @param {string} params.subdomain - Resolved subdomain
 */
export async function autoInitProject({ optionName, configSubdomain, folderPath, subdomain }) {
    if (!optionName || configSubdomain) {
        return
    }

    const confirm = await prompt(
        `\nRun "launchpd init" to link '${folderPath}' to '${subdomain}'? (Y/N): `
    )

    if (
        confirm.toLowerCase() === 'y' ||
        confirm.toLowerCase() === 'yes' ||
        confirm === ''
    ) {
        await initProjectConfig(subdomain, folderPath)
        success('Project initialized! Future deploys here can skip --name.')
    }
}
