/**
 * Shared ignore lists for Launchpd CLI
 */

// Directories to ignore during scanning, validation, and upload
export const IGNORE_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'vendor',
  'composer',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'coverage',
  '.cache'
])

// Files to ignore during scanning, validation, and upload
export const IGNORE_FILES = new Set([
  '.launchpd.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '.gitignore',
  '.npmignore',
  'README.md',
  'LICENSE'
])

/**
 * Check if a path or filename should be ignored
 * @param {string} name - Base name of the file or directory
 * @param {boolean} isDir - Whether the path is a directory
 * @returns {boolean}
 */
export function isIgnored (name, isDir = false) {
  if (isDir) {
    return IGNORE_DIRECTORIES.has(name)
  }
  return IGNORE_FILES.has(name) || IGNORE_DIRECTORIES.has(name)
}
