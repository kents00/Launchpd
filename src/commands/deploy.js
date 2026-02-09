import { existsSync, statSync } from 'node:fs'
import { execFile } from 'node:child_process'
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
  log,
  raw
} from '../utils/logger.js'
import {
  calculateExpiresAt,
  formatTimeRemaining
} from '../utils/expiration.js'
import {
  checkQuota,
  displayQuotaWarnings,
  formatBytes
} from '../utils/quota.js'
import { getCredentials } from '../utils/credentials.js'
import { validateStaticOnly } from '../utils/validator.js'
import { isIgnored } from '../utils/ignore.js'
import { prompt } from '../utils/prompt.js'
import { handleCommonError } from '../utils/errors.js'
import QRCode from 'qrcode'

// ============================================================================
// Helper Functions (extracted to reduce cyclomatic complexity)
// ============================================================================

/**
 * Validate subdomain contains only safe DNS characters
 * @param {string} subdomain - The subdomain to validate
 * @returns {string} The validated subdomain
 * @throws {Error} If subdomain contains invalid characters
 */
function validateSubdomain (subdomain) {
  const safePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
  if (!safePattern.test(subdomain)) {
    throw new Error(
      `Invalid subdomain "${subdomain}": must contain only lowercase letters, numbers, and hyphens`
    )
  }
  return subdomain
}

/**
 * Calculate total size of a folder (excluding ignored files)
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
 * Parse and validate expiration option
 */
function parseExpiration (expiresOption, verbose) {
  if (!expiresOption) return null

  try {
    return calculateExpiresAt(expiresOption)
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
    return null // Unreachable, but satisfies static analysis
  }
}

/**
 * Validate required options
 */
function validateOptions (options, folderPath, verbose) {
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
}

/**
 * Scan folder and return active file count
 */
async function scanFolder (folderPath, verbose) {
  const scanSpinner = spinner('Scanning folder...')
  const files = await readdir(folderPath, {
    recursive: true,
    withFileTypes: true
  })

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
  return fileCount
}

/**
 * Validate static-only files
 */
async function validateStaticFiles (folderPath, options, verbose) {
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
      const violationList = validation.violations
        .map((v) => `   - ${v}`)
        .slice(0, 10)
      const moreCount =
        validation.violations.length > 10
          ? `   - ...and ${validation.violations.length - 10} more`
          : ''
      errorWithSuggestions(
        'Your project contains files that are not allowed.',
        [
          'Launchpd only supports static files (HTML, CSS, JS, images, etc.)',
          'Remove framework files, backend code, and build metadata:',
          ...violationList,
          moreCount,
          'If you use a framework (React, Vue, etc.), deploy the "dist" or "build" folder instead.'
        ],
        { verbose }
      )
      process.exit(1)
    }
  } else {
    validationSpinner.succeed('Project validated (Static files only)')
  }
}

/**
 * Resolve subdomain from options/config
 */
async function resolveSubdomain (options, folderPath, creds, verbose) {
  if (options.name && !creds?.email) {
    warning('Custom subdomains require registration!')
    info('Anonymous deployments use random subdomains.')
    info('Run "launchpd register" to use --name option.')
    log('')
  }

  let subdomain =
    options.name && creds?.email ? options.name.toLowerCase() : null
  const projectRoot = findProjectRoot(folderPath)
  const config = await getProjectConfig(projectRoot)
  const configSubdomain = config?.subdomain || null

  if (!subdomain) {
    if (configSubdomain) {
      subdomain = configSubdomain
      info(`Using project subdomain: ${chalk.bold(subdomain)}`)
    } else {
      subdomain = generateSubdomain()
    }
  } else if (configSubdomain && subdomain !== configSubdomain) {
    await handleSubdomainMismatch(
      subdomain,
      configSubdomain,
      options,
      projectRoot
    )
  }

  // Validate subdomain
  try {
    subdomain = validateSubdomain(subdomain)
  } catch (err) {
    errorWithSuggestions(
      err.message,
      [
        'Subdomain must start and end with alphanumeric characters',
        'Only lowercase letters, numbers, and hyphens are allowed',
        'Example: my-site-123'
      ],
      { verbose }
    )
    process.exit(1)
  }

  return { subdomain, configSubdomain, projectRoot }
}

/**
 * Handle subdomain mismatch between CLI arg and config
 */
async function handleSubdomainMismatch (
  subdomain,
  configSubdomain,
  options,
  projectRoot
) {
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

/**
 * Check subdomain availability
 */
async function checkSubdomainOwnership (subdomain) {
  const checkSpinner = spinner('Checking subdomain availability...')
  try {
    const isAvailable = await checkSubdomainAvailable(subdomain)

    if (!isAvailable) {
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
      checkSpinner.succeed(`Subdomain "${subdomain}" is available`)
    }
  } catch {
    checkSpinner.warn(
      'Could not verify subdomain availability (skipping check)'
    )
  }
}

/**
 * Prompt for auto-init if needed
 */
async function promptAutoInit (options, configSubdomain, subdomain, folderPath) {
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
}

/**
 * Check quota and return result
 */
async function checkDeploymentQuota (
  subdomain,
  estimatedBytes,
  configSubdomain,
  options
) {
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

  displayQuotaWarnings(quotaCheck.warnings)
}

/**
 * Perform the actual upload
 */
async function performUpload (
  folderPath,
  subdomain,
  fileCount,
  expiresAt,
  options
) {
  const versionSpinner = spinner('Fetching version info...')
  let version = await getNextVersionFromAPI(subdomain)
  if (version === null) {
    version = await getNextVersion(subdomain)
  }
  versionSpinner.succeed(`Deploying as version ${version}`)

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
    `Uploaded ${fileCount} files (${formatBytes(totalBytes)})`
  )

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

  await saveLocalDeployment({
    subdomain,
    folderName,
    fileCount,
    totalBytes,
    version,
    timestamp: new Date().toISOString(),
    expiresAt: expiresAt?.toISOString() || null
  })

  return { version, totalBytes }
}

