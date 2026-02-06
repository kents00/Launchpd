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

      it('should handle non-ok quota response', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
        const result = await checkQuota('site', 0)
        expect(result.warnings).toContain(
          'Could not verify quota (API unavailable)'
        )
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

      it('should handle anonymous quota error', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false })
        const result = await checkQuota('site', 0)
        expect(result.allowed).toBe(true)
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
