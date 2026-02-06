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

  it('formatSize should format bytes', () => {
    expect(logger.formatSize(1024)).toBe('1 KB')
    expect(logger.formatSize(0)).toBe('0 Bytes')
  })

  describe('spinner', () => {
    it('should create and control spinner', () => {
      const mockOraInstance = {
        start: vi.fn(),
        succeed: vi.fn(),
        fail: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        stop: vi.fn()
      }
      mockOraInstance.start.mockReturnValue(mockOraInstance)
      ora.mockReturnValue(mockOraInstance)

      const s = logger.spinner('loading')
      expect(ora).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'loading' })
      )

      s.update('new text')
      // check text prop assignment if possible, or just correctness of call

      s.succeed('done')
      expect(mockOraInstance.succeed).toHaveBeenCalled()

      // Re-create for other methods as instance is nullified
      const s2 = logger.spinner('loading')
      s2.fail('error')
      expect(mockOraInstance.fail).toHaveBeenCalled()
    })
  })
})
