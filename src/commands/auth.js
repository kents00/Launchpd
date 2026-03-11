/**
 * Authentication commands for StaticLaunch CLI
 * login, logout, register, whoami
 */

import { execFile } from 'node:child_process'
import { promptSecret } from '../utils/prompt.js'
import { config } from '../config.js'
import {
  getCredentials,
  saveCredentials,
  clearCredentials,
  isLoggedIn
} from '../utils/credentials.js'
import {
  success,
  error,
  errorWithSuggestions,
  info,
  warning,
  spinner,
  log
} from '../utils/logger.js'
import { formatBytes } from '../utils/quota.js'
import { handleCommonError } from '../utils/errors.js'
import {
  resendVerification,
  createFetchTimeout,
  API_TIMEOUT_MS
} from '../utils/api.js'
import chalk from 'chalk'

const API_BASE_URL = config.apiUrl
const REGISTER_URL = `https://${config.domain}/`

/**
 * Validate API key format
 * Returns true if the key matches expected format: lpd_ followed by alphanumeric/special chars
 */
function isValidApiKeyFormat (apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false
  }
  // API keys must start with lpd_ and contain only safe characters
  // This validation ensures we don't send arbitrary file data to the network
  return /^lpd_[a-zA-Z0-9_-]{16,64}$/.test(apiKey)
}

/**
 * Validate API key with the server
 */
async function validateApiKey (apiKey) {
  // Validate API key format before sending to network
  // This ensures we only send properly formatted keys, not arbitrary file data
  if (!isValidApiKeyFormat(apiKey)) {
    return null
  }

  try {
    const { signal, clear } = createFetchTimeout(API_TIMEOUT_MS)
    let response = null
    try {
      response = await fetch(`${API_BASE_URL}/api/quota`, {
        headers: {
          'X-API-Key': apiKey
        },
        signal
      })
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(
          `Request timed out after ${API_TIMEOUT_MS / 1000}s. The server did not respond in time.`
        )
      }
      throw err
    } finally {
      clear()
    }

    if (response.status === 401) {
      const data = await response.json().catch(() => ({}))
      if (data.requires_2fa) {
        return { requires_2fa: true, two_factor_type: data.two_factor_type }
      }
      return null
    }

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    if (data.authenticated) {
      return data
    }
    return null
  } catch {
    return null
  }
}

/**
 * Background update credentials if new data (like apiSecret) is available
 */
async function updateCredentialsIfNeeded (creds, result) {
  if (result.user?.api_secret && !creds.apiSecret) {
    await saveCredentials({
      ...creds,
      apiSecret: result.user.api_secret,
      userId: result.user.id || creds.userId,
      email: result.user.email || creds.email
    })
  }
}

/**
 * Login with API key (original method)
 */
async function loginWithApiKey () {
  log('Enter your API key from the dashboard.')
  log(`Don't have one? Run ${chalk.cyan('"launchpd register"')} first.\n`)

  const apiKey = await promptSecret('API Key: ')

  if (!apiKey) {
    errorWithSuggestions('API key is required', [
      'Get your API key from the dashboard',
      `Visit: https://${config.domain}/settings`,
      'Run "launchpd register" if you don\'t have an account'
    ])
    return null
  }

  const validateSpinner = spinner('Validating API key...')

  const result = await validateApiKey(apiKey)

  if (!result) {
    validateSpinner.fail('Invalid API key')
    errorWithSuggestions('Please check and try again.', [
      `Get your API key at: https://portal.${config.domain}/api-keys`,
      'Make sure you copied the full key',
      'API keys start with "lpd_"'
    ])
    return null
  }

  if (result.requires_2fa) {
    validateSpinner.fail('2FA Required')
    info(
      '2FA is required for your account. Please log in via the browser or use an authenticator app.'
    )
    return null
  }

  validateSpinner.succeed('Logged in successfully!')

  return {
    ...result,
    apiKey // Include the API key for saving
  }
}

/**
 * Login command - prompts for API key and validates it
 */
