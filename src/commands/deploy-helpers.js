/**
 * Helper functions for deploy command to reduce cyclomatic complexity
 */

import { readdir } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { isIgnored } from '../utils/ignore.js'
import { errorWithSuggestions } from '../utils/logger.js'
import { calculateExpiresAt } from '../utils/expiration.js'

/**
 * Validate and parse expiration time
 * @param {string|undefined} expiresOption - Expiration time option
 * @param {boolean} verbose - Verbose mode
 * @returns {Date|null} Expiration date or null
 */
export function parseExpirationOption (expiresOption, verbose) {
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
  }
}

/**
 * Validate deployment message is provided
 * @param {string|undefined} message - Deployment message
 * @param {boolean} verbose - Verbose mode
 */
export function validateDeploymentMessage (message, verbose) {
  if (!message) {
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
}

/**
 * Validate folder exists
 * @param {string} folderPath - Folder path
 * @param {boolean} verbose - Verbose mode
 */
export function validateFolderExists (folderPath, existsSync, verbose) {
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
 * Filter active (non-ignored) files from a directory scan
 * @param {Array} files - Files from readdir
 * @param {string} folderPath - Base folder path
 * @returns {Array} Filtered files
 */
export function filterActiveFiles (files, folderPath) {
  return files.filter((file) => {
    if (!file.isFile()) return false
    const parentDir = file.parentPath || file.path
    const relativePath = relative(folderPath, join(parentDir, file.name))
    const pathParts = relativePath.split(sep)
    return !pathParts.some((part) => isIgnored(part, file.isDirectory()))
  })
}

/**
 * Validate folder has deployable files
 * @param {number} fileCount - Number of files
 * @param {boolean} verbose - Verbose mode
 */
export function validateFolderNotEmpty (fileCount, verbose) {
  if (fileCount === 0) {
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
}

/**
 * Handle error conditions during deployment
 * @param {Error} err - Error object
 * @param {boolean} verbose - Verbose mode
 * @param {Function} errorHandler - Error handler function
 * @param {Function} infoHandler - Info handler function
 * @param {Function} warningHandler - Warning handler function
 * @returns {Array} Array of suggestions
 */
export function getDeploymentErrorSuggestions (err) {
  const suggestions = []

  if (
    err.message.includes('fetch failed') ||
    err.message.includes('ENOTFOUND')
  ) {
    suggestions.push(
      'Check your internet connection',
      'The API server may be temporarily unavailable'
    )
  } else if (
    err.message.includes('401') ||
    err.message.includes('Unauthorized')
  ) {
    suggestions.push(
      'Run "launchpd login" to authenticate',
      'Your API key may have expired'
    )
  } else if (err.message.includes('413') || err.message.includes('too large')) {
    suggestions.push(
      'Try deploying fewer or smaller files',
      'Check your storage quota with "launchpd quota"'
    )
  } else if (
    err.message.includes('429') ||
    err.message.includes('rate limit')
  ) {
    suggestions.push(
      'Wait a few minutes and try again',
      'You may be deploying too frequently'
    )
  } else {
    suggestions.push(
      'Try running with --verbose for more details',
      'Check https://status.launchpd.cloud for service status'
    )
  }

  return suggestions
}

/**
 * Calculate total size of a folder (exported for reuse)
 */
export async function calculateFolderSize (folderPath) {
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
    if (
      pathParts.some((part) => {
        return isIgnored(part, file.isDirectory())
      })
    ) {
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
