import { deleteSite } from '../utils/api.js'
import { error, success, spinner, log, raw } from '../utils/logger.js'
import { confirm } from '../utils/prompt.js'
import chalk from 'chalk'

/**
 * Delete a site (subdomain)
 */
export async function deleteCommand (subdomain, options) {
  if (!subdomain) {
    error('Please provide a subdomain to delete')
    log('Usage: launchpd delete <subdomain>')
    return
  }

  if (!options.force) {
    const confirmed = await confirm(
      `Are you sure you want to delete ${chalk.cyan(subdomain)}? This cannot be undone.`
    )
    if (!confirmed) {
      log('Aborted.')
      return
    }
  }

  const s = spinner(`Deleting ${subdomain}...`)
  try {
    const result = await deleteSite(subdomain)
    if (result.success) {
      s.succeed(`Permanently deleted ${chalk.cyan(subdomain)}`)
    } else {
      s.fail(`Failed to delete ${subdomain}`)
      if (result.error) raw(chalk.red(result.error), 'error')
    }
  } catch (err) {
    s.fail(`Failed to delete ${subdomain}`)
    if (options.verbose) raw(err, 'error')
  }
}
