import errors, {
  APIError,
  MaintenanceError,
  AuthError,
  QuotaError,
  NetworkError,
  handleCommonError
} from '../src/utils/errors.js'

describe('Errors', () => {
  describe('Classes', () => {
    it('APIError should have status and data', () => {
      const err = new APIError('msg', 400, { foo: 'bar' })
      expect(err.message).toBe('msg')
      expect(err.statusCode).toBe(400)
      expect(err.data).toEqual({ foo: 'bar' })
      expect(err.name).toBe('APIError')
    })

    it('MaintenanceError should default to 503', () => {
      const err = new MaintenanceError()
      expect(err.statusCode).toBe(503)
      expect(err.isMaintenanceError).toBe(true)
    })

    it('AuthError should default to 401', () => {
      const err = new AuthError()
      expect(err.statusCode).toBe(401)
      expect(err.isAuthError).toBe(true)
    })

    it('QuotaError should default to 429', () => {
      const err = new QuotaError()
      expect(err.statusCode).toBe(429)
      expect(err.isQuotaError).toBe(true)
    })

    it('NetworkError should be standard Error', () => {
      const err = new NetworkError()
      expect(err.isNetworkError).toBe(true)
    })
  })

  describe('handleCommonError', () => {
    let logger
    beforeEach(() => {
      logger = {
        error: vi.fn(),
        info: vi.fn(),
        warning: vi.fn()
      }
    })

    it('should handle MaintenanceError', () => {
      const err = new MaintenanceError()
      const handled = handleCommonError(err, logger)
      expect(handled).toBe(true)
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('maintenance')
      )
    })

    it('should handle AuthError', () => {
      const err = new AuthError()
      const handled = handleCommonError(err, logger)
      expect(handled).toBe(true)
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Authentication failed')
      )
    })

    it('should handle NetworkError', () => {
      const err = new NetworkError()
      const handled = handleCommonError(err, logger)
      expect(handled).toBe(true)
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Unable to connect')
      )
    })

    it('should handle QuotaError', () => {
      const err = new QuotaError()
      const handled = handleCommonError(err, logger)
      expect(handled).toBe(true)
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Quota limit reached')
      )
    })

    it('should return false for unknown errors', () => {
      const err = new Error('Random')
      const handled = handleCommonError(err, logger)
      expect(handled).toBe(false)
    })
  })
})
