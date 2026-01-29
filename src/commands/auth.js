/**
 * Authentication commands for StaticLaunch CLI
 * login, logout, register, whoami
 */

import { exec } from 'node:child_process'
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
import chalk from 'chalk'

const API_BASE_URL = config.apiUrl
const REGISTER_URL = `https://${config.domain}/`

/**
 * Validate API key with the server
 */
async function validateApiKey (apiKey) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/quota`, {
      headers: {
        'X-API-Key': apiKey
      }
    })

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
  log('Enter your API key from the dashboard.')
  log(`Don't have one? Run ${chalk.cyan('"launchpd register"')} first.\n`)

  const apiKey = await promptSecret('API Key: ')

  if (!apiKey) {
    errorWithSuggestions('API key is required', [
      'Get your API key from the dashboard',
      `Visit: https://${config.domain}/settings`,
      'Run "launchpd register" if you don\'t have an account'
    ])
    process.exit(1)
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
    process.exit(1)
  }

  // Save credentials
  await saveCredentials({
    apiKey,
    apiSecret: result.user?.api_secret,
    userId: result.user?.id,
    email: result.user?.email,
    tier: result.tier
  })

  validateSpinner.succeed('Logged in successfully!')
  log('')
  log(`  ${chalk.gray('Email:')} ${chalk.cyan(result.user?.email || 'N/A')}`)
  log(`  ${chalk.gray('Tier:')} ${chalk.green(result.tier)}`)
  log(
    `  ${chalk.gray('Sites:')} ${result.usage?.siteCount || 0}/${result.limits?.maxSites || '?'}`
  )
  log(
    `  ${chalk.gray('Storage:')} ${result.usage?.storageUsedMB || 0}MB/${result.limits?.maxStorageMB || '?'}MB`
  )
  log('')
}

/**
 * Logout command - clears stored credentials
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
export async function register () {
  log('\nRegister for Launchpd\n')
  log(`Opening registration page: ${chalk.cyan(REGISTER_URL)}\n`)

  // Open browser based on platform
  const platform = process.platform
  let cmd

  if (platform === 'darwin') {
    cmd = `open "${REGISTER_URL}"`
  } else if (platform === 'win32') {
    cmd = `start "" "${REGISTER_URL}"`
  } else {
    cmd = `xdg-open "${REGISTER_URL}"`
  }

  exec(cmd, (err) => {
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
  log(
    `  Email: ${result.user?.email || 'Not set'} ${result.user?.email_verified ? chalk.green('(Verified)') : chalk.yellow('(Unverified)')}`
  )
  const is2FA =
    result.user?.is_2fa_enabled || result.user?.is_email_2fa_enabled
  log(`  2FA: ${is2FA ? chalk.green('Enabled') : chalk.gray('Disabled')}`)
  log(`  Tier: ${result.tier}`)
  log('')

  log('Usage:')
  log(`  Sites: ${result.usage?.siteCount || 0} / ${result.limits?.maxSites}`)
  log(
    `  Storage: ${result.usage?.storageUsedMB || 0}MB / ${result.limits?.maxStorageMB}MB`
  )
  log(`  Sites remaining: ${result.usage?.sitesRemaining || 0}`)
  log(`  Storage remaining: ${result.usage?.storageRemainingMB || 0}MB`)
  log('')

  log('Limits:')
  log(`  Max versions per site: ${result.limits?.maxVersionsPerSite}`)
  log(`  Retention: ${result.limits?.retentionDays} days`)
  log('')

  // Show warnings
  if (result.warnings && result.warnings.length > 0) {
    log('⚠️ Warnings:')
    result.warnings.forEach((w) => log(`  ${w}`))
    log('')
  }

  if (!result.canCreateNewSite) {
    warning('You cannot create new sites (limit reached)')
    info('You can still update existing sites')
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
      chalk.gray('  │') +
        ` Sites:      ${chalk.white('3 maximum')}           ` +
        chalk.gray('│')
    )
    log(
      chalk.gray('  │') +
        ` Storage:    ${chalk.white('50MB total')}          ` +
        chalk.gray('│')
    )
    log(
      chalk.gray('  │') +
        ` Retention:  ${chalk.white('7 days')}              ` +
        chalk.gray('│')
    )
    log(
      chalk.gray('  │') +
        ` Versions:   ${chalk.white('1 per site')}          ` +
        chalk.gray('│')
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

  const bar =
    barColor(filledChar.repeat(filled)) + chalk.gray('░'.repeat(empty))
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
