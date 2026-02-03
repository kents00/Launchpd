import { existsSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'
import chalk from 'chalk'
import { readdir } from 'node:fs/promises'
import { resolve, basename, join, relative, sep } from 'node:path'
import { generateSubdomain } from '../utils/id.js'
import { uploadFolder, finalizeUpload } from '../utils/upload.js'
import { getNextVersion } from '../utils/metadata.js'
import { saveLocalDeployment } from '../utils/localConfig.js'
import {
  getNextVersionFromAPI,
  checkSubdomainAvailable,
  listSubdomains,
  MaintenanceError,
  NetworkError,
  AuthError
} from '../utils/api.js'
import {
  getProjectConfig,
  findProjectRoot,
  updateProjectConfig,
  initProjectConfig
} from '../utils/projectConfig.js'
import {
  success,
  errorWithSuggestions,
  info,
  warning,
  spinner,
  formatSize,
  log,
  raw
} from '../utils/logger.js'
import {
  calculateExpiresAt,
  formatTimeRemaining
} from '../utils/expiration.js'
import { checkQuota, displayQuotaWarnings } from '../utils/quota.js'
import { getCredentials } from '../utils/credentials.js'
import { validateStaticOnly } from '../utils/validator.js'
import { isIgnored } from '../utils/ignore.js'
import { prompt } from '../utils/prompt.js'
import { handleCommonError } from '../utils/errors.js'
import QRCode from 'qrcode'

/**
 * Calculate total size of a folder
 */
async function calculateFolderSize (folderPath) {
  const files = await readdir(folderPath, {
    recursive: true,
    withFileTypes: true
  })
  let totalSize = 0

  for (const file of files) {
    const parentDir = file.parentPath || file.path
    const relativePath = relative(folderPath, join(parentDir, file.name))
    const pathParts = relativePath.split(sep)

    // Skip ignored directories/files in the path
    if (pathParts.some((part) => isIgnored(part, file.isDirectory()))) {
      continue
    }

    if (file.isFile()) {
      const fullPath = join(parentDir, file.name)
      try {
        const stats = statSync(fullPath)
        totalSize += stats.size
      } catch {
        // File may have been deleted
      }
    }
  }

  return totalSize
}

/**
 * Deploy a local folder to StaticLaunch
 * @param {string} folder - Path to folder to deploy
 * @param {object} options - Command options
 * @param {string} options.name - Custom subdomain
 * @param {string} options.expires - Expiration time (e.g., "30m", "2h", "1d")
 * @param {boolean} options.verbose - Show verbose error details
 */
export async function deploy (folder, options) {
  const folderPath = resolve(folder)
  const verbose = options.verbose || false

  // Parse expiration if provided
  let expiresAt = null
  if (options.expires) {
    try {
      expiresAt = calculateExpiresAt(options.expires)
    } catch (err) {
      errorWithSuggestions(
        err.message,
        [
          'Use format like: 30m, 2h, 1d, 7d',
          'Minimum expiration is 30 minutes',
          'Examples: --expires 1h, --expires 2d'
        ],
        { verbose, cause: err }
      )
      process.exit(1)
    }
  }

  // Validate deployment message is provided
  if (!options.message) {
    errorWithSuggestions(
      'Deployment message is required.',
      [
        'Use -m or --message to provide a description',
        'Example: launchpd deploy . -m "Fix layout"',
        'Example: launchpd deploy . -m "Initial deployment"'
      ],
      { verbose }
    )
    process.exit(1)
  }

  // Validate folder exists
  if (!existsSync(folderPath)) {
    errorWithSuggestions(
      `Folder not found: ${folderPath}`,
      [
        'Check the path is correct',
        'Use an absolute path or path relative to current directory',
        `Current directory: ${process.cwd()}`
      ],
      { verbose }
    )
    process.exit(1)
  }

  // Check folder is not empty
  const scanSpinner = spinner('Scanning folder...')
  const files = await readdir(folderPath, {
    recursive: true,
    withFileTypes: true
  })

  // Filter out ignored files for the count
  const activeFiles = files.filter((file) => {
    if (!file.isFile()) return false
    const parentDir = file.parentPath || file.path
    const relativePath = relative(folderPath, join(parentDir, file.name))
    const pathParts = relativePath.split(sep)
    return !pathParts.some((part) => isIgnored(part, file.isDirectory()))
  })

  const fileCount = activeFiles.length

  if (fileCount === 0) {
    scanSpinner.fail('Folder is empty or only contains ignored files')
    errorWithSuggestions(
      'Nothing to deploy.',
      [
        'Add some files to your folder',
        'Make sure your files are not in ignored directories (like node_modules)',
        'Make sure index.html exists for static sites'
      ],
      { verbose }
    )
    process.exit(1)
  }
  scanSpinner.succeed(
    `Found ${fileCount} file(s) (ignored system files skipped)`
  )

  // Static-Only Validation
  const validationSpinner = spinner('Validating files...')
  const validation = await validateStaticOnly(folderPath)
  if (!validation.success) {
    if (options.force) {
      validationSpinner.warn(
        'Static-only validation failed, but proceeding due to --force'
      )
      warning('Non-static files detected.')
      warning(chalk.bold.red('IMPORTANT: Launchpd only hosts STATIC files.'))
      warning(
        'Backend code (Node.js, PHP, etc.) will NOT be executed on the server.'
      )
    } else {
      validationSpinner.fail('Deployment blocked: Non-static files detected')
      errorWithSuggestions(
        'Your project contains files that are not allowed.',
        [
          'Launchpd only supports static files (HTML, CSS, JS, images, etc.)',
          'Remove framework files, backend code, and build metadata:',
          ...validation.violations.map((v) => `   - ${v}`).slice(0, 10),
          validation.violations.length > 10
            ? `   - ...and ${validation.violations.length - 10} more`
            : '',
          'If you use a framework (React, Vue, etc.), deploy the "dist" or "build" folder instead.'
        ],
        { verbose }
      )
      process.exit(1)
    }
  } else {
    validationSpinner.succeed('Project validated (Static files only)')
  }

  // Generate or use provided subdomain
  // Anonymous users cannot use custom subdomains
  const creds = await getCredentials()
  if (options.name && !creds?.email) {
    warning('Custom subdomains require registration!')
    info('Anonymous deployments use random subdomains.')
    info('Run "launchpd register" to use --name option.')
    log('')
  }

  // Detect project config if no name provided
  let subdomain =
    options.name && creds?.email ? options.name.toLowerCase() : null
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
  } else if (configSubdomain && subdomain !== configSubdomain) {
    warning(
      `Mismatch: This project is linked to ${chalk.bold(configSubdomain)} but you are deploying to ${chalk.bold(subdomain)}`
    )

    let shouldUpdate = options.yes
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

  const url = `https://${subdomain}.launchpd.cloud`

  // Check subdomain availability and ownership (ALWAYS run this)
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

  // Auto-init: If using --name and no config exists, prompt to save it
  if (options.name && !configSubdomain) {
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

  // Calculate estimated upload size
  const sizeSpinner = spinner('Calculating folder size...')
  const estimatedBytes = await calculateFolderSize(folderPath)
  sizeSpinner.succeed(`Size: ${formatSize(estimatedBytes)}`)

  // Check quota before deploying
  const quotaSpinner = spinner('Checking quota...')
  const isUpdate = configSubdomain && subdomain === configSubdomain

  const quotaCheck = await checkQuota(subdomain, estimatedBytes, { isUpdate })

  if (!quotaCheck.allowed) {
    if (options.force) {
      quotaSpinner.warn(
        'Deployment blocked due to quota limits, but proceeding due to --force'
      )
      warning(
        'Uploading anyway... (server might still reject if physical limit is hit)'
      )
    } else {
      quotaSpinner.fail('Deployment blocked due to quota limits')
      info('Try running "launchpd quota" to check your storage.')
      info('Use --force to try anyway (if you think this is a mistake)')
      process.exit(1)
    }
  } else {
    quotaSpinner.succeed('Quota check passed')
  }

  // Display any warnings
  displayQuotaWarnings(quotaCheck.warnings)

  // Show current user status (creds already fetched above)
  if (creds?.email) {
    info(`Deploying as: ${creds.email}`)
  } else {
    info('Deploying as: anonymous (run "launchpd login" for more quota)')
  }

  info(`Deploying ${fileCount} file(s) from ${folderPath}`)
  info(`Target: ${url}`)

  // Perform actual upload
  try {
    // Get next version number for this subdomain (try API first, fallback to local)
    const versionSpinner = spinner('Fetching version info...')
    let version = await getNextVersionFromAPI(subdomain)
    if (version === null) {
      version = await getNextVersion(subdomain)
    }
    versionSpinner.succeed(`Deploying as version ${version}`)

    // Upload all files via API proxy
    const folderName = basename(folderPath)
    const uploadSpinner = spinner(`Uploading files... 0/${fileCount}`)

    const { totalBytes } = await uploadFolder(
      folderPath,
      subdomain,
      version,
      (uploaded, total, fileName) => {
        uploadSpinner.update(
          `Uploading files... ${uploaded}/${total} (${fileName})`
        )
      }
    )

    uploadSpinner.succeed(
      `Uploaded ${fileCount} files (${formatSize(totalBytes)})`
    )

    // Finalize upload: set active version and record metadata
    const finalizeSpinner = spinner('Finalizing deployment...')
    await finalizeUpload(
      subdomain,
      version,
      fileCount,
      totalBytes,
      folderName,
      expiresAt?.toISOString() || null,
      options.message
    )
    finalizeSpinner.succeed('Deployment finalized')

    // Save locally for quick access
    await saveLocalDeployment({
      subdomain,
      folderName,
      fileCount,
      totalBytes,
      version,
      timestamp: new Date().toISOString(),
      expiresAt: expiresAt?.toISOString() || null
    })

    success(`Deployed successfully! (v${version})`)
    log(`\n${url}`)

    if (options.open) {
      const platform = process.platform

      if (platform === 'darwin') {
        // macOS: use the "open" command with URL as a separate argument
        spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
      } else if (platform === 'win32') {
        // Windows: use "cmd /c start" with URL as a separate argument
        spawn('cmd', ['/c', 'start', '', url], {
          stdio: 'ignore',
          detached: true
        }).unref()
      } else {
        // Linux and other Unix-like systems: use xdg-open with URL as a separate argument
        spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref()
      }
    }

    if (expiresAt) {
      warning(`Expires: ${formatTimeRemaining(expiresAt)}`)
    }

    // Show anonymous limit warnings
    if (!creds?.email) {
      log('')
      warning('Anonymous deployment limits:')
      log('   • 3 active sites per IP')
      log('   • 50MB total storage')
      log('   • 7-day site expiration')
      log('')
      info(
        'Run "launchpd register" to unlock unlimited sites and permanent storage!'
      )
    }
    log('')

    if (options.qr) {
      try {
        // Determine terminal width to avoid wrapping
        const terminalWidth = process.stdout.columns || 80

        // version: 2-3 is typical for these URLs. L level is smallest.
        // margin: 2 is safe but compact.
        const qr = await QRCode.toString(url, {
          type: 'terminal',
          small: true,
          margin: 2,
          errorCorrectionLevel: 'L'
        })

        // Check if QR might wrap
        const firstLine = qr.split('\n')[0]
        if (firstLine.length > terminalWidth) {
          warning('\nTerminal is too narrow to display the QR code correctly.')
          info(
            `Please expand your terminal to at least ${firstLine.length} columns.`
          )
          info(`URL: ${url}`)
        } else {
          log(`\nScan this QR code to view your site on mobile:\n${qr}`)
        }
      } catch (err) {
        warning('Could not generate QR code.')
        if (verbose) raw(err, 'error')
      }
    }
  } catch (err) {
    // Handle common errors with standardized messages
    if (
      handleCommonError(err, {
        error: (msg) => errorWithSuggestions(msg, [], { verbose }),
        info,
        warning
      })
    ) {
      process.exit(1)
    }

    // Handle maintenance mode specifically
    if (err instanceof MaintenanceError || err.isMaintenanceError) {
      errorWithSuggestions(
        '⚠️ LaunchPd is under maintenance',
        [
          'Please try again in a few minutes',
          'Check https://status.launchpd.cloud for updates'
        ],
        { verbose }
      )
      process.exit(1)
    }

    // Handle network errors
    if (err instanceof NetworkError || err.isNetworkError) {
      errorWithSuggestions(
        'Unable to connect to LaunchPd',
        [
          'Check your internet connection',
          'The API server may be temporarily unavailable',
          'Check https://status.launchpd.cloud for service status'
        ],
        { verbose, cause: err }
      )
      process.exit(1)
    }

    // Handle auth errors
    if (err instanceof AuthError || err.isAuthError) {
      errorWithSuggestions(
        'Authentication failed',
        [
          'Run "launchpd login" to authenticate',
          'Your API key may have expired or been revoked'
        ],
        { verbose, cause: err }
      )
      process.exit(1)
    }

    const suggestions = []

    // Provide context-specific suggestions for other errors
    if (
      err.message.includes('fetch failed') ||
      err.message.includes('ENOTFOUND')
    ) {
      suggestions.push('Check your internet connection')
      suggestions.push('The API server may be temporarily unavailable')
    } else if (
      err.message.includes('401') ||
      err.message.includes('Unauthorized')
    ) {
      suggestions.push('Run "launchpd login" to authenticate')
      suggestions.push('Your API key may have expired')
    } else if (
      err.message.includes('413') ||
      err.message.includes('too large')
    ) {
      suggestions.push('Try deploying fewer or smaller files')
      suggestions.push('Check your storage quota with "launchpd quota"')
    } else if (
      err.message.includes('429') ||
      err.message.includes('rate limit')
    ) {
      suggestions.push('Wait a few minutes and try again')
      suggestions.push('You may be deploying too frequently')
    } else {
      suggestions.push('Try running with --verbose for more details')
      suggestions.push(
        'Check https://status.launchpd.cloud for service status'
      )
    }

    errorWithSuggestions(`Upload failed: ${err.message}`, suggestions, {
      verbose,
      cause: err
    })
    process.exit(1)
  }
}