/**
 * Show post-deployment info
 */
async function showPostDeploymentInfo (url, options, expiresAt, creds, verbose) {
  if (options.open) {
    openUrlInBrowser(url)
  }

  if (expiresAt) {
    warning(`Expires: ${formatTimeRemaining(expiresAt)}`)
  }

  if (!creds?.email) {
    showAnonymousWarnings()
  }

  log('')

  if (options.qr) {
    await showQRCode(url, verbose)
  }
}

/**
 * Open URL in system browser
 */
function openUrlInBrowser (url) {
  const platform = process.platform
  let command = 'xdg-open'
  let args = [url]

  if (platform === 'darwin') {
    command = 'open'
  } else if (platform === 'win32') {
    // Use rundll32 to open the URL with the default browser without invoking a shell
    command = 'rundll32'
    args = ['url.dll,FileProtocolHandler', url]
  }

  execFile(command, args)
}

/**
 * Show warnings for anonymous deployments
 */
function showAnonymousWarnings () {
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

/**
 * Generate and display QR code
 */
async function showQRCode (url, verbose) {
  try {
    const terminalWidth = process.stdout.columns || 80
    const qr = await QRCode.toString(url, {
      type: 'terminal',
      small: true,
      margin: 2,
      errorCorrectionLevel: 'L'
    })

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

/**
 * Handle upload errors with appropriate messages
 */
function handleUploadError (err, verbose) {
  if (
    handleCommonError(err, {
      error: (msg) => errorWithSuggestions(msg, [], { verbose }),
      info,
      warning
    })
  ) {
    process.exit(1)
  }

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

  const suggestions = getErrorSuggestions(err)
  errorWithSuggestions(`Upload failed: ${err.message}`, suggestions, {
    verbose,
    cause: err
  })
  process.exit(1)
}

/**
 * Get context-specific suggestions for errors
 */
function getErrorSuggestions (err) {
  const message = err.message || ''

  if (message.includes('fetch failed') || message.includes('ENOTFOUND')) {
    return [
      'Check your internet connection',
      'The API server may be temporarily unavailable'
    ]
  }

  if (message.includes('401') || message.includes('Unauthorized')) {
    return [
      'Run "launchpd login" to authenticate',
      'Your API key may have expired'
    ]
  }

  if (message.includes('413') || message.includes('too large')) {
    return [
      'Try deploying fewer or smaller files',
      'Check your storage quota with "launchpd quota"'
    ]
  }

  if (message.includes('429') || message.includes('rate limit')) {
    return [
      'Wait a few minutes and try again',
      'You may be deploying too frequently'
    ]
  }

  return [
    'Try running with --verbose for more details',
    'Check https://status.launchpd.cloud for service status'
  ]
}

// ============================================================================
// Main Deploy Function
// ============================================================================

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

  // Parse and validate
  const expiresAt = parseExpiration(options.expires, verbose)
  validateOptions(options, folderPath, verbose)

  // Scan and validate folder
  const fileCount = await scanFolder(folderPath, verbose)
  await validateStaticFiles(folderPath, options, verbose)

  // Resolve subdomain
  const creds = await getCredentials()
  const { subdomain, configSubdomain } = await resolveSubdomain(
    options,
    folderPath,
    creds,
    verbose
  )
  const url = `https://${subdomain}.launchpd.cloud`

  // Check subdomain availability
  await checkSubdomainOwnership(subdomain)

  // Auto-init prompt
  await promptAutoInit(options, configSubdomain, subdomain, folderPath)

  // Calculate size and check quota
  const sizeSpinner = spinner('Calculating folder size...')
  const estimatedBytes = await calculateFolderSize(folderPath)
  sizeSpinner.succeed(`Size: ${formatBytes(estimatedBytes)}`)

  await checkDeploymentQuota(
    subdomain,
    estimatedBytes,
    configSubdomain,
    options
  )

  // Show deployment info
  if (creds?.email) {
    info(`Deploying as: ${creds.email}`)
  } else {
    info('Deploying as: anonymous (run "launchpd login" for more quota)')
  }
  info(`Deploying ${fileCount} file(s) from ${folderPath}`)
  info(`Target: ${url}`)

  // Perform upload
  try {
    const { version } = await performUpload(
      folderPath,
      subdomain,
      fileCount,
      expiresAt,
      options
    )
    success(`Deployed successfully! (v${version})`)
    log(`\n${url}`)
    await showPostDeploymentInfo(url, options, expiresAt, creds, verbose)
  } catch (err) {
    handleUploadError(err, verbose)
  }
}
