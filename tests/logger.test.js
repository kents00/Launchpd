import * as logger from '../src/utils/logger.js'
import ora from 'ora'

vi.mock('ora')

describe('Logger', () => {
  let consoleLogSpy
  let consoleErrorSpy

  beforeEach(() => {
    vi.clearAllMocks()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('log should log plain message', () => {
    logger.log('test')
    expect(consoleLogSpy).toHaveBeenCalledWith('test')
  })

  it('log should handle empty message', () => {
    logger.log()
    expect(consoleLogSpy).toHaveBeenCalledWith('')
  })

  it('success should log with green check', () => {
    logger.success('test')
    expect(consoleLogSpy).toHaveBeenCalled()
  })

  it('error should log with red cross', () => {
    logger.error('test')
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('error should log stack trace if verbose', () => {
    logger.error('test', { verbose: true, cause: new Error('cause') })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Stack trace')
    )
  })

  it('error should log cause message if stack is missing in verbose mode', () => {
    logger.error('test', { verbose: true, cause: { message: 'cause msg' } })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('cause msg')
    )
  })

  it('info should log with info symbol', () => {
    logger.info('test')
    expect(consoleLogSpy).toHaveBeenCalled()
  })

  it('warning should log with warning symbol', () => {
    logger.warning('test')
    expect(consoleLogSpy).toHaveBeenCalled()
  })

  it('raw should use specified method', () => {
    logger.raw('test', 'warn')
    expect(console.warn).toHaveBeenCalledWith('test')
  })

  it('raw should fallback to log for invalid method', () => {
    logger.raw('test', 'invalid')
    expect(consoleLogSpy).toHaveBeenCalledWith('test')
  })

  it('formatSize should format bytes correctly', () => {
    expect(logger.formatSize(0)).toBe('0 Bytes')
    expect(logger.formatSize(1024)).toBe('1 KB')
    expect(logger.formatSize(1024 * 1024)).toBe('1 MB')
    expect(logger.formatSize(1024 * 1024 * 1024)).toBe('1 GB')
    expect(logger.formatSize(500, 0)).toBe('500 Bytes')
  })

  describe('errorWithSuggestions', () => {
    it('should log error and suggestions', () => {
      logger.errorWithSuggestions('Main error', ['Try this', 'Or that'])
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Main error')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Suggestions')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Try this')
      )
    })

    it('should handle empty suggestions', () => {
      logger.errorWithSuggestions('Main error')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Main error')
      )
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Suggestions')
      )
    })
  })

  describe('spinner', () => {
    it('should create and control spinner', () => {
      const mockOraInstance = {
        start: vi.fn(),
        succeed: vi.fn(),
        fail: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        stop: vi.fn(),
        text: ''
      }
      mockOraInstance.start.mockReturnValue(mockOraInstance)
      ora.mockReturnValue(mockOraInstance)

      const s = logger.spinner('loading')
      expect(ora).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'loading' })
      )

      s.update('new text')
      expect(mockOraInstance.text).toBe('new text')

      s.info('info msg')
      expect(mockOraInstance.info).toHaveBeenCalled()

      // Should handle being called again gracefully (null check)
      s.succeed('done')
      // activeSpinner is null now from previous call, but our mock doesn't simulate the side effect of module-level var
      // However, we can test that calling it on a "new" spinner works

      const s2 = logger.spinner('loading 2')
      s2.warn('warning')
      expect(mockOraInstance.warn).toHaveBeenCalled()

      const s3 = logger.spinner('loading 3')
      s3.succeed('success')
      expect(mockOraInstance.succeed).toHaveBeenCalled()

      const s4 = logger.spinner('loading 4')
      s4.fail('failure')
      expect(mockOraInstance.fail).toHaveBeenCalled()

      const s5 = logger.spinner('loading 5')
      s5.stop()
      expect(mockOraInstance.stop).toHaveBeenCalled()
    })

    it('should be safe to call methods when no active spinner', () => {
      // This is tricky to test since the exported `spinner` function always creates one.
      // But we can check if calling methods on the returned object *after* it's been stopped doesn't crash
      // The implementation nullifies the module-level variable, not the returned object's references to it
      // (wait, the returned object methods check `activeSpinner` which is the module-level var)

      const mockOraInstance = {
        start: vi.fn().mockReturnThis(),
        stop: vi.fn(),
        succeed: vi.fn()
      }
      ora.mockReturnValue(mockOraInstance)

      const s = logger.spinner('test')
      s.stop() // sets activeSpinner = null

      // These should not throw and not call the underlying mock because activeSpinner is null
      s.update('update')
      s.succeed('succeed')
      s.fail('fail')
      s.info('info')
      s.warn('warn')
      s.stop()

      expect(mockOraInstance.succeed).not.toHaveBeenCalled()
    })
  })
})
