import { validateEndpoint } from '../src/utils/endpoint.js'

describe('endpoint.js', () => {
  it('should validate correct endpoints', () => {
    expect(() => validateEndpoint('/api/test')).not.toThrow()
  })

  it('should throw on invalid endpoint type', () => {
    expect(() => validateEndpoint(null)).toThrow(
      'Endpoint must be a non-empty string.'
    )
    expect(() => validateEndpoint(123)).toThrow(
      'Endpoint must be a non-empty string.'
    )
  })

  it('should throw on relative paths without leading slash', () => {
    expect(() => validateEndpoint('api/test')).toThrow(
      'Endpoint must start with a slash'
    )
  })

  it('should throw on absolute URLs', () => {
    expect(() => validateEndpoint('https://example.com')).toThrow(
      'Endpoint must start with a slash'
    )
    expect(() => validateEndpoint('//example.com')).toThrow(
      'Endpoint cannot be an absolute URL.'
    )
  })

  it('should throw on path traversal', () => {
    expect(() => validateEndpoint('/api/../etc/passwd')).toThrow(
      'Endpoint cannot contain path traversal characters (..).'
    )
  })

  it('should throw on insecure characters', () => {
    expect(() => validateEndpoint('/api/test:80')).toThrow(
      'Endpoint contains invalid characters.'
    )
  })
})
