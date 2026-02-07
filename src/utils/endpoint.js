/**
 * Endpoint validation utility
 */

import { APIError } from './errors.js'

/**
 * Validates an endpoint to prevent SSRF vulnerabilities.
 * It ensures the endpoint is a relative path and does not contain
 * characters that could lead to path traversal or redirection to another host.
 *
 * @param {string} endpoint - The API endpoint to validate.
 * @throws {APIError} If the endpoint is invalid.
 */
export function validateEndpoint (endpoint) {
  if (typeof endpoint !== 'string' || endpoint.trim() === '') {
    throw new APIError('Endpoint must be a non-empty string.', 400)
  }

  // 0. Enforce relative path starting with slash
  if (!endpoint.startsWith('/')) {
    throw new APIError(
      'Endpoint must start with a slash (/), e.g. /api/deploy',
      400
    )
  }

  // 1. Disallow absolute URLs
  if (endpoint.startsWith('//') || endpoint.includes('://')) {
    throw new APIError('Endpoint cannot be an absolute URL.', 400)
  }

  // 2. Prevent path traversal
  if (endpoint.includes('..')) {
    throw new APIError(
      'Endpoint cannot contain path traversal characters (..).',
      400
    )
  }

  // 3. Check for characters that could be used for protocol or host manipulation
  // Disallow characters like ':', '@', and '\' (encoded as %5C)
  // We allow '/' for path segments.
  // The regex checks for any characters that are not:
  // - alphanumeric (a-z, A-Z, 0-9)
  // - forward slash (/)
  // - hyphen (-)
  // - underscore (_)
  // - dot (.)
  // - question mark (?) for query params
  // - equals (=) for query params
  // - ampersand (&) for query params
  // - percent (%) for url encoding
  const allowedChars = /^[a-zA-Z0-9/\-_.?=&%]+$/
  if (!allowedChars.test(endpoint)) {
    throw new APIError('Endpoint contains invalid characters.', 400)
  }
}