export async function login () {
  // Check if already logged in
  if (await isLoggedIn()) {
    const creds = await getCredentials()
    warning(`Already logged in as ${chalk.cyan(creds.email || creds.userId)}`)
    info('Run "launchpd logout" to switch accounts')
    return
  }

  log('\nLaunchpd Login\n')

  const result = await loginWithApiKey()
  if (!result) {
    process.exit(1)
  }
  const apiKey = result.apiKey

  // Save credentials
  await saveCredentials({
    apiKey,
    apiSecret: result.user?.api_secret,
    userId: result.user?.id,
    email: result.user?.email,
    tier: result.tier
  })

  log('')
  log(`  ${chalk.gray('Email:')} ${chalk.cyan(result.user?.email || 'N/A')}`)
  log(`  ${chalk.gray('Tier:')} ${chalk.green(result.tier || 'registered')}`)
  if (result.usage) {
    log(
      `  ${chalk.gray('Sites:')} ${result.usage?.siteCount || 0}/${result.limits?.maxSites || '?'}`
    )
    const storageUsed =
      result.usage?.storageUsed ||
      (result.usage?.storageUsedMB || 0) * 1024 * 1024
    const storageMax =
      result.limits?.maxStorageBytes ||
      (result.limits?.maxStorageMB || 0) * 1024 * 1024
    log(
      `  ${chalk.gray('Storage:')} ${formatBytes(storageUsed)}/${formatBytes(storageMax)}`
    )
  }

  // Warn if email not verified
  if (result.user?.email && !result.user?.email_verified) {
    log('')
    warning('Your email is not verified')
    info(`Verify at: https://${config.domain}/auth/verify-pending`)
  }

  log('')
}

/**
 * Logout command - clears stored credentials and invalidates server session
 */
export async function logout () {
  const loggedIn = await isLoggedIn()

  if (!loggedIn) {
    warning('Not currently logged in')
    return
  }

  const creds = await getCredentials()

  await clearCredentials()

  success('Logged out successfully')
  if (creds?.email) {
    info(`Was logged in as: ${chalk.cyan(creds.email)}`)
  }
  log(
    `\nYou can still deploy anonymously (limited to ${chalk.yellow('3 sites')}, ${chalk.yellow('50MB')}).`
  )
}

/**
 * Register command - opens browser to registration page
 */
export function register () {
  log('\nRegister for Launchpd\n')
  log(`Opening registration page: ${chalk.cyan(REGISTER_URL)}\n`)

  // Open browser based on platform
  const platform = process.platform
  let command = 'xdg-open'
  let args = [REGISTER_URL]

  if (platform === 'darwin') {
    command = 'open'
  } else if (platform === 'win32') {
    command = 'cmd'
    args = ['/c', 'start', '', REGISTER_URL]
  }

  execFile(command, args, (err) => {
    if (err) {
      log(
        `Please open this URL in your browser:\n  ${chalk.cyan(REGISTER_URL)}\n`
      )
    }
  })

  log('After registering:')
  log('  1. Get your API key from the dashboard')
  log(`  2. Run: ${chalk.cyan('launchpd login')}`)
  log('')

  info('Registration benefits:')
  log(
    `  ${chalk.green('✓')} ${chalk.white('10 sites')} ${chalk.gray('(instead of 3)')}`
  )
  log(
    `  ${chalk.green('✓')} ${chalk.white('100MB storage')} ${chalk.gray('(instead of 50MB)')}`
  )
  log(
    `  ${chalk.green('✓')} ${chalk.white('30-day retention')} ${chalk.gray('(instead of 7 days)')}`
  )
  log(`  ${chalk.green('✓')} ${chalk.white('10 versions per site')}`)
  log('')
}

/**
 * Whoami command - shows current user info and quota status
 */
