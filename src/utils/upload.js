import { readdir, readFile } from 'node:fs/promises'
import { join, relative, posix, sep } from 'node:path'
import mime from 'mime-types'
import { config } from '../config.js'
import { getApiKey, getApiSecret } from './credentials.js'
import { createHmac } from 'node:crypto'
import { isIgnored } from './ignore.js'

const API_BASE_URL = config.apiUrl

/**
 * Convert Windows path to POSIX for R2 keys
 * @param {string} windowsPath
 * @returns {string}
 */
function toPosixPath (windowsPath) {
  return windowsPath.split(sep).join(posix.sep)
}

/**
 * Upload a single file via API proxy
 * @param {Buffer} content - File content
 * @param {string} subdomain - Target subdomain
 * @param {number} version - Version number
 * @param {string} filePath - Relative file path
 * @param {string} contentType - MIME type
 */
async function uploadFile (content, subdomain, version, filePath, contentType) {
  const apiKey = await getApiKey()
  const apiSecret = await getApiSecret()
  const headers = {
    'X-API-Key': apiKey,
    'X-Subdomain': subdomain,
    'X-Version': String(version),
    'X-File-Path': filePath,
    'X-Content-Type': contentType,
    'Content-Type': 'application/octet-stream'
  }

  if (apiSecret) {
    const timestamp = Date.now().toString()
    const endpoint = '/api/upload/file' // Match the worker path
    const hmac = createHmac('sha256', apiSecret)
    hmac.update('POST')
    hmac.update(endpoint)
    hmac.update(timestamp)
    hmac.update(content) // Buffer is fine for update()

    headers['X-Timestamp'] = timestamp
    headers['X-Signature'] = hmac.digest('hex')
  }

  const response = await fetch(`${API_BASE_URL}/api/upload/file`, {
    method: 'POST',
    headers,
    body: content
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let errorMsg = 'Upload failed'
    try {
      const data = JSON.parse(text)
      errorMsg = data.error || errorMsg
    } catch {
      if (text) errorMsg = text
    }
    throw new Error(errorMsg || `Upload failed: ${response.status}`)
  }

  return response.json()
}

/**
 * Mark upload complete and set active version
 * @param {string} subdomain - Target subdomain
 * @param {number} version - Version number
 * @param {number} fileCount - Number of files uploaded
 * @param {number} totalBytes - Total bytes uploaded
 * @param {string} folderName - Original folder name
 * @param {string|null} expiresAt - ISO expiration timestamp
 */
async function completeUpload (
  subdomain,
  version,
  fileCount,
  totalBytes,
  folderName,
  expiresAt,
  message
) {
  const apiKey = await getApiKey()
  const apiSecret = await getApiSecret()
  const headers = {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json'
  }

  const body = JSON.stringify({
    subdomain,
    version,
    fileCount,
    totalBytes,
    folderName,
    expiresAt,
    message,
    cliVersion: config.version
  })

  if (apiSecret) {
    const timestamp = Date.now().toString()
    const endpoint = '/api/upload/complete'
    const hmac = createHmac('sha256', apiSecret)
    hmac.update('POST')
    hmac.update(endpoint)
    hmac.update(timestamp)
    hmac.update(body)

    headers['X-Timestamp'] = timestamp
    headers['X-Signature'] = hmac.digest('hex')
  }

  const response = await fetch(`${API_BASE_URL}/api/upload/complete`, {
    method: 'POST',
    headers,
    body
  })

  if (!response.ok) {
    let errorMsg = 'Complete upload failed'
    const text = await response.text()
    try {
      const data = JSON.parse(text)
      errorMsg =
        data.error ||
        `Complete upload failed: ${response.status} ${response.statusText}`
    } catch {
      errorMsg = `Complete upload failed: ${response.status} ${response.statusText} - ${text.substring(0, 100)}`
    }
    throw new Error(errorMsg)
  }

  return response.json()
}

/**
 * Upload a folder to Launchpd via API proxy
 * @param {string} localPath - Local folder path
 * @param {string} subdomain - Subdomain to use as bucket prefix
 * @param {number} version - Version number for this deployment
 * @param {function} onProgress - Progress callback (uploaded, total, fileName)
 */
export async function uploadFolder (
  localPath,
  subdomain,
  version = 1,
  onProgress = null
) {
  const files = await readdir(localPath, {
    recursive: true,
    withFileTypes: true
  })

  let uploaded = 0
  let totalBytes = 0
  const total = files.filter((f) => f.isFile()).length

  for (const file of files) {
    if (!file.isFile()) continue

    const fileName = file.name
    const parentDir = file.parentPath || file.path

    // Skip ignored directories in the path
    const relativePath = relative(localPath, join(parentDir, fileName))
    const pathParts = relativePath.split(sep)

    if (pathParts.some((part) => isIgnored(part, true))) {
      continue
    }

    // Skip ignored files
    if (isIgnored(fileName, false)) {
      continue
    }

    // Build full local path
    const fullPath = join(parentDir, fileName)

    // Build relative path for R2 key
    const posixPath = toPosixPath(relativePath)

    // Detect content type
    const contentType = mime.lookup(file.name) || 'application/octet-stream'

    // Read file and upload via API
    const body = await readFile(fullPath)
    totalBytes += body.length

    await uploadFile(body, subdomain, version, posixPath, contentType)

    uploaded++

    // Call progress callback if provided
    if (onProgress) {
      onProgress(uploaded, total, posixPath)
    }
  }

  return { uploaded, subdomain, totalBytes }
}

/**
 * Complete the upload and set active version
 * @param {string} subdomain - Target subdomain
 * @param {number} version - Version number
 * @param {number} fileCount - Number of files
 * @param {number} totalBytes - Total bytes
 * @param {string} folderName - Folder name
 * @param {string|null} expiresAt - Expiration ISO timestamp
 */
export async function finalizeUpload (
  subdomain,
  version,
  fileCount,
  totalBytes,
  folderName,
  expiresAt = null,
  message = null
) {
  return await completeUpload(
    subdomain,
    version,
    fileCount,
    totalBytes,
    folderName,
    expiresAt,
    message
  )
}
