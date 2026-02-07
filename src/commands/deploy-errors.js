/**
 * Error handling for deploy command
 */

import { MaintenanceError, NetworkError, AuthError } from '../utils/api.js'
import { errorWithSuggestions } from '../utils/logger.js'
import { getDeploymentErrorSuggestions } from './deploy-helpers.js'

/**
 * Handle deployment errors with appropriate messages and suggestions
 * @param {Error} err - The error that occurred
 * @param {boolean} verbose - Verbose mode
 * @param {Function} handleCommonError - Common error handler
 * @param {Function} info - Info logger
 * @param {Function} warning - Warning logger
 */
export function handleDeploymentError (
  err,
  verbose,
  handleCommonError,
  info,
  warning
) {
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

  // Get context-specific suggestions
  const suggestions = getDeploymentErrorSuggestions(err)

  errorWithSuggestions(`Upload failed: ${err.message}`, suggestions, {
    verbose,
    cause: err
  })
  process.exit(1)
}
