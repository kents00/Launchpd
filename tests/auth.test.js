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
import { spinner, warning, success, log, info, errorWithSuggestions, error } from '../src/utils/logger.js'
import * as api from '../src/utils/api.js'
import { execFile } from 'node:child_process'
import { handleCommonError } from '../src/utils/errors.js'

vi.mock('../src/utils/credentials.js')
vi.mock('../src/utils/prompt.js')
vi.mock('../src/utils/logger.js')
vi.mock('../src/utils/api.js')
vi.mock('../src/utils/errors.js')
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
    })

    it('should warn if already logged in (userId only)', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(true)
      vi.mocked(credentials.getCredentials).mockResolvedValue({
        userId: '123'
      })

      await login()

      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining('123')
      )
    })

    it('should login and show usage if available', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(false)
      vi.mocked(promptSecret).mockResolvedValue('lpd_1234567890123456')

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          authenticated: true,
          user: { email: 'test@example.com', id: '123', api_secret: 'secret' },
          tier: 'pro',
          usage: { siteCount: 2, storageUsedMB: 10 },
          limits: { maxSites: 10, maxStorageMB: 100 }
        })
      })

      await login()
      expect(credentials.saveCredentials).toHaveBeenCalledWith(expect.objectContaining({
        apiSecret: 'secret'
      }))
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Sites: 2/10'))
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Storage: 10 MB/100 MB'))
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
      expect(spinner().succeed).toHaveBeenCalled()
    })

    it('should login success with missing user fields', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(false)
      vi.mocked(promptSecret).mockResolvedValue('lpd_1234567890123456')

      fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            authenticated: true,
            user: { id: 1 },
          })
      })

      await login()
      expect(log).toHaveBeenCalledWith(expect.stringContaining('N/A'))
      expect(log).toHaveBeenCalledWith(expect.stringContaining('registered'))
    })

    it('should login success with usage/limits fallback', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(false)
      vi.mocked(promptSecret).mockResolvedValue('lpd_1234567890123456')

      fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            authenticated: true,
            user: { id: 1 },
            usage: {},
            limits: {}
          })
      })

      await login()
      expect(log).toHaveBeenCalledWith(expect.stringContaining('0/?'))
    })

    it('should handle 2FA required during login', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(false)
      vi.mocked(promptSecret).mockResolvedValue('lpd_1234567890123456')

      fetch.mockResolvedValue({
        ok: true,
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

    it('should fail with server error during API key validation', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(false)
      vi.mocked(promptSecret).mockResolvedValue('lpd_1234567890123456')

      fetch.mockRejectedValue(new Error('Network error'))

      await expect(login()).rejects.toThrow('Process.exit(1)')
      expect(spinner().fail).toHaveBeenCalledWith('Invalid API key')
    })

    it('should fail if no API key is provided at prompt', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(false)
      vi.mocked(promptSecret).mockResolvedValue('')

      await expect(login()).rejects.toThrow('Process.exit(1)')
      expect(errorWithSuggestions).toHaveBeenCalledWith(
        expect.stringContaining('API key is required'),
        expect.anything()
      )
    })
  })

  describe('logout', () => {
    it('should warn if not logged in', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(false)
      await logout()
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
      expect(info).toHaveBeenCalledWith(expect.stringContaining('Was logged in as'))
    })

    it('should logout without email info', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(true)
      vi.mocked(credentials.getCredentials).mockResolvedValue({
        userId: '123'
      })
      await logout()
      expect(info).not.toHaveBeenCalledWith(expect.stringContaining('Was logged in as'))
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

    it('should upgrade credentials in whoami if api_secret is provided', async () => {
      vi.mocked(credentials.getCredentials).mockResolvedValue({
        apiKey: 'lpd_1234567890123456',
        email: 'test'
      })
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          authenticated: true,
          user: { id: '123', email: 'test@example.com', api_secret: 'new_secret' },
          tier: 'pro',
          usage: {},
          limits: {}
        })
      })

      await whoami()
      expect(credentials.saveCredentials).toHaveBeenCalledWith(expect.objectContaining({
        apiSecret: 'new_secret'
      }))
    })

    it('should fallback to creds.userId/email in updateCredentialsIfNeeded', async () => {
      vi.mocked(credentials.getCredentials).mockResolvedValue({
        apiKey: 'lpd_1234567890123456',
        userId: 'old_id',
        email: 'old_email'
      })
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          authenticated: true,
          user: { api_secret: 'new_secret' }, // missing id and email
          tier: 'pro',
          usage: {},
          limits: {}
        })
      })

      await whoami()
      expect(credentials.saveCredentials).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'old_id',
        email: 'old_email'
      }))
    })

    it('should handle session expiry in whoami', async () => {
      vi.mocked(credentials.getCredentials).mockResolvedValue({
        apiKey: 'lpd_invalid_format_but_prefix_ok_1234567890',
        email: 'test'
      })

      await expect(whoami()).rejects.toThrow('Process.exit(1)')

      vi.mocked(credentials.getCredentials).mockResolvedValue({
        apiKey: 123,
        email: 'test'
      })
      await expect(whoami()).rejects.toThrow('Process.exit(1)')

      vi.mocked(credentials.getCredentials).mockResolvedValue({ apiKey: 'lpd_1234567890123456' })
      fetch.mockResolvedValueOnce({ ok: false, status: 500 })
      await expect(whoami()).rejects.toThrow('Process.exit(1)')

      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ authenticated: false })
      })
      await expect(whoami()).rejects.toThrow('Process.exit(1)')
    })

    it('should show various 2FA states in whoami', async () => {
      vi.mocked(credentials.getCredentials).mockResolvedValue({ apiKey: 'lpd_1234567890123456' })

      // Both enabled
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          authenticated: true,
          user: { is_2fa_enabled: true, is_email_2fa_enabled: true }
        })
      })
      await whoami()
      expect(log).toHaveBeenCalledWith(expect.stringContaining('App + Email'))

      // Email only
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          authenticated: true,
          user: { is_2fa_enabled: false, is_email_2fa_enabled: true }
        })
      })
      await whoami()
      expect(log).toHaveBeenCalledWith(expect.stringContaining('(Email)'))

      // None enabled (triggers recommendation)
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          authenticated: true,
          user: { is_2fa_enabled: false, is_email_2fa_enabled: false }
        })
      })
      await whoami()
      expect(info).toHaveBeenCalledWith(expect.stringContaining('Enable 2FA'))
    })

    it('should show warnings and verification status in whoami', async () => {
      vi.mocked(credentials.getCredentials).mockResolvedValue({ apiKey: 'lpd_1234567890123456' })
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          authenticated: true,
          user: { email: 'test', email_verified: false },
          warnings: ['Test Warning'],
          canCreateNewSite: false
        })
      })

      await whoami()
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Warnings:'))
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('email is not verified'))
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('limit reached'))
    })

    it('should not show limit warning if canCreateNewSite is true', async () => {
      vi.mocked(credentials.getCredentials).mockResolvedValue({ apiKey: 'lpd_1234567890123456' })
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          authenticated: true,
          user: { email: 'test', email_verified: true },
          canCreateNewSite: true
        })
      })

      await whoami()
      expect(warning).not.toHaveBeenCalledWith(expect.stringContaining('limit reached'))
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

    it('should handle browser opening failure', () => {
      vi.mocked(execFile).mockImplementation((cmd, args, cb) => cb(new Error('Fail')))
      register()
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Please open this URL'))
    })

    it('should use "open" command on macOS', () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'darwin' })

      register()
      expect(execFile).toHaveBeenCalledWith('open', expect.anything(), expect.anything())

      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })

    it('should use "start" command on Windows', () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'win32' })

      register()
      expect(execFile).toHaveBeenCalledWith('cmd', expect.arrayContaining(['/c', 'start']), expect.anything())

      Object.defineProperty(process, 'platform', { value: originalPlatform })
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

    it('should handle rate limiting in verification', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(true)
      vi.mocked(api.resendVerification).mockResolvedValue({
        success: false,
        seconds_remaining: 60
      })

      await resendEmailVerification()
      expect(info).toHaveBeenCalledWith(expect.stringContaining('Please wait 60 seconds'))
    })

    it('should handle common errors and fallback in verification', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(true)
      vi.mocked(api.resendVerification).mockRejectedValue(new Error('Unexpected'))

      vi.mocked(handleCommonError).mockReturnValueOnce(true)
      await expect(resendEmailVerification()).rejects.toThrow('Process.exit(1)')

      vi.mocked(handleCommonError).mockReturnValueOnce(false)
      await expect(resendEmailVerification()).rejects.toThrow('Process.exit(1)')
    })

    it('should handle error without message in resendVerification', async () => {
      vi.mocked(credentials.isLoggedIn).mockResolvedValue(true)
      vi.mocked(api.resendVerification).mockRejectedValue(new Error('')) // Empty message

      vi.mocked(handleCommonError).mockReturnValue(false)

      await expect(resendEmailVerification()).rejects.toThrow('Process.exit(1)')
      expect(error).toHaveBeenCalledWith('Failed to resend verification email')
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

    it('should show warnings when usage is high', async () => {
      vi.mocked(credentials.getCredentials).mockResolvedValue({ apiKey: 'lpd_1234567890123456' })
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          authenticated: true,
          usage: { siteCount: 10, storageUsed: 95 * 1024 * 1024 },
          limits: { maxSites: 10, maxStorageMB: 100 },
          canCreateNewSite: false
        })
      })

      await quota()
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('Site limit reached'))
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('Storage 95% used'))
    })

    it('should quota success with usage/limits fallback', async () => {
      vi.mocked(credentials.getCredentials).mockResolvedValue({ apiKey: 'lpd_1234567890123456' })
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          authenticated: true,
          usage: {},
          limits: {}
        })
      })

      await quota()
      expect(log).toHaveBeenCalled()
    })

    it('should test progress bar color thresholds', async () => {
      vi.mocked(credentials.getCredentials).mockResolvedValue({ apiKey: 'lpd_1234567890123456' })

      // 70% threshold (Yellow)
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          authenticated: true,
          usage: { siteCount: 7, storageUsed: 0 },
          limits: { maxSites: 10, maxStorageMB: 100 }
        })
      })
      await quota()

      // 90% threshold (Red)
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          authenticated: true,
          usage: { siteCount: 9, storageUsed: 0 },
          limits: { maxSites: 10, maxStorageMB: 100 }
        })
      })
      await quota()

      expect(log).toHaveBeenCalled()
    })
  })
})
