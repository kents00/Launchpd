import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

let packageJson = { version: '1.0.0' } // Default fallback
try {
  const content = readFileSync(join(__dirname, '../package.json'), 'utf8')
  if (content) {
    packageJson = JSON.parse(content)
  }
} catch {
  // In some test environments or if package.json is missing,
  // we use the fallback version
}

/**
 * Application configuration for Launchpd CLI
 * No credentials needed - uploads go through the API proxy
 */
export const config = {
  // Base domain for deployments
  domain: 'launchpd.cloud',

  // API endpoint
  apiUrl: 'https://api.launchpd.cloud',

  // CLI version
  version: packageJson.version
}
