/**
 * Remote Source Utility - Fetch and deploy from GitHub Gist/Repo URLs
 *
 * Supports:
 *   - https://gist.github.com/{user}/{gist_id}
 *   - https://github.com/{user}/{repo}
 *
 * Security features:
 *   - Path traversal prevention (--dir escape)
 *   - Download size limits (100MB max)
 *   - Symlink stripping during tar extraction
 *   - Tarball bomb protection (file count + depth limits)
 *   - GitHub rate limit handling
 *   - Gist filename sanitization (including Windows reserved names)
 *   - SSRF protection on raw_url downloads
 *   - Content-Type validation on repo tarballs
 *   - Fetch timeout via AbortController (30s)
 *   - Content-Length pre-check for truncated gist file downloads
 *
 * Optimizations:
 *   - Parallel gist file downloads (5 concurrent)
 *   - Skip ignored files during tar extraction
 *   - Early Content-Length bail-out for raw gist file fetches
 */

import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join, resolve, sep, posix } from 'node:path'
import { tmpdir } from 'node:os'
import { createGunzip } from 'node:zlib'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import tar from 'tar'
import { isIgnored } from './ignore.js'

// ============================================================================
// Constants & Limits
// ============================================================================

/** GitHub API base URL */
const GITHUB_API = 'https://api.github.com'

/** User-Agent header required by GitHub API */
const USER_AGENT = 'launchpd-cli'

/** Maximum download size in bytes (100MB) */
export const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024

/** Maximum number of files allowed in a tarball extraction */
export const MAX_FILE_COUNT = 10_000

/** Maximum directory nesting depth during extraction */
export const MAX_EXTRACT_DEPTH = 50

/** Maximum number of concurrent gist file downloads */
export const GIST_PARALLEL_LIMIT = 5

/** Fetch timeout in milliseconds (30 seconds) */
export const FETCH_TIMEOUT_MS = 30_000

/**
 * Trusted domains allowed for raw gist content downloads (SSRF protection)
 */
const TRUSTED_RAW_HOSTS = new Set([
  'gist.githubusercontent.com',
  'raw.githubusercontent.com'
])

/**
 * Windows reserved filenames (case-insensitive) that must not be written to disk
 */
const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9'
])

// ============================================================================
// URL Detection & Parsing
// ============================================================================

/**
 * Check if the input looks like a remote URL
 * @param {string} input - The deploy source argument
 * @returns {boolean}
 */
export function isRemoteUrl (input) {
  if (!input || typeof input !== 'string') return false
  return (
    input.startsWith('https://github.com/') ||
    input.startsWith('https://gist.github.com/') ||
    input.startsWith('http://github.com/') ||
    input.startsWith('http://gist.github.com/')
  )
}

/**
 * Parse a GitHub URL into its components
 * @param {string} url - The GitHub URL
 * @returns {{ type: 'gist'|'repo', owner: string, repo?: string, gistId?: string }}
 * @throws {Error} If the URL format is not recognized
 */
export function parseRemoteUrl (url) {
  if (!url || typeof url !== 'string') {
    throw new Error('URL is required')
  }

  let parsed = null
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Invalid URL: "${url}". Expected a GitHub or Gist URL.`)
  }

  const pathname = parsed.pathname.replace(/\/+$/, '') // strip trailing slashes
  const segments = pathname.split('/').filter(Boolean)

  // Gist URL: https://gist.github.com/{user}/{gist_id}
  if (parsed.hostname === 'gist.github.com') {
    if (segments.length < 2) {
      throw new Error(
        `Invalid Gist URL: "${url}". Expected format: https://gist.github.com/{user}/{gist_id}`
      )
    }
    return {
      type: 'gist',
      owner: segments[0],
      gistId: segments[1]
    }
  }

  // Repo URL: https://github.com/{user}/{repo}
  if (parsed.hostname === 'github.com') {
    if (segments.length < 2) {
      throw new Error(
        `Invalid GitHub URL: "${url}". Expected format: https://github.com/{user}/{repo}`
      )
    }
    return {
      type: 'repo',
      owner: segments[0],
      repo: segments[1]
    }
  }

  throw new Error(
    `Unsupported URL host: "${parsed.hostname}". Only github.com and gist.github.com are supported.`
  )
}

// ============================================================================
// Security Helpers
// ============================================================================

/**
 * Check GitHub API rate limit headers and throw if exhausted
 * @param {Response} response - The fetch response
 * @throws {Error} If rate limit is exhausted
 */
