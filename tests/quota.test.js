import {
  checkQuota,
  displayQuotaWarnings,
  formatBytes
} from '../src/utils/quota.js'
import * as credentials from '../src/utils/credentials.js'
import * as logger from '../src/utils/logger.js'

// Mock dependencies
vi.mock('../src/config.js', () => ({
  config: {
    domain: 'test.com'
  }
}))

vi.mock('../src/utils/credentials.js', () => ({
  getCredentials: vi.fn(),
  getClientToken: vi.fn()
}))

vi.mock('../src/utils/logger.js', () => ({
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  log: vi.fn(),
  raw: vi.fn(),
  success: vi.fn()
}))

// Mock fs to satisfy the dynamic import and trace logic
vi.mock('node:fs', () => ({
  appendFileSync: vi.fn()
}))

describe('quota.js', () => {
  // Mock global fetch
  const mockFetch = vi.fn()
  globalThis.fetch = mockFetch

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
    // Default credential mocks
    vi.mocked(credentials.getCredentials).mockResolvedValue({ apiKey: 'key' })
    vi.mocked(credentials.getClientToken).mockResolvedValue(
      'cli_0123456789abcdef0123456789abcdef'
    )
  })

  describe('checkQuota', () => {
    it('should handle API unavailability (fail-open)', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await checkQuota('new-site', 0)

      expect(result.allowed).toBe(true)
      expect(result.warnings).toContain(
        'Could not verify quota (API unavailable)'
      )
    })

    describe('Authenticated User', () => {
      it('should verify ownership and allow update', async () => {
        // 1. Quota fetch
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              canDeploy: true,
              usage: { sitesRemaining: 1, storageUsed: 0 },
              limits: { maxSites: 3, maxStorageBytes: 1000 }
            })
        })
        // 2. Subdomains fetch (ownership check)
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ subdomains: [{ subdomain: 'my-site' }] })
        })

        const result = await checkQuota('my-site', 100)
        expect(result.isNewSite).toBe(false)
        expect(result.allowed).toBe(true)
      })

      it('should detect new site if not in subdomains list', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              canDeploy: true,
              usage: { sitesRemaining: 1, storageUsed: 0 },
              limits: { maxSites: 3, maxStorageBytes: 1000 }
            })
        })
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ subdomains: [{ subdomain: 'other-site' }] })
        })

        const result = await checkQuota('new-site', 0)
        expect(result.isNewSite).toBe(true)
      })

      it('should respect options.isUpdate flag', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              canDeploy: true,
              usage: { sitesRemaining: 1, storageUsed: 0 },
              limits: { maxSites: 3, maxStorageBytes: 1000 }
            })
        })
        // Should NOT call subdomains check because isUpdate is true
        const result = await checkQuota('existing', 0, { isUpdate: true })
        expect(result.isNewSite).toBe(false)
        expect(mockFetch).toHaveBeenCalledTimes(1)
      })

      it('should block if site limit reached for NEW site', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              canDeploy: true,
              canCreateNewSite: false,
              usage: { sitesRemaining: 0, storageUsed: 0 },
              limits: { maxSites: 2, maxStorageBytes: 1000 }
            })
        })
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ subdomains: [] })
        })

        const result = await checkQuota('site3', 0)
        expect(result.allowed).toBe(false)
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Site limit reached (2 sites)')
        )
      })

      it('should allow if site limit reached but is an UPDATE', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              canDeploy: true,
              canCreateNewSite: false,
              usage: { sitesRemaining: 0, storageUsed: 0 },
              limits: { maxSites: 2, maxStorageBytes: 1000 }
            })
        })
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ subdomains: [{ subdomain: 'existing' }] })
        })

        const result = await checkQuota('existing', 0)
        expect(result.allowed).toBe(true)
      })

      it('should block if storage limit exceeded', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              canDeploy: true,
              usage: { sitesRemaining: 1, storageUsed: 800 },
              limits: { maxStorageBytes: 1000, maxSites: 3 }
            })
        })
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ subdomains: [] })
        })

        const result = await checkQuota('site', 300) // 800 + 300 = 1100 > 1000
        expect(result.allowed).toBe(false)
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Storage limit exceeded')
        )
      })

      it('should block if explicitly blocked by backend', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              blocked: true,
              upgradeMessage: 'Account suspended'
            })
        })
        const result = await checkQuota('site', 0)
        expect(result.allowed).toBe(false)
        expect(logger.log).toHaveBeenCalledWith('Account suspended')
      })

      it('should log upgradeMessage if provided when blocked', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              blocked: true,
              upgradeMessage: 'Please upgrade your account'
            })
        })
        await checkQuota('site', 0)
        expect(logger.log).toHaveBeenCalledWith('Please upgrade your account')
      })

      it('should not log upgradeMessage if missing when blocked', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ blocked: true })
        })
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ subdomains: [] })
        })
        await checkQuota('site', 0)
        expect(logger.log).not.toHaveBeenCalled()
      })

      it('should use maxStorageMB fallback if maxStorageBytes is missing', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              canDeploy: true,
              usage: { storageUsed: 0, sitesRemaining: 1 },
              limits: { maxStorageMB: 10, maxSites: 3 }
            })
        })
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ subdomains: [] })
        })

        const result = await checkQuota('site', 20 * 1024 * 1024) // 20MB > 10MB
        expect(result.allowed).toBe(false)
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Storage limit exceeded')
        )
      })
    })

    it('should log verbose details using DEBUG env var on fetch failure', async () => {
      vi.stubEnv('DEBUG', 'true')
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Error',
        text: () => Promise.resolve('System crash')
      })

      await checkQuota('site', 0)

      expect(logger.raw).toHaveBeenCalledWith(
        expect.stringContaining('Quota check failed: 500'),
        'error'
      )
      vi.stubEnv('DEBUG', '')
    })

    it('should log verbose details using options.verbose on fetch failure', async () => {
      vi.stubEnv('DEBUG', '')
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve('Access denied')
      })

      await checkQuota('site', 0, { verbose: true })

      expect(logger.raw).toHaveBeenCalledWith(
        expect.stringContaining('Quota check failed: 403'),
        'error'
      )
    })

    it('should return null on authenticated quota fetch error without logging (non-ok response, non-verbose)', async () => {
      vi.stubEnv('DEBUG', '')
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error'
      })

      const result = await checkQuota('site', 0, { verbose: false })

      // checkQuota returns safe default on null
      expect(result.allowed).toBe(true)
      expect(logger.raw).not.toHaveBeenCalled()
    })

    it('should log verbose error details on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error', text: () => Promise.resolve('Error details') })

      await checkQuota('site', 0, { verbose: true })

      expect(logger.raw).toHaveBeenCalledWith(expect.stringContaining('Quota check failed: 500'), 'error')
      expect(logger.raw).toHaveBeenCalledWith(expect.stringContaining('Response: Error details'), 'error')
    })

    it('should log exception details in verbose mode', async () => {
      const error = new Error('Network fail')
      error.cause = new Error('DNS lookup failed')
      mockFetch.mockRejectedValueOnce(error)

      await checkQuota('site', 0, { verbose: true })

      expect(logger.raw).toHaveBeenCalledWith('Quota check error:', 'error')
      expect(logger.raw).toHaveBeenCalledWith(expect.stringContaining('Cause:'), 'error')
      expect(logger.raw).toHaveBeenCalledWith(error.cause, 'error')
    })

    it('should log exception details in verbose mode without cause', async () => {
      const error = new Error('Silent fail')
      mockFetch.mockRejectedValueOnce(error)

      await checkQuota('site', 0, { verbose: true })

      expect(logger.raw).toHaveBeenCalledWith('Quota check error:', 'error')
      expect(logger.raw).not.toHaveBeenCalledWith(expect.stringContaining('Cause:'), 'error')
    })

    it('should check ownership if subdomain provided but isUpdate is falsy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ canDeploy: true, usage: {}, limits: { maxSites: 5 } })
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ subdomains: [{ subdomain: 'other' }] })
      })

      const result = await checkQuota('mysite', 0, { isUpdate: false })
      expect(result.isNewSite).toBe(true)
      // Verify second fetch (ownership check) was called
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should skip ownership check if subdomain is null and isUpdate is false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ canDeploy: true, usage: {}, limits: { maxSites: 5 } })
      })

      const result = await checkQuota(null, 0, { isUpdate: false })
      expect(result.isNewSite).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('Anonymous User', () => {
    beforeEach(() => {
      vi.mocked(credentials.getCredentials).mockResolvedValue({})
    })

    it('should check anonymous quota and hit limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            canDeploy: false,
            canCreateNewSite: false,
            usage: { sitesRemaining: 0, storageUsed: 0 },
            limits: { maxSites: 3, maxStorageBytes: 50000000 }
          })
      })

      const result = await checkQuota('site', 0)
      expect(result.allowed).toBe(false)
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Upgrade to Launchpd Free Tier')
      )
    })

    it('should handle invalid client token', async () => {
      vi.mocked(credentials.getClientToken).mockResolvedValue('bad-token')
      const result = await checkQuota('site', 0)
      expect(result.allowed).toBe(true)
      expect(result.warnings).toContain(
        'Could not verify quota (API unavailable)'
      )
    })



    it('should show upgrade prompt if anonymous storage limit exceeded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          canDeploy: true,
          usage: { sitesRemaining: 1, storageUsed: 9999999 },
          limits: { maxSites: 3, maxStorageBytes: 1000 }
        })
      })

      await checkQuota('site', 500) // 9999999 + 500 > 1000

      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('Upgrade to Launchpd Free Tier'))
    })

    it('should return null on anonymous quota network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'))
      const result = await checkQuota('site', 0)
      // checkQuota returns safe default on null
      expect(result.allowed).toBe(true)
    })
    it('should return null on anonymous quota fetch error (non-ok response)', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
      const result = await checkQuota('site', 0)
      // checkQuota returns safe default on null
      expect(result.allowed).toBe(true)
      expect(result.warnings).toContain(
        'Could not verify quota (API unavailable)'
      )
    })
  })

  describe('Storage Warnings', () => {
    it('should warn when storage usage > 80%', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            canDeploy: true,
            usage: { sitesRemaining: 1, storageUsed: 700 },
            limits: { maxStorageBytes: 1000, maxSites: 3 }
          })
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ subdomains: [] })
      })

      const result = await checkQuota('site', 150) // 850/1000 = 85%
      expect(result.warnings.some((w) => w.includes('85% used'))).toBe(true)
    })

    it('should not duplicate site remaining warning if backend already provided it', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            canDeploy: true,
            warnings: ['You have 1 site(s) remaining'],
            usage: { sitesRemaining: 1, storageUsed: 0 },
            limits: { maxSites: 3, maxStorageBytes: 1000 }
          })
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ subdomains: [] })
      })

      const result = await checkQuota('site', 0)
      const siteWarnings = result.warnings.filter(w => w.includes('site(s) remaining'))
      expect(siteWarnings).toHaveLength(1)
    })
  })

  describe('Ownership Check Edge Cases', () => {
    it('should return false if subdomains fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            canDeploy: true,
            usage: { sitesRemaining: 1, storageUsed: 0 },
            limits: { maxSites: 3, maxStorageBytes: 1000 }
          })
      })
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

      const result = await checkQuota('mysite', 0)
      expect(result.isNewSite).toBe(true) // userOwnsSite returns false on error
    })

    it('should return false if subdomains fetch throws', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            canDeploy: true,
            usage: { sitesRemaining: 1, storageUsed: 0 },
            limits: { maxSites: 3, maxStorageBytes: 1000 }
          })
      })
      mockFetch.mockRejectedValueOnce(new Error('fail'))

      const result = await checkQuota('mysite', 0)
      expect(result.isNewSite).toBe(true)
    })

    it('should log debug info during ownership check', async () => {
      vi.stubEnv('DEBUG', 'true')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ canDeploy: true })
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ subdomains: [{ subdomain: 'other' }] })
      })

      await checkQuota('mysite', 0)

      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('User subdomains:'))
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('Owns site? false'))

      vi.stubEnv('DEBUG', '')
    })
  })


  describe('Helpers', () => {
    it('formatBytes should format correctly', () => {
      expect(formatBytes(0)).toBe('0 B')
      expect(formatBytes(1024)).toBe('1 KB')
      expect(formatBytes(1024 * 1024)).toBe('1 MB')
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB')
    })

    it('displayQuotaWarnings should log multiple warnings', () => {
      displayQuotaWarnings(['Warn A', 'Warn B'])
      expect(logger.warning).toHaveBeenCalledWith('Warn A')
      expect(logger.warning).toHaveBeenCalledWith('Warn B')
    })

    it('displayQuotaWarnings should do nothing if empty', () => {
      displayQuotaWarnings([])
      expect(logger.warning).not.toHaveBeenCalled()
    })
  })
})
