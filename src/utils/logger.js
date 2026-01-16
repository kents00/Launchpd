import chalk from 'chalk';

/**
 * Log a success message
 * @param {string} message
 */
export function success(message) {
    console.log(chalk.green.bold('✓'), chalk.green(message));
}

/**
 * Log an error message
 * @param {string} message
 */
export function error(message) {
    console.error(chalk.red.bold('✗'), chalk.red(message));
}

/**
 * Log an info message
 * @param {string} message
 */
export function info(message) {
    console.log(chalk.blue('ℹ'), chalk.white(message));
}

/**
 * Log a warning message
 * @param {string} message
 */
export function warning(message) {
    console.log(chalk.yellow.bold('⚠'), chalk.yellow(message));
}
