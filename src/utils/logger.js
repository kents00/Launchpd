import chalk from 'chalk'
import ora from 'ora'

// Store active spinner reference
let activeSpinner = null

/**
 * Log a success message
 * @param {string} message
 */
export function success(message) {
  console.log(chalk.green.bold('✓'), chalk.green(message)) 
}

/**
 * Log an error message
 * @param {string} message
 * @param {object} options - Optional error details
 * @param {boolean} options.verbose - Show verbose error details
 * @param {Error} options.cause - Original error for verbose mode
 */
export function error(message, options = {}) {
  console.error(chalk.red.bold('✗'), chalk.red(message)) 
  if (options.verbose && options.cause) {
    console.error(chalk.gray('  Stack trace:')) 
    console.error(
      chalk.gray('  ' + options.cause.stack || options.cause.message)
    ) 
  }
}

/**
 * Log an info message
 * @param {string} message
 */
export function info(message) {
  console.log(chalk.blue('ℹ'), chalk.white(message)) 
}

/**
 * Log a warning message
 * @param {string} message
 */
export function warning(message) {
  console.log(chalk.yellow.bold('⚠'), chalk.yellow(message)) 
}

/**
 * Log a plain message
 * @param {string} message
 */
export function log(message = '') {
  console.log(message) 
}

/**
 * Log a raw message (can be object, table, etc.)
 * @param {any} data
 * @param {string} method - console method to use
 */
export function raw(data, method = 'log') {
  const allowedMethods = ['log', 'warn', 'error', 'info', 'table', 'dir']
  if (allowedMethods.includes(method)) {
    console[method](data) 
  } else {
    console.log(data) 
  }
}

/**
 * Create and start a spinner
 * @param {string} text - Initial spinner text
 * @returns {object} - Spinner instance with helper methods
 */
export function spinner(text) {
  activeSpinner = ora({
    text,
    color: 'cyan',
    spinner: 'dots'
  }).start()

  return {
    /**
     * Update spinner text
     * @param {string} newText
     */
    update(newText) {
      if (activeSpinner) {
        activeSpinner.text = newText
      }
    },

    /**
     * Mark spinner as successful and stop
     * @param {string} text - Success message
     */
    succeed(message) {
      if (activeSpinner) {
        activeSpinner.succeed(chalk.green(message))
        activeSpinner = null
      }
    },

    /**
     * Mark spinner as failed and stop
     * @param {string} text - Failure message
     */
    fail(message) {
      if (activeSpinner) {
        activeSpinner.fail(chalk.red(message))
        activeSpinner = null
      }
    },

    /**
     * Stop spinner with info message
     * @param {string} text - Info message
     */
    info(message) {
      if (activeSpinner) {
        activeSpinner.info(chalk.blue(message))
        activeSpinner = null
      }
    },

    /**
     * Stop spinner with warning
     * @param {string} text - Warning message
     */
    warn(message) {
      if (activeSpinner) {
        activeSpinner.warn(chalk.yellow(message))
        activeSpinner = null
      }
    },

    /**
     * Stop spinner without any symbol
     */
    stop() {
      if (activeSpinner) {
        activeSpinner.stop()
        activeSpinner = null
      }
    }
  }
}

/**
 * Format bytes to human readable size (KB/MB/GB)
 * @param {number} bytes - Size in bytes
 * @param {number} decimals - Number of decimal places
 * @returns {string} - Formatted size string
 */
export function formatSize(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`
}

/**
 * Log helpful error with suggestions
 * @param {string} message - Error message
 * @param {string[]} suggestions - Array of suggested actions
 * @param {object} options - Error options
 */
export function errorWithSuggestions(message, suggestions = [], options = {}) {
  error(message, options)
  if (suggestions.length > 0) {
    log('')
    log(chalk.yellow('💡 Suggestions:'))
    suggestions.forEach((suggestion) => {
      log(chalk.gray(`   • ${suggestion}`))
    })
  }
}
