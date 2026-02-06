import { login } from '../src/commands/auth.js'
import * as credentials from '../src/utils/credentials.js'
import * as logger from '../src/utils/logger.js'
import * as promptUtils from '../src/utils/prompt.js'

// Mocks
vi.mock('../src/utils/credentials.js')
vi.mock('../src/utils/logger.js')
vi.mock('../src/utils/prompt.js')

// Mock config to avoid loading real config which might depend on files
vi.mock('../src/config.js', () => ({
  config: {
    domain: 'example.com'
  }
}))

describe('login command', () => {
  // No extra variables needed here if they are only used for side-effect setup

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock console and exit to prevent output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })

    // Default mock implementations
    credentials.isLoggedIn.mockResolvedValue(false)
    logger.spinner.mockReturnValue({
      start: vi.fn(),
      fail: vi.fn(),
      succeed: vi.fn(),
      stop: vi.fn()
    })
  })

  it('should handle invalid API key', async () => {
    // Key must match format: lpd_ + 16-64 alphanumeric chars to pass validation
    promptUtils.promptSecret.mockResolvedValue('lpd_test_invalid_key_1234')

    // Mock fetch failure (simulating invalid key result from server)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Invalid key' })
    })

    // Expect process.exit(1) to be called
    await expect(login()).rejects.toThrow('process.exit')

    // Verify spinner failure message
    const spinnerMock = logger.spinner()
    expect(spinnerMock.fail).toHaveBeenCalledWith('Invalid API key')

    // Verify error suggestions were shown
    expect(logger.errorWithSuggestions).toHaveBeenCalled()
  })

  it('should handle network errors gracefully', async () => {
    // Key must match format: lpd_ + 16-64 alphanumeric chars to pass validation
    promptUtils.promptSecret.mockResolvedValue('lpd_test_network_key_5678')

    // Mock network error
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    await expect(login()).rejects.toThrow('process.exit')

    const spinnerMock = logger.spinner()
    expect(spinnerMock.fail).toHaveBeenCalledWith('Invalid API key')
  })
})