export async function whoami () {
  const creds = await getCredentials()

  if (!creds) {
    log('\n👤 Not logged in (anonymous mode)\n')
    log('Anonymous limits:')
    log(`  • ${chalk.white('3 sites')} maximum`)
    log(`  • ${chalk.white('50MB')} total storage`)
    log(`  • ${chalk.white('7-day')} retention`)
    log(`  • ${chalk.white('1 version')} per site`)
    log(`\nRun ${chalk.cyan('"launchpd login"')} to authenticate`)
    log(`Run ${chalk.cyan('"launchpd register"')} to create an account\n`)
    return
  }

  info('Fetching account status...')

  // Validate and get current quota
  const result = await validateApiKey(creds.apiKey)

  if (!result) {
    warning('Session expired or API key invalid')
    await clearCredentials()
    error('Please login again with: launchpd login')
    process.exit(1)
  }

  // Background upgrade to apiSecret if missing
  await updateCredentialsIfNeeded(creds, result)

  log(`\nLogged in as: ${result.user?.email || result.user?.id}\n`)

  log('Account Info:')
  log(`  User ID: ${result.user?.id}`)

  // Email with verification status
  const emailStatus = result.user?.email_verified
    ? chalk.green('✓ Verified')
    : chalk.yellow('⚠ Unverified')
  log(`  Email: ${result.user?.email || 'Not set'} ${emailStatus}`)

  // Enhanced 2FA display
  const hasTOTP = result.user?.is_2fa_enabled
  const hasEmail2FA = result.user?.is_email_2fa_enabled

  if (hasTOTP && hasEmail2FA) {
    log(`  2FA: ${chalk.green('✓ Enabled')} ${chalk.gray('(App + Email)')}`)
  } else if (hasTOTP) {
    log(
      `  2FA: ${chalk.green('✓ Enabled')} ${chalk.gray('(Authenticator App)')}`
    )
  } else if (hasEmail2FA) {
    log(`  2FA: ${chalk.green('✓ Enabled')} ${chalk.gray('(Email)')}`)
  } else {
    log(`  2FA: ${chalk.gray('Not enabled')}`)
  }

  log(`  Tier: ${result.tier}`)
  log('')

  log('Usage:')
  log(`  Sites: ${result.usage?.siteCount || 0} / ${result.limits?.maxSites}`)
  const storageUsed =
    result.usage?.storageUsed ||
    (result.usage?.storageUsedMB || 0) * 1024 * 1024
  const storageMax =
    result.limits?.maxStorageBytes ||
    (result.limits?.maxStorageMB || 0) * 1024 * 1024
  log(`  Storage: ${formatBytes(storageUsed)} / ${formatBytes(storageMax)}`)
  log(`  Sites remaining: ${result.usage?.sitesRemaining || 0}`)
  const storageRemaining =
    result.usage?.storageRemaining ||
    (result.usage?.storageRemainingMB || 0) * 1024 * 1024
  log(`  Storage remaining: ${formatBytes(storageRemaining)}`)
  log('')

  log('Limits:')
  log(`  Max versions per site: ${result.limits?.maxVersionsPerSite}`)
  log(`  Retention: ${result.limits?.retentionDays} days`)
  log('')

  // Show warnings
  if (result.warnings && result.warnings.length > 0) {
    log('Warnings:')
    result.warnings.forEach((w) => log(`  ${w}`))
    log('')
  }

  if (!result.canCreateNewSite) {
    warning('You cannot create new sites (limit reached)')
    info('You can still update existing sites')
  }

  // Email verification warning
  if (result.user?.email && !result.user?.email_verified) {
    log('')
    warning('Your email is not verified')
    info(`Verify at: https://${config.domain}/auth/verify-pending`)
    info('Some features may be limited until verified')
  }

  // 2FA recommendation if not enabled
  if (!result.user?.is_2fa_enabled && !result.user?.is_email_2fa_enabled) {
    log('')
    info('Tip: Enable 2FA for better security')
    const securityUrl = `https://${config.domain}/settings/security`
    const securityUrlMsg = `Visit: ${securityUrl}`
    log(`   ${chalk.gray(securityUrlMsg)}`)
  }
}

/**
 * Quota command - shows detailed quota information
 */
