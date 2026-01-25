import { getProjectConfig, findProjectRoot } from '../utils/projectConfig.js'
import { getDeployment } from '../utils/api.js'
import {
  errorWithSuggestions,
  info,
  spinner,
  warning,
  formatSize
} from '../utils/logger.js'
import { formatTimeRemaining } from '../utils/expiration.js'
import chalk from 'chalk'

/**
 * Show current project status
 */
export async function status (_options) {
  const projectRoot = findProjectRoot()
  if (!projectRoot) {
    warning('Not a Launchpd project (no .launchpd.json found)')
    info('Run "launchpd init" to link this directory to a subdomain.')
    return
  }

  const config = await getProjectConfig(projectRoot)
  if (!config || !config.subdomain) {
    errorWithSuggestions('Invalid project configuration.', [
      'Try deleting .launchpd.json and running "launchpd init" again'
    ])
    return
  }

  info(`Project root: ${chalk.cyan(projectRoot)}`)
  info(
    `Linked subdomain: ${chalk.bold.green(config.subdomain)}.launchpd.cloud`
  )

  const statusSpinner = spinner('Fetching latest deployment info...')
  try {
    const deploymentData = await getDeployment(config.subdomain)
    statusSpinner.stop()

    if (
      deploymentData &&
      deploymentData.versions &&
      deploymentData.versions.length > 0
    ) {
      const active =
        deploymentData.versions.find(
          (v) => v.version === deploymentData.activeVersion
        ) || deploymentData.versions[0]

      console.log('\nDeployment Status:')
      console.log(`  Active Version:  ${chalk.cyan(`v${active.version}`)}`)
      console.log(
        `  Deployed At:     ${new Date(active.created_at || active.timestamp).toLocaleString()}`
      )
      if (active.message) {
        console.log(`  Message:         ${chalk.italic(active.message)}`)
      }
      console.log(
        `  File Count:      ${active.file_count || active.fileCount}`
      )
      console.log(
        `  Total Size:      ${formatSize(active.total_bytes || active.totalBytes)}`
      )

      // Show expiration if set
      if (active.expires_at || active.expiresAt) {
        const expiryStr = formatTimeRemaining(
          active.expires_at || active.expiresAt
        )
        const expiryColor = expiryStr === 'expired' ? chalk.red : chalk.yellow
        console.log(`  Expires:         ${expiryColor(expiryStr)}`)
      }

      console.log(
        `  URL:             ${chalk.underline.blue(`https://${config.subdomain}.launchpd.cloud`)}`
      )
      console.log('')
    } else {
      warning('\nNo deployments found for this project yet.')
      info('Run "launchpd deploy <folder>" to push your first version.')
    }
  } catch {
    statusSpinner.fail('Failed to fetch deployment status')
    info(`Subdomain: ${config.subdomain}`)
    // Don't exit, just show what we have
  }
}