function checkRateLimit (response) {
  const remaining = response.headers.get('X-RateLimit-Remaining')
  const resetTimestamp = response.headers.get('X-RateLimit-Reset')

  if (response.status === 403 && remaining === '0') {
    const resetDate = resetTimestamp
      ? new Date(parseInt(resetTimestamp) * 1000)
      : null
    const resetMsg = resetDate
      ? ` Rate limit resets at ${resetDate.toLocaleTimeString()}.`
      : ''
    throw new Error(
      `GitHub API rate limit exceeded.${resetMsg} Unauthenticated requests are limited to 60/hour.`
    )
  }
}

/**
 * Validate a gist filename to prevent path traversal and Windows reserved names.
 * Rejects:
 *   - filenames containing ".." (parent traversal)
 *   - filenames containing path separators
 *   - filenames containing null bytes
 *   - Windows reserved device names (CON, NUL, COM1, etc.)
 *   - filenames consisting only of dots (e.g. ".", "...")
 * @param {string} filename - The filename from the gist
 * @throws {Error} If filename contains dangerous characters or reserved names
 */
export function validateGistFilename (filename) {
  if (
    filename.includes('..') ||
    filename.includes(sep) ||
    filename.includes(posix.sep) ||
    filename.includes('\0')
  ) {
    throw new Error(
      `Unsafe gist filename: "${filename}". Filenames must not contain path separators or parent references.`
    )
  }

  // Reject dot-only filenames (e.g. ".", "...", "....")
  if (/^\.+$/.test(filename)) {
    throw new Error(
      `Unsafe gist filename: "${filename}". Filenames consisting only of dots are not allowed.`
    )
  }

  // Reject Windows reserved device names (case-insensitive, with or without extension)
  const nameWithoutExt = filename.split('.')[0].toUpperCase()
  if (WINDOWS_RESERVED_NAMES.has(nameWithoutExt)) {
    throw new Error(
      `Unsafe gist filename: "${filename}". Windows reserved names (CON, NUL, COM1, etc.) are not allowed.`
    )
  }
}

/**
 * Validate that a --dir path doesn't escape the temp directory
 * @param {string} tempDir - The temp directory root
 * @param {string} dir - The user-supplied --dir value
 * @returns {string} The resolved safe path
 * @throws {Error} If the path escapes the temp directory
 */
function validateDirPath (tempDir, dir) {
  const resolvedDir = resolve(tempDir, dir)
  const normalizedTempDir = resolve(tempDir)

  if (
    !resolvedDir.startsWith(normalizedTempDir + sep) &&
    resolvedDir !== normalizedTempDir
  ) {
    throw new Error(
      `Unsafe --dir path: "${dir}". The path must not escape the repository root.`
    )
  }
  return resolvedDir
}

/**
 * Validate that a raw_url is from a trusted GitHub domain (SSRF protection).
 * @param {string} rawUrl - The raw_url from the Gist API
 * @throws {Error} If the URL points to an untrusted host
 */
