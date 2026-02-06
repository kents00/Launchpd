import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

// Import after mocking
import {
  getCredentials,
  saveCredentials,
  clearCredentials,
  isLoggedIn,
  getApiKey,
  getClientToken,
  getApiSecret
} from '../src/utils/credentials.js'

// Mock the fs modules
vi.mock('node:fs')
vi.mock('node:fs/promises')
vi.mock('node:os')
vi.mock('node:crypto', () => ({
  randomBytes: vi.fn(() => ({ toString: () => 'abc123def456' }))
}))

describe('credentials utils', () => {
  const mockHomedir = '/home/testuser'
  const mockConfigDir = '/home/testuser/.staticlaunch'
  const mockCredentialsPath = '/home/testuser/.staticlaunch/credentials.json'

  beforeEach(() => {
    vi.resetAllMocks()
    homedir.mockReturnValue(mockHomedir)
  })

  describe('getCredentials', () => {
    it('returns null when credentials file does not exist', async () => {
      existsSync.mockReturnValue(false)
      const result = await getCredentials()
      expect(result).toBeNull()
    })

    it('returns credentials when file exists and is valid', async () => {
      existsSync.mockReturnValue(true)
      readFile.mockResolvedValue(
        JSON.stringify({
          apiKey: 'test-key',
          userId: 'user-123',
          email: 'test@example.com',
          tier: 'pro'
        })
      )

      const result = await getCredentials()
      expect(result).toEqual({
        apiKey: 'test-key',
        apiSecret: null,
        userId: 'user-123',
        email: 'test@example.com',
        tier: 'pro',
        savedAt: null
      })
    })

    it('returns null when JSON is invalid', async () => {
      existsSync.mockReturnValue(true)
      readFile.mockResolvedValue('invalid json')

      const result = await getCredentials()
      expect(result).toBeNull()
    })
  })

  describe('saveCredentials', () => {
    it('creates config directory and saves credentials', async () => {
      existsSync.mockReturnValue(false)
      mkdir.mockResolvedValue(undefined)
      writeFile.mockResolvedValue(undefined)

      await saveCredentials({
        apiKey: 'new-key',
        userId: 'user-456',
        email: 'new@example.com',
        tier: 'free'
      })

      // Check mkdir was called with correct arguments (path-agnostic)
      expect(mkdir).toHaveBeenCalledWith(
        expect.stringContaining('.staticlaunch'),
        { recursive: true }
      )
      expect(writeFile).toHaveBeenCalled()
    })
  })

  describe('clearCredentials', () => {
    it('deletes credentials file when it exists', async () => {
      existsSync.mockReturnValue(true)
      unlink.mockResolvedValue(undefined)

      await clearCredentials()
      expect(unlink).toHaveBeenCalledWith(
        expect.stringContaining('credentials.json')
      )
    })
  })

  describe('isLoggedIn', () => {
    it('returns true when credentials exist', async () => {
      existsSync.mockReturnValue(true)
      readFile.mockResolvedValue(JSON.stringify({ apiKey: 'test-key' }))

      const result = await isLoggedIn()
      expect(result).toBe(true)
    })

    it('returns false when no credentials', async () => {
      existsSync.mockReturnValue(false)

      const result = await isLoggedIn()
      expect(result).toBe(false)
    })
  })

  describe('getApiKey', () => {
    it('returns stored API key when available', async () => {
      existsSync.mockReturnValue(true)
      readFile.mockResolvedValue(JSON.stringify({ apiKey: 'stored-key' }))

      const result = await getApiKey()
      expect(result).toBe('stored-key')
    })

    it('falls back to public beta key when no credentials', async () => {
      existsSync.mockReturnValue(false)

      const result = await getApiKey()
      expect(result).toBe('public-beta-key')
    })
  })

  describe('getApiSecret', () => {
    it('returns secret from env var if present', async () => {
      process.env.STATICLAUNCH_API_SECRET = 'env-secret'
      const { getApiSecret } = await import('../src/utils/credentials.js')
      const result = await getApiSecret()
      expect(result).toBe('env-secret')
      delete process.env.STATICLAUNCH_API_SECRET
    })

    it('returns secret from file if env missing', async () => {
      // We need to re-import or rely on logic.
      // Since we use global mocks, we can use the imported function if module state isn't cached weirdly.
      // But process.env is global.
      existsSync.mockReturnValue(true)
      readFile.mockResolvedValue(
        JSON.stringify({ apiKey: 'key', apiSecret: 'file-secret' })
      )

      const result = await getApiSecret()
      expect(result).toBe('file-secret')
    })
  })

  describe('getClientToken', () => {
    it('generates and saves token if not exists', async () => {
      existsSync.mockReturnValue(false)

      const token = await getClientToken()

      expect(token).toBeDefined()
      expect(token).toContain('cli_')
      expect(writeFile).toHaveBeenCalled()
    })

    it('returns existing token from file', async () => {
      existsSync.mockReturnValue(true)
      // mockReturnValueOnce is safer if multiple calls check existence
      // getClientToken checks dir existence then file existence.
      // ensureConfigDir checks dir.
      // getClientTokenPath checks file.
      // So existsSync called twice.
      // First call (dir): false -> mkdir
      // Second call (file): true -> readFile

      existsSync.mockReturnValue(true)
      readFile.mockResolvedValue('existing-token')

      const token = await getClientToken()

      expect(token).toBe('existing-token')
    })
  })
})
