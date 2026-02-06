import { versions } from '../src/commands/versions.js'
import * as metadata from '../src/utils/metadata.js'
import * as api from '../src/utils/api.js'
import * as credentials from '../src/utils/credentials.js'
import * as logger from '../src/utils/logger.js'

vi.mock('../src/utils/metadata.js')
vi.mock('../src/utils/api.js')
vi.mock('../src/utils/credentials.js')
vi.mock('../src/utils/logger.js')

describe('versions command', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(logger.spinner).mockReturnValue({
      succeed: vi.fn(),
      fail: vi.fn(),
      start: vi.fn()
    })
    vi.mocked(logger.formatSize).mockReturnValue('1.00 KB')
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`Process.exit(${code})`)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should list versions from API', async () => {
    vi.mocked(credentials.isLoggedIn).mockResolvedValue(true)
    vi.mocked(api.getVersions).mockResolvedValue({
      versions: [
        {
          version: 2,
          created_at: new Date().toISOString(),
          file_count: 5,
          total_bytes: 1024,
          message: 'v2'
        },
        {
          version: 1,
          created_at: new Date().toISOString(),
          file_count: 5,
          total_bytes: 1024,
          message: 'v1'
        }
      ],
      activeVersion: 2
    })

    await versions('test-site', {})

    expect(logger.success).toHaveBeenCalledWith(
      expect.stringContaining('Versions for test-site')
    )
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('v2'))
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('active'))
  })

  it('should fail if not logged in', async () => {
    vi.mocked(credentials.isLoggedIn).mockResolvedValue(false)

    await expect(versions('test-site', {})).rejects.toThrow('Process.exit(1)')
    expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
      expect.stringContaining('only available for authenticated'),
      expect.anything(),
      expect.anything()
    )
  })

  it('should fallback to metadata if API returns null', async () => {
    vi.mocked(credentials.isLoggedIn).mockResolvedValue(true)
    vi.mocked(api.getVersions).mockResolvedValue(null)
    vi.mocked(metadata.getVersionsForSubdomain).mockResolvedValue([
      {
        version: 1,
        timestamp: new Date().toISOString(),
        fileCount: 1,
        totalBytes: 100
      }
    ])
    vi.mocked(metadata.getActiveVersion).mockResolvedValue(1)

    await versions('test-site', {})

    expect(metadata.getVersionsForSubdomain).toHaveBeenCalled()
    expect(logger.success).toHaveBeenCalled()
  })

  it('should handle no deployments found', async () => {
    vi.mocked(credentials.isLoggedIn).mockResolvedValue(true)
    vi.mocked(api.getVersions).mockResolvedValue({ versions: [] })

    await expect(versions('test-site', {})).rejects.toThrow('Process.exit(1)')
    expect(logger.spinner().fail).toHaveBeenCalledWith(
      expect.stringContaining('No deployments found')
    )
  })

  it('should warn about --to usage', async () => {
    vi.mocked(credentials.isLoggedIn).mockResolvedValue(true)
    vi.mocked(api.getVersions).mockResolvedValue({ versions: [] })

    try {
      await versions('test-site', { to: 1 })
    } catch { }

    expect(logger.warning).toHaveBeenCalledWith(
      expect.stringContaining('--to option is for the rollback')
    )
  })
  it('should output versions as JSON when --json option is provided', async () => {
    vi.mocked(credentials.isLoggedIn).mockResolvedValue(true)
    vi.mocked(api.getVersions).mockResolvedValue({
      versions: [
        {
          version: 1,
          created_at: '2023-01-01T00:00:00.000Z',
          file_count: 5,
          total_bytes: 1024,
          message: 'initial'
        }
      ],
      activeVersion: 1
    })

    await versions('test-site', { json: true })

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('"subdomain": "test-site"')
    )
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('"activeVersion": 1')
    )
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('"isActive": true')
    )
  })

  it('should handle alternative property names and missing message in API response', async () => {
    vi.mocked(credentials.isLoggedIn).mockResolvedValue(true)
    vi.mocked(api.getVersions).mockResolvedValue({
      versions: [
        {
          version: 1,
          timestamp: '2023-01-01T00:00:00.000Z',
          fileCount: 3,
          totalBytes: 512
          // message missing
        }
      ],
      activeVersion: 1
    })

    await versions('test-site', { json: true })

    const call = vi.mocked(logger.log).mock.calls.find(c => c[0].includes('{'))
    const data = JSON.parse(call[0])
    expect(data.versions[0].timestamp).toBe('2023-01-01T00:00:00.000Z')
    expect(data.versions[0].fileCount).toBe(3)
    expect(data.versions[0].totalBytes).toBe(512)
    expect(data.versions[0].message).toBe('')
  })

  it('should display "unknown" for size if totalBytes is zero or missing', async () => {
    vi.mocked(credentials.isLoggedIn).mockResolvedValue(true)
    vi.mocked(api.getVersions).mockResolvedValue({
      versions: [
        {
          version: 1,
          created_at: '2023-01-01T00:00:00.000Z',
          file_count: 5,
          total_bytes: 0
        }
      ],
      activeVersion: 1
    })

    await versions('test-site', {})

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('unknown')
    )
  })
})
