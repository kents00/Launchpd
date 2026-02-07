import {
  apiRequest,
  getNextVersionFromAPI,
  recordDeployment,
  listDeployments,
  getDeployment,
  getVersions,
  rollbackVersion,
  checkSubdomainAvailable,
  reserveSubdomain,
  unreserveSubdomain,
  listSubdomains,
  getCurrentUser,
  healthCheck,
  resendVerification,
  regenerateApiKey
} from '../src/utils/api.js'
import { config } from '../src/config.js'
import * as credentials from '../src/utils/credentials.js'
import * as machineId from '../src/utils/machineId.js'
import { createHmac } from 'node:crypto'

// Mock dependencies
vi.mock('../src/config.js', () => ({
  config: {
    apiUrl: 'https://api.test',
    version: '1.0.0'
  }
}))

vi.mock('../src/utils/credentials.js', () => ({
  getApiKey: vi.fn(),
  getApiSecret: vi.fn()
}))

vi.mock('../src/utils/machineId.js', () => ({
  getMachineId: vi.fn().mockReturnValue('mock-machine-id')
}))

vi.mock('../src/utils/endpoint.js', () => ({
  validateEndpoint: vi.fn()
}))

vi.mock('node:crypto', () => ({
  createHmac: vi.fn().mockReturnValue({
    update: vi.fn(),
    digest: vi.fn().mockReturnValue('mock-signature')
  })
}))

