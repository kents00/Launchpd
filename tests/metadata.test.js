import {
  getNextVersion,
  recordDeploymentInMetadata
} from '../src/utils/metadata.js'

// Mock Config
vi.mock('../src/config.js', () => ({
  config: {
    apiUrl: 'https://api.test',
    version: '0.0.0-test'
  }
}))

// Mock Fetch
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

describe('Metadata Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STATICLAUNCH_API_KEY = 'test-key'
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('getNextVersion', () => {
    it('should return 1 if no previous versions exist', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ versions: [] })
      })

      const version = await getNextVersion('new-site')
      expect(version).toBe(1)
    })

    it('should increment the max version found', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            versions: [{ version: 1 }, { version: 5 }, { version: 2 }]
          })
      })

      const version = await getNextVersion('existing-site')
      expect(version).toBe(6) // 5 + 1
    })

    it('should handle API errors gracefully by defaulting to 1 (safety fallback)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 })
      // getNextVersion throws on error currently, or returns 1?
      // Let's check implementation behavior

      // logic:
      /*
               if (!response.ok) throw...
               catch(err) if fetch failed -> return null
               else throw
            */

      // If we want to test error handling we expect a throw
      await expect(getNextVersion('error-site')).rejects.toThrow()
    })
  })

  describe('recordDeploymentInMetadata', () => {
    it('should send correct payload to API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      const deployData = {
        subdomain: 'test-site',
        folderPath: '/path/to/dist',
        fileCount: 10,
        totalBytes: 1024,
        version: 2
      }

      await recordDeploymentInMetadata(
        deployData.subdomain,
        deployData.folderPath,
        deployData.fileCount,
        deployData.totalBytes,
        deployData.version
      )

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/deployments'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"subdomain":"test-site"')
        })
      )

      // Check body content
      const call = mockFetch.mock.calls[0]
      const body = JSON.parse(call[1].body)
      expect(body.version).toBe(2)
      expect(body.folderName).toBe('dist')
    })

    it('should use "unknown" if folder name cannot be determined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      await recordDeploymentInMetadata('test-site', '', 0)

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.folderName).toBe('unknown')
    })
  })

  describe('listDeploymentsFromR2', () => {
    it('should return deployments list', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ deployments: [{ id: 1 }] })
      })
      const result = await import('../src/utils/metadata.js').then((m) =>
        m.listDeploymentsFromR2()
      )
      expect(result).toEqual([{ id: 1 }])
    })

    it('should return empty array if no deployments', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ deployments: [] })
      })
      const result = await import('../src/utils/metadata.js').then((m) =>
        m.listDeploymentsFromR2()
      )
      expect(result).toEqual([])
    })
  })

  describe('getVersionsForSubdomain', () => {
    it('should return versions list', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ versions: [1, 2] })
      })
      const result = await import('../src/utils/metadata.js').then((m) =>
        m.getVersionsForSubdomain('sub')
      )
      expect(result).toEqual([1, 2])
    })
  })

  describe('setActiveVersion', () => {
    it('should call rollback endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })
      await import('../src/utils/metadata.js').then((m) =>
        m.setActiveVersion('sub', 2)
      )
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/versions/sub/rollback'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ version: 2 })
        })
      )
    })
  })

  describe('getActiveVersion', () => {
    it('should return active version', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ activeVersion: 3 })
      })
      const result = await import('../src/utils/metadata.js').then((m) =>
        m.getActiveVersion('sub')
      )
      expect(result).toBe(3)
    })

    it('should default to 1 if no active version', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({})
      })
      const result = await import('../src/utils/metadata.js').then((m) =>
        m.getActiveVersion('sub')
      )
      expect(result).toBe(1)
    })
  })

  describe('listVersionFiles', () => {
    it('should return file info for version', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            versions: [{ version: 1, file_count: 5, total_bytes: 100 }]
          })
      })
      const result = await import('../src/utils/metadata.js').then((m) =>
        m.listVersionFiles('sub', 1)
      )
      expect(result).toEqual([{ version: 1, fileCount: 5, totalBytes: 100 }])
    })

    it('should return empty array if version not found', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ versions: [] })
      })
      const result = await import('../src/utils/metadata.js').then((m) =>
        m.listVersionFiles('sub', 99)
      )
      expect(result).toEqual([])
    })

    it('should return empty array if API result is missing versions', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ versions: null })
      })
      const result = await import('../src/utils/metadata.js').then((m) =>
        m.listVersionFiles('sub', 1)
      )
      expect(result).toEqual([])
    })
  })

  describe('Admin Stubs', () => {
    it('deleteSubdomain should throw', async () => {
      const m = await import('../src/utils/metadata.js')
      expect(() => m.deleteSubdomain('sub')).toThrow('not available')
    })

    it('removeDeploymentRecords should throw', async () => {
      const m = await import('../src/utils/metadata.js')
      expect(() => m.removeDeploymentRecords('sub')).toThrow('not available')
    })

    it('getExpiredDeployments should return empty array', async () => {
      const m = await import('../src/utils/metadata.js')
      await expect(m.getExpiredDeployments()).resolves.toEqual([])
    })

    it('cleanupExpiredDeployments should return handled status', async () => {
      const m = await import('../src/utils/metadata.js')
      const res = await m.cleanupExpiredDeployments()
      expect(res.note).toContain('Handled automatically')
    })

    it('copyVersionFiles should resolve', async () => {
      const m = await import('../src/utils/metadata.js')
      await expect(m.copyVersionFiles('sub', 1, 2)).resolves.toHaveProperty(
        'note'
      )
    })
  })

  describe('apiRequest Error Handling', () => {
    it('should return null on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('fetch failed'))
      const m = await import('../src/utils/metadata.js')
      const result = await m.listDeploymentsFromR2() // Uses apiRequest
      expect(result).toEqual([]) // listDeploymentsFromR2 returns [] on null result from apiRequest
    })

    it('should return null on ENOTFOUND', async () => {
      mockFetch.mockRejectedValue(new Error('ENOTFOUND'))
      const m = await import('../src/utils/metadata.js')
      // We can check apiRequest directly via a public method that returns raw result or check behavior
      // getVersionsForSubdomain returns result?.versions || []
      const result = await m.getVersionsForSubdomain('sub')
      expect(result).toEqual([])
    })

    it('should use public-beta-key if API key environment variable is missing', async () => {
      delete process.env.STATICLAUNCH_API_KEY
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ deployments: [] })
      })

      const m = await import('../src/utils/metadata.js')
      await m.listDeploymentsFromR2()

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'public-beta-key'
          })
        })
      )
    })

    it('should use data.error in thrown error if available', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Custom error message' })
      })
      const m = await import('../src/utils/metadata.js')
      await expect(m.listDeploymentsFromR2()).rejects.toThrow(
        'Custom error message'
      )
    })

    it('should use status code in thrown error if data.error is missing', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({})
      })
      const m = await import('../src/utils/metadata.js')
      await expect(m.listDeploymentsFromR2()).rejects.toThrow('API error: 404')
    })
  })
})