function validateRawUrl (rawUrl) {
  let parsed = null
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(
      `Invalid raw_url in Gist response: "${rawUrl}". Cannot fetch from this location.`
    )
  }

  if (!TRUSTED_RAW_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Untrusted raw_url host: "${parsed.hostname}". Only githubusercontent.com domains are allowed. This may indicate a malicious Gist response.`
    )
  }
}

/**
 * Create a Transform stream that enforces a maximum byte limit
 * @param {number} maxBytes - Maximum allowed bytes
 * @returns {Transform} A transform stream that throws if limit is exceeded
 */
function createSizeLimitStream (maxBytes) {
  let bytesReceived = 0
  return new Transform({
    transform (chunk, _encoding, callback) {
      bytesReceived += chunk.length
      if (bytesReceived > maxBytes) {
        callback(
          new Error(
            `Download exceeds maximum size limit of ${Math.round(maxBytes / 1024 / 1024)}MB. Aborting.`
          )
        )
        return
      }
      callback(null, chunk)
    }
  })
}

/**
 * Create a tar filter function that enforces security limits
 * Prevents: symlinks, excessive file count, deep nesting, ignored files
 * @returns {{ filter: Function, getStats: Function }}
 */
function createTarFilter () {
  let fileCount = 0

  const filter = (path, entry) => {
    // Block symlinks and hard links
    if (entry.type === 'SymbolicLink' || entry.type === 'Link') {
      return false
    }

    // Enforce file count limit
    fileCount++
    if (fileCount > MAX_FILE_COUNT) {
      throw new Error(
        `Tarball exceeds maximum file count of ${MAX_FILE_COUNT}. This may be a tar bomb.`
      )
    }

    // Enforce depth limit
    const depth = path.split('/').filter(Boolean).length
    if (depth > MAX_EXTRACT_DEPTH) {
      throw new Error(
        `Tarball exceeds maximum directory depth of ${MAX_EXTRACT_DEPTH}. This may be a tar bomb.`
      )
    }

    // Skip ignored files/directories (node_modules, .git, etc.)
    const parts = path.split('/').filter(Boolean)
    const name = parts[parts.length - 1]
    return !(name && isIgnored(name, entry.type === 'Directory'))
  }

  /** @returns {{ fileCount: number }} Snapshot of extraction statistics */
  const getStats = () => ({ fileCount })
  return { filter, getStats }
}

/**
 * Create an AbortController with a timeout.
 * @param {number} ms - Timeout in milliseconds
 * @returns {{ signal: AbortSignal, clear: () => void }}
 */
function createFetchTimeout (ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  }
}

// ============================================================================
// Fetchers
// ============================================================================

/**
 * Fetch content from a GitHub Gist into a temp directory.
 * Validates filenames and downloads truncated files in parallel.
 * @param {string} gistId - The Gist ID
 * @returns {Promise<string>} Path to the directory containing gist files
 */
async function fetchGist (gistId) {
  const { signal, clear } = createFetchTimeout(FETCH_TIMEOUT_MS)
  let response = null
  try {
    response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': USER_AGENT
      },
      signal
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        `Request timed out while fetching Gist "${gistId}". The server did not respond within ${FETCH_TIMEOUT_MS / 1000}s.`
      )
    }
    throw err
  } finally {
    clear()
  }

  // Check rate limit before checking status
  checkRateLimit(response)

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `Gist not found: "${gistId}". Make sure the Gist exists and is public.`
      )
    }
    throw new Error(
      `GitHub API error (${response.status}): Failed to fetch Gist "${gistId}".`
    )
  }

  const data = await response.json()
  const files = data.files

  if (!files || Object.keys(files).length === 0) {
    throw new Error(`Gist "${gistId}" has no files.`)
  }

  // Create temp directory
  const tempDir = await mkdtemp(join(tmpdir(), 'launchpd-gist-'))

  // Validate all filenames first
  for (const filename of Object.keys(files)) {
    validateGistFilename(filename)
  }

  // Track total size
  let totalBytes = 0

  // Separate files into inline and truncated (need download)
  const inlineFiles = []
  const truncatedFiles = []

  for (const [filename, fileData] of Object.entries(files)) {
    if (fileData.truncated && fileData.raw_url) {
      truncatedFiles.push([filename, fileData])
    } else {
      inlineFiles.push([filename, fileData])
    }
  }

  // Write inline files immediately
  for (const [filename, fileData] of inlineFiles) {
    const content = fileData.content || ''
    totalBytes += Buffer.byteLength(content)
    if (totalBytes > MAX_DOWNLOAD_BYTES) {
      throw new Error(
        `Gist exceeds maximum size limit of ${Math.round(MAX_DOWNLOAD_BYTES / 1024 / 1024)}MB. Aborting.`
      )
    }
    await writeFile(join(tempDir, filename), content)
  }

  // Download truncated files in parallel batches.
  // The per-file download logic is extracted into a named function declared
  // outside the loop so that no closure is created inside the loop (JS-0073).
  // totalBytes is passed as a parameter instead of captured from the outer scope.

  /**
   * Download a single truncated gist file.
   * @param {string} filename
   * @param {{ raw_url: string }} fileData
   * @param {number} currentTotalBytes - snapshot of totalBytes at call time
   * @returns {Promise<{ filename: string, content: string, size: number }>}
   */
  async function downloadTruncatedFile (filename, fileData, currentTotalBytes) {
    // SSRF protection: validate raw_url domain before fetching
    validateRawUrl(fileData.raw_url)

    const { signal: rawSignal, clear: rawClear } =
      createFetchTimeout(FETCH_TIMEOUT_MS)
    let rawResponse = null
    try {
      rawResponse = await fetch(fileData.raw_url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: rawSignal
      })
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(
          `Request timed out while downloading file "${filename}" from Gist. The server did not respond within ${FETCH_TIMEOUT_MS / 1000}s.`
        )
      }
      throw err
    } finally {
      rawClear()
    }

    if (!rawResponse.ok) {
      throw new Error(`Failed to download file "${filename}" from Gist.`)
    }

    // Content-Length pre-check for truncated gist files (optimization)
    const rawContentLength = parseInt(
      rawResponse.headers.get('Content-Length') || '0'
    )
    if (
      rawContentLength > 0 &&
      currentTotalBytes + rawContentLength > MAX_DOWNLOAD_BYTES
    ) {
      throw new Error(
        `Gist exceeds maximum size limit of ${Math.round(MAX_DOWNLOAD_BYTES / 1024 / 1024)}MB. Aborting.`
      )
    }

    const content = await rawResponse.text()
    return { filename, content, size: Buffer.byteLength(content) }
  }

  for (let i = 0; i < truncatedFiles.length; i += GIST_PARALLEL_LIMIT) {
    const batch = truncatedFiles.slice(i, i + GIST_PARALLEL_LIMIT)
    const snapshotBytes = totalBytes

    const results = await Promise.all(
      batch.map(([filename, fileData]) =>
        downloadTruncatedFile(filename, fileData, snapshotBytes)
      )
    )

    // Accumulate sizes and write files serially — size limit enforced here.
    for (const { filename, content, size } of results) {
      totalBytes += size
      if (totalBytes > MAX_DOWNLOAD_BYTES) {
        throw new Error(
          `Gist exceeds maximum size limit of ${Math.round(MAX_DOWNLOAD_BYTES / 1024 / 1024)}MB. Aborting.`
        )
      }
      await writeFile(join(tempDir, filename), content)
    }
  }

  return tempDir
}

/**
 * Fetch and extract a GitHub repo tarball into a temp directory.
 * Enforces size limits, strips symlinks, and protects against tar bombs.
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} [branch] - Branch/tag/ref (defaults to repo default branch)
 * @returns {Promise<string>} Path to the extracted repo root
 */
async function fetchRepo (owner, repo, branch) {
  const ref = branch || ''
  const tarballUrl = `${GITHUB_API}/repos/${owner}/${repo}/tarball/${ref}`

  const { signal, clear } = createFetchTimeout(FETCH_TIMEOUT_MS)
  let response = null
  try {
    response = await fetch(tarballUrl, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': USER_AGENT
      },
      redirect: 'follow',
      signal
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        `Request timed out while fetching repository "${owner}/${repo}". The server did not respond within ${FETCH_TIMEOUT_MS / 1000}s.`
      )
    }
    throw err
  } finally {
    clear()
  }

  // Check rate limit before checking status
  checkRateLimit(response)

  if (!response.ok) {
    if (response.status === 404) {
      const branchMsg = branch ? ` (branch: "${branch}")` : ''
      throw new Error(
        `Repository not found: "${owner}/${repo}"${branchMsg}. Make sure the repo exists and is public.`
      )
    }
    throw new Error(
      `GitHub API error (${response.status}): Failed to fetch repo "${owner}/${repo}".`
    )
  }

  // Content-Type validation: must be a tar/gzip stream, not an HTML error page
  const contentType = response.headers.get('Content-Type') || ''
  if (
    contentType.includes('text/html') ||
    contentType.includes('application/json')
  ) {
    throw new Error(
      `Unexpected Content-Type "${contentType}" for repository tarball. Expected a binary archive. The repository may not be accessible or the URL may be incorrect.`
    )
  }

  // Check Content-Length header for early size rejection
  const contentLength = parseInt(response.headers.get('Content-Length') || '0')
  if (contentLength > MAX_DOWNLOAD_BYTES) {
    throw new Error(
      `Repository tarball (${Math.round(contentLength / 1024 / 1024)}MB) exceeds maximum size limit of ${Math.round(MAX_DOWNLOAD_BYTES / 1024 / 1024)}MB.`
    )
  }

  // Create temp directory
  const tempDir = await mkdtemp(join(tmpdir(), 'launchpd-repo-'))

  // Create security filters
  const { filter } = createTarFilter()
  const sizeLimitStream = createSizeLimitStream(MAX_DOWNLOAD_BYTES)

  // Extract tarball with all protections
  const body = Readable.fromWeb(response.body)
  await pipeline(
    body,
    sizeLimitStream,
    createGunzip(),
    tar.extract({
      cwd: tempDir,
      strip: 1, // GitHub tarballs have a top-level directory like "user-repo-sha/"
      filter
    })
  )

  return tempDir
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Fetch remote source (Gist or Repo) and return the path to deploy from
 * @param {{ type: 'gist'|'repo', owner: string, repo?: string, gistId?: string }} parsed
 * @param {{ branch?: string, dir?: string }} options
 * @returns {Promise<{ tempDir: string, folderPath: string }>}
 */
export async function fetchRemoteSource (parsed, options = {}) {
  let tempDir = null

  if (parsed.type === 'gist') {
    tempDir = await fetchGist(parsed.gistId)
  } else if (parsed.type === 'repo') {
    tempDir = await fetchRepo(parsed.owner, parsed.repo, options.branch)
  } else {
    throw new Error(`Unknown remote source type: "${parsed.type}"`)
  }

  // Resolve subdirectory if --dir was specified (with path traversal check)
  const folderPath = options.dir
    ? validateDirPath(tempDir, options.dir)
    : tempDir

  return { tempDir, folderPath }
}

/**
 * Clean up a temporary directory created by fetchRemoteSource
 * @param {string} tempDir - Path to the temp directory
 */
export async function cleanupTempDir (tempDir) {
  if (!tempDir) return
  try {
    await rm(tempDir, { recursive: true, force: true })
  } catch {
    // Best-effort cleanup - don't throw if it fails
  }
}
