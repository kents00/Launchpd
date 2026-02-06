import { rollback } from '../src/commands/rollback.js'
import {
  getVersionsForSubdomain,
  setActiveVersion
} from '../src/utils/metadata.js'
import { getVersions, rollbackVersion } from '../src/utils/api.js'
import {
  spinner,
  error,
  errorWithSuggestions,
  warning,
  info,
  log,
  success
} from '../src/utils/logger.js'

vi.mock('../src/utils/metadata.js')
vi.mock('../src/utils/api.js')
vi.mock('../src/utils/logger.js')

describe('rollback command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    spinner.mockReturnValue({
      succeed: vi.fn(),
      warn: vi.fn(),
      fail: vi.fn(),
      info: vi.fn()
    })
    // Process exit mock
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process.exit')
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should fail if no deployments found', async () => {
    getVersions.mockResolvedValue({}) // No versions from API
    getVersionsForSubdomain.mockResolvedValue([])

    await expect(rollback('test', {})).rejects.toThrow('Process.exit')
    expect(errorWithSuggestions).toHaveBeenCalledWith(
      expect.stringContaining('No deployments found'),
      expect.any(Array),
      expect.any(Object)
    )
  })

  it('should fail if only one version exists', async () => {
    getVersions.mockResolvedValue({
      versions: [{ version: 1 }],
      activeVersion: 1
    })

    await expect(rollback('test', {})).rejects.toThrow('Process.exit')
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('Nothing to rollback to')
    )
  })

  it('should rollback to previous version by default', async () => {
    getVersions.mockResolvedValue({
      versions: [
        { version: 1, created_at: 'date' },
        { version: 2, created_at: 'date' }
      ],
      activeVersion: 2
    })
    rollbackVersion.mockResolvedValue(true)

    await rollback('test', {})

    expect(rollbackVersion).toHaveBeenCalledWith('test', 1)
    expect(spinner().succeed).toHaveBeenCalledWith(
      expect.stringContaining('Rolled back to')
    )
  })

  it('should rollback to specified version', async () => {
    getVersions.mockResolvedValue({
      versions: [
        { version: 1, created_at: 'date' },
        { version: 2, created_at: 'date' },
        { version: 3, created_at: 'date' }
      ],
      activeVersion: 3
    })
    rollbackVersion.mockResolvedValue(true)

    await rollback('test', { to: 1 })

    expect(rollbackVersion).toHaveBeenCalledWith('test', 1)
  })

  it('should fall back to local metadata rollback if API fails', async () => {
    getVersions.mockResolvedValue({
      versions: [
        { version: 1, created_at: 'date' },
        { version: 2, created_at: 'date' }
      ],
      activeVersion: 2
    })
    rollbackVersion.mockResolvedValue(false) // API fail

    await rollback('test', {})

    expect(setActiveVersion).toHaveBeenCalledWith('test', 1)
  })

  it('should fail if specifying a non-existent version', async () => {
    getVersions.mockResolvedValue({
      versions: [
        { version: 1, created_at: 'date' },
        { version: 2, created_at: 'date' }
      ],
      activeVersion: 2
    })

    await expect(rollback('test', { to: 99 })).rejects.toThrow('Process.exit')
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Version 99 does not exist'))
    expect(info).toHaveBeenCalledWith('Available versions:')
  })

  it('should list versions without messages correctly', async () => {
    getVersions.mockResolvedValue({
      versions: [
        { version: 1, created_at: 'date', message: null },
        { version: 2, created_at: 'date', message: 'Has message' }
      ],
      activeVersion: 2
    })

    await expect(rollback('test', { to: 99 })).rejects.toThrow('Process.exit')
    // Verification of the missing message branch (line 91)
    expect(log).toHaveBeenCalledWith(expect.not.stringContaining('- ""'))
  })

  it('should use default active version 1 if not provided by API', async () => {
    getVersions.mockResolvedValue({
      versions: [
        { version: 1, created_at: 'date' },
        { version: 2, created_at: 'date' }
      ]
      // activeVersion missing
    })
    rollbackVersion.mockResolvedValue(true)

    // Rollback from default (1) should fail if it's the oldest
    await expect(rollback('test', {})).rejects.toThrow('Process.exit')
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('Already at the oldest version'))
  })

  it('should fail if already at the oldest version', async () => {
    getVersions.mockResolvedValue({
      versions: [
        { version: 1, created_at: 'date' },
        { version: 2, created_at: 'date' }
      ],
      activeVersion: 1
    })

    await expect(rollback('test', {})).rejects.toThrow('Process.exit')
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('Already at the oldest version'))
  })

  it('should exit early if target version is already active', async () => {
    vi.mocked(process.exit).mockImplementation((code) => {
      if (code === 0) return
      throw new Error('Process.exit')
    })

    getVersions.mockResolvedValue({
      versions: [
        { version: 1, created_at: 'date' },
        { version: 2, created_at: 'date' }
      ],
      activeVersion: 2
    })

    await rollback('test', { to: 2 })
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('already active'))
    expect(process.exit).toHaveBeenCalledWith(0)
  })

  it('should fall back to local metadata if API returns nothing', async () => {
    getVersions.mockResolvedValue(null)
    getVersionsForSubdomain.mockResolvedValue([
      { version: 1, timestamp: 'date' },
      { version: 2, timestamp: 'date' }
    ])
    const { getActiveVersion } = await import('../src/utils/metadata.js')
    vi.mocked(getActiveVersion).mockResolvedValue(2)

    await rollback('test', {})

    expect(getVersionsForSubdomain).toHaveBeenCalledWith('test')
    expect(setActiveVersion).toHaveBeenCalledWith('test', 1)
  })

  it('should log version message if present', async () => {
    getVersions.mockResolvedValue({
      versions: [
        { version: 1, created_at: 'date', message: 'First deploy' },
        { version: 2, created_at: 'date' }
      ],
      activeVersion: 2
    })
    rollbackVersion.mockResolvedValue(true)

    await rollback('test', {})

    expect(info).toHaveBeenCalledWith(expect.stringContaining('Version message: "First deploy"'))
  })

  it('should handle missing timestamp in restoration log', async () => {
    getVersions.mockResolvedValue({
      versions: [
        { version: 1, created_at: null },
        { version: 2, created_at: 'date' }
      ],
      activeVersion: 2
    })
    rollbackVersion.mockResolvedValue(true)

    await rollback('test', {})

    expect(info).toHaveBeenCalledWith(expect.stringContaining('Restored deployment from: unknown'))
  })
})