export async function quota () {
  const creds = await getCredentials()

  if (!creds) {
    log(`\n${chalk.bold('Anonymous Quota Status')}\n`)
    log(chalk.gray('You are not logged in.'))
    log('')
    log(chalk.bold('Anonymous tier limits:'))
    log(chalk.gray('  ┌─────────────────────────────────┐'))
    log(
      `${chalk.gray('  │')} Sites:      ${chalk.white('3 maximum')}           ${chalk.gray('│')}`
    )
    log(
      `${chalk.gray('  │')} Storage:    ${chalk.white('50MB total')}          ${chalk.gray('│')}`
    )
    log(
      `${chalk.gray('  │')} Retention:  ${chalk.white('7 days')}              ${chalk.gray('│')}`
    )
    log(
      `${chalk.gray('  │')} Versions:   ${chalk.white('1 per site')}          ${chalk.gray('│')}`
    )
    log(chalk.gray('  └─────────────────────────────────┘'))
    log('')
    log(`${chalk.cyan('Register for FREE')} to unlock more:`)
    log(`   ${chalk.green('→')} ${chalk.white('10 sites')}`)
    log(`   ${chalk.green('→')} ${chalk.white('100MB storage')}`)
    log(`   ${chalk.green('→')} ${chalk.white('30-day retention')}`)
    log(`   ${chalk.green('→')} ${chalk.white('10 versions per site')}`)
    log('')
    log(`Run: ${chalk.cyan('launchpd register')}`)
    log('')
    return
  }

  const fetchSpinner = spinner('Fetching quota status...')

  const result = await validateApiKey(creds.apiKey)

  if (!result) {
    fetchSpinner.fail('Failed to fetch quota')
    errorWithSuggestions('API key may be invalid.', [
      'Run "launchpd login" to re-authenticate',
      'Check your internet connection'
    ])
    process.exit(1)
  }

  // Background upgrade to apiSecret if missing
  await updateCredentialsIfNeeded(creds, result)

  fetchSpinner.succeed('Quota fetched')
  log(
    `\n${chalk.bold('Quota Status for:')} ${chalk.cyan(result.user?.email || creds.email)}\n`
  )

  // Sites usage
  const sitesUsed = result.usage?.siteCount || 0
  const sitesMax = result.limits?.maxSites || 10
  const sitesPercent = Math.round((sitesUsed / sitesMax) * 100)
  const sitesBar = createProgressBar(sitesUsed, sitesMax)

  log(
    `${chalk.gray('Sites:')}    ${sitesBar} ${chalk.white(sitesUsed)}/${sitesMax} (${getPercentColor(sitesPercent)})`
  )

  // Storage usage
  const storageBytes = result.usage?.storageUsed || 0
  const storageMaxBytes =
    result.limits?.maxStorageBytes ||
    (result.limits?.maxStorageMB || 100) * 1024 * 1024
  const storagePercent = Math.round((storageBytes / storageMaxBytes) * 100)
  const storageBar = createProgressBar(storageBytes, storageMaxBytes)

  log(
    `${chalk.gray('Storage:')}  ${storageBar} ${chalk.white(formatBytes(storageBytes))}/${formatBytes(storageMaxBytes)} (${getPercentColor(storagePercent)})`
  )

  log('')
  log(`${chalk.gray('Tier:')}         ${chalk.green(result.tier || 'free')}`)
  log(
    `${chalk.gray('Retention:')}    ${chalk.white(result.limits?.retentionDays || 30)} days`
  )
  log(
    `${chalk.gray('Max versions:')} ${chalk.white(result.limits?.maxVersionsPerSite || 10)} per site`
  )
  log('')

  // Status indicators
  if (result.canCreateNewSite === false) {
    warning('Site limit reached - cannot create new sites')
  }

  if (storagePercent > 80) {
    warning(
      `Storage ${storagePercent}% used - consider cleaning up old deployments`
    )
  }

  log('')
}

/**
 * Create a simple progress bar with color coding
 */
function createProgressBar (current, max, width = 20) {
  const filled = Math.round((current / max) * width)
  const empty = width - filled
  const percent = (current / max) * 100

  const filledChar = '█'
  let barColor

  if (percent >= 90) {
    barColor = chalk.red
  } else if (percent >= 70) {
    barColor = chalk.yellow
  } else {
    barColor = chalk.green
  }

  const bar = `${barColor(filledChar.repeat(filled))}${chalk.gray('░'.repeat(empty))}`
  return `[${bar}]`
}

/**
 * Get colored percentage text
 */
function getPercentColor (percent) {
  if (percent >= 90) {
    return chalk.red(`${percent}%`)
  } else if (percent >= 70) {
    return chalk.yellow(`${percent}%`)
  }
  return chalk.green(`${percent}%`)
}

/**
 * Resend email verification command
 */
export async function resendEmailVerification () {
  const loggedIn = await isLoggedIn()

  if (!loggedIn) {
    error('Not logged in')
    info(`Run ${chalk.cyan('"launchpd login"')} first`)
    process.exit(1)
  }

  const sendSpinner = spinner('Requesting verification email...')

  try {
    const result = await resendVerification()

    if (result.success) {
      sendSpinner.succeed('Verification email sent!')
      info('Check your inbox and spam folder')
    } else {
      sendSpinner.fail('Failed to send verification email')
      error(result.message || 'Unknown error')
      if (result.seconds_remaining) {
        info(
          `Please wait ${result.seconds_remaining} seconds before trying again`
        )
      }
    }
  } catch (err) {
    sendSpinner.fail('Request failed')
    if (handleCommonError(err, { error, info, warning })) {
      process.exit(1)
    }
    if (err.message?.includes('already verified')) {
      success('Your email is already verified!')
      return
    }
    error(err.message || 'Failed to resend verification email')
    process.exit(1)
  }
}
