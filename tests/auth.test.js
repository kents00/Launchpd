import {
  login,
  logout,
  whoami,
  register,
  resendEmailVerification,
  quota
} from '../src/commands/auth.js'
import * as credentials from '../src/utils/credentials.js'
import { promptSecret } from '../src/utils/prompt.js'
import { spinner, warning, success, log, info } from '../src/utils/logger.js'
import * as api from '../src/utils/api.js'
import { execFile } from 'node:child_process'

vi.mock('../src/utils/credentials.js')
vi.mock('../src/utils/prompt.js')
vi.mock('../src/utils/logger.js')
vi.mock('../src/utils/api.js')
vi.mock('node:child_process', () => ({
  execFile: vi.fn((cmd, args, cb) => cb(null))
}))

// Mock global fetch
globalThis.fetch = vi.fn()

describe('auth commands', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    spinner.mockReturnValue({
      succeed: vi.fn(),
      fail: vi.fn(),
      start: vi.fn()
    })
    // Make process.exit throw so we can catch it and verify it was called
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`Process.exit(${code})`)
    })
  })

  describe('login', () => {
    it('should warn if already logged in', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(true)
      vi.mocked(credentials.getCredentials).mockResolvedValue({
        email: 'test@example.com'
      })

      await login()

      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining('Already logged in')
      )
      expect(promptSecret).not.toHaveBeenCalled()
    })

    it('should login successfully with valid API key', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(false)
      vi.mocked(promptSecret).mockResolvedValue('lpd_1234567890123456')

      fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            authenticated: true,
            user: { id: 1, email: 'test', api_secret: 'sec' },
            tier: 'free'
          })
      })

      await login()

      expect(credentials.saveCredentials).toHaveBeenCalled()
      expect(spinner().succeed).toHaveBeenCalledWith(
        expect.stringContaining('Logged in')
      )
    })

    it('should handle 2FA required during login', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(false)
      vi.mocked(promptSecret).mockResolvedValue('lpd_1234567890123456')

      fetch.mockResolvedValue({
        ok: true, // Server returns 200/401 with JSON
        status: 401,
        json: () =>
          Promise.resolve({
            requires_2fa: true,
            two_factor_type: 'email'
          })
      })

      await expect(login()).rejects.toThrow('Process.exit(1)')
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining('2FA is required')
      )
    })

    it('should fail with invalid API key format', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(false)
      vi.mocked(promptSecret).mockResolvedValue('invalid-format')

      await expect(login()).rejects.toThrow('Process.exit(1)')

      expect(spinner().fail).toHaveBeenCalledWith(
        expect.stringContaining('Invalid API key')
      )
    })
  })

  describe('logout', () => {
    it('should warn if not logged in', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(false)
      await logout()
      expect(credentials.clearCredentials).not.toHaveBeenCalled()
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining('Not currently logged in')
      )
    })

    it('should logout if logged in', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(true)
      vi.mocked(credentials.getCredentials).mockResolvedValue({
        email: 'test@example.com'
      })
      await logout()
      expect(credentials.clearCredentials).toHaveBeenCalled()
      expect(success).toHaveBeenCalled()
    })
  })

  describe('whoami', () => {
    it('should show anonymous status if not logged in', async () => {
      vi.mocked(credentials.getCredentials).mockResolvedValue(null)
      await whoami()
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('anonymous mode')
      )
    })

    it('should show user info', async () => {
      vi.mocked(credentials.getCredentials).mockResolvedValue({
        apiKey: 'lpd_1234567890123456',
        email: 'test'
      })
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            authenticated: true,
            user: {
              email: 'test',
              email_verified: true,
              is_2fa_enabled: true
            },
            tier: 'pro',
            usage: { siteCount: 5, storageUsed: 1000 },
            limits: { maxSites: 10, maxStorageBytes: 5000 }
          })
      })

      await whoami()
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Logged in as'))
    })
  })

  describe('register', () => {
    it('should open the registration page', () => {
      register()
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Opening registration page')
      )
      expect(execFile).toHaveBeenCalled()
    })
  })

  describe('resendVerification', () => {
    it('should succeed if API returns success', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(true)
      vi.mocked(api.resendVerification).mockResolvedValue({ success: true })

      await resendEmailVerification()
      expect(spinner().succeed).toHaveBeenCalled()
    })

    it('should fail if not logged in', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(false)

      await expect(resendEmailVerification()).rejects.toThrow(
        'Process.exit(1)'
      )
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining('Run "launchpd login"')
      )
    })

    it('should handle API failure', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(true)
      vi.mocked(api.resendVerification).mockResolvedValue({
        success: false,
        message: 'Server error'
      })

      await resendEmailVerification()
      expect(spinner().fail).toHaveBeenCalledWith(
        'Failed to send verification email'
      )
    })

    it('should handle already verified error', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(true)
      vi.mocked(api.resendVerification).mockRejectedValue(
        new Error('Email already verified')
      )

      await resendEmailVerification()
      expect(success).toHaveBeenCalledWith(
        expect.stringContaining('already verified')
      )
    })
  })

  describe('quota', () => {
    it('should show anonymous limits if not logged in', async () => {
      vi.mocked(credentials.getCredentials).mockResolvedValue(null)

      await quota()

      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Anonymous Quota Status')
      )
      expect(log).toHaveBeenCalledWith(expect.stringContaining('3 maximum'))
    })

    it('should fetch and show quota if logged in', async () => {
      vi.mocked(credentials.getCredentials).mockResolvedValue({
        apiKey: 'lpd_1234567890123456',
        email: 'test@example.com'
      })
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            authenticated: true,
            tier: 'pro',
            usage: { siteCount: 5, storageUsed: 1024 * 1024 * 50 },
            limits: { maxSites: 10, maxStorageMB: 100 }
          })
      })

      await quota()

      expect(spinner().succeed).toHaveBeenCalledWith('Quota fetched')
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Sites:'))
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Storage:'))
    })

    it('should fail if API key invalid during quota fetch', async () => {
      vi.mocked(credentials.getCredentials).mockResolvedValue({
        apiKey: 'key'
      })
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      })

      await expect(quota()).rejects.toThrow('Process.exit(1)')
      expect(spinner().fail).toHaveBeenCalledWith('Failed to fetch quota')
    })
  })
})