describe('api.js', () => {
  // Mock global fetch
  const mockFetch = vi.fn()
  globalThis.fetch = mockFetch

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  describe('apiRequest', () => {
    it('should make a successful request with correct headers', async () => {
      vi.mocked(credentials.getApiKey).mockResolvedValue('test-key')
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      const result = await apiRequest('/test')

      expect(result).toEqual({ success: true })
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-API-Key': 'test-key',
            'X-Device-Fingerprint': 'mock-machine-id'
          })
        })
      )
    })

    it('should sign request if apiSecret is present', async () => {
      vi.mocked(credentials.getApiKey).mockResolvedValue('test-key')
      vi.mocked(credentials.getApiSecret).mockResolvedValue('test-secret')
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      await apiRequest('/test', { method: 'POST', body: 'data' })

      expect(createHmac).toHaveBeenCalledWith('sha256', 'test-secret')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Signature': 'mock-signature'
          })
        })
      )
    })

    it('should handle 503 MaintenanceError', async () => {
      mockFetch.mockResolvedValue({
        status: 503,
        json: () =>
          Promise.resolve({
            maintenance_mode: true,
            message: 'Down for upgrades'
          })
      })

      await expect(apiRequest('/test')).rejects.toThrow('Down for upgrades')
    })

    it('should use default maintenance message if not provided by API', async () => {
      mockFetch.mockResolvedValue({
        status: 503,
        json: () => Promise.resolve({ maintenance_mode: true })
      })
      await expect(apiRequest('/test')).rejects.toThrow(
        'LaunchPd is under maintenance'
      )
    })

    it('should handle 503 Service Unavailable without maintenance_mode flag', async () => {
      mockFetch.mockResolvedValue({
        status: 503,
        json: () =>
          Promise.resolve({
            message: 'Server overloaded'
          })
      })

      await expect(apiRequest('/test')).rejects.toThrow('Server overloaded')
    })

    it('should use default 503 message if not provided by API', async () => {
      mockFetch.mockResolvedValue({
        status: 503,
        json: () => Promise.resolve({})
      })
      await expect(apiRequest('/test')).rejects.toThrow('Service unavailable')
    })

    it('should handle 401 AuthError', async () => {
      mockFetch.mockResolvedValue({
        status: 401,
        json: () => Promise.resolve({ message: 'Bad token' })
      })
      await expect(apiRequest('/test')).rejects.toThrow('Bad token')
    })

    it('should use default 401 message if not provided by API', async () => {
      mockFetch.mockResolvedValue({
        status: 401,
        json: () => Promise.resolve({})
      })
      await expect(apiRequest('/test')).rejects.toThrow(
        'Authentication failed'
      )
    })

    it('should handle 401 TwoFactorRequiredError', async () => {
      mockFetch.mockResolvedValue({
        status: 401,
        json: () =>
          Promise.resolve({
            requires_2fa: true,
            two_factor_type: 'email',
            message: '2FA needed'
          })
      })
      await expect(apiRequest('/test')).rejects.toThrow('2FA needed')
    })

    it('should handle 429 RateLimit', async () => {
      mockFetch.mockResolvedValue({
        status: 429,
        json: () => Promise.resolve({ message: 'Too many requests' })
      })
      await expect(apiRequest('/test')).rejects.toThrow('Too many requests')
    })

    it('should use default 429 message if not provided by API', async () => {
      mockFetch.mockResolvedValue({
        status: 429,
        json: () => Promise.resolve({})
      })
      await expect(apiRequest('/test')).rejects.toThrow('Rate limit exceeded')
    })

    it('should handle non-ok generic errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server exploded' })
      })
      await expect(apiRequest('/test')).rejects.toThrow('Server exploded')
    })

    it('should use status code in message if both error and message are missing from API body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({})
      })
      await expect(apiRequest('/test')).rejects.toThrow('API error: 500')
    })

    it('should wrap fetch errors in NetworkError', async () => {
      mockFetch.mockRejectedValue(new Error('fetch failed'))
      await expect(apiRequest('/test')).rejects.toThrow(
        'Unable to connect to LaunchPd servers'
      )
    })

    it('should re-throw generic errors that are not network or API errors', async () => {
      mockFetch.mockRejectedValue(new Error('Internal Logic Error'))
      await expect(apiRequest('/test')).rejects.toThrow('Internal Logic Error')
    })
  })

  describe('Helper Functions', () => {
    beforeEach(() => {
      vi.mocked(credentials.getApiKey).mockResolvedValue('key')
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({})
      })
    })

    it('getNextVersionFromAPI should return max + 1', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ versions: [{ version: 1 }, { version: 5 }] })
      })
      const v = await getNextVersionFromAPI('sub')
      expect(v).toBe(6)
    })

    it('getNextVersionFromAPI should return 1 if empty', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ versions: [] })
      })
      const v = await getNextVersionFromAPI('sub')
      expect(v).toBe(1)
    })

    it('recordDeployment should POST correct data', async () => {
      await recordDeployment({
        subdomain: 'sub',
        folderName: 'dist',
        fileCount: 5,
        totalBytes: 100,
        version: 2
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/deployments'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"subdomain":"sub"')
        })
      )
    })

    it('wrapper functions should call correct endpoints', async () => {
      await listDeployments(10, 5)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10&offset=5'),
        expect.anything()
      )

      await getDeployment('sub')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/deployments/sub'),
        expect.anything()
      )

      await getVersions('sub')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/versions/sub'),
        expect.anything()
      )

      await rollbackVersion('sub', 1)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/rollback'),
        expect.objectContaining({ method: 'PUT' })
      )

      await checkSubdomainAvailable('sub')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/check/sub'),
        expect.anything()
      )

      await reserveSubdomain('sub')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/reserve'),
        expect.objectContaining({ method: 'POST' })
      )

      await unreserveSubdomain('sub')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/reserve-subdomain/sub'),
        expect.objectContaining({ method: 'DELETE' })
      )

      await listSubdomains()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/subdomains'),
        expect.anything()
      )

      await getCurrentUser()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/me'),
        expect.anything()
      )

      await healthCheck()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/health'),
        expect.anything()
      )

      await resendVerification()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/resend-verification'),
        expect.objectContaining({ method: 'POST' })
      )

      await regenerateApiKey()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api-key/regenerate'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })
})
