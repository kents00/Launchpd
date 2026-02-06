import { rollback } from '../src/commands/rollback.js'
import {
  getVersionsForSubdomain,
  setActiveVersion
} from '../src/utils/metadata.js'
import { getVersions, rollbackVersion } from '../src/utils/api.js'
import {
  spinner,
  errorWithSuggestions,
  warning,
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
})
