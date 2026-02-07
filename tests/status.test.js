import { status } from '../src/commands/status.js'
import {
  findProjectRoot,
  getProjectConfig
} from '../src/utils/projectConfig.js'
import { getDeployment } from '../src/utils/api.js'
import {
  spinner,
  log,
  warning,
  formatSize,
  errorWithSuggestions
} from '../src/utils/logger.js'

vi.mock('../src/utils/projectConfig.js')
vi.mock('../src/utils/api.js')
vi.mock('../src/utils/logger.js')

describe('status command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    spinner.mockReturnValue({
      stop: vi.fn(),
      fail: vi.fn()
    })
    formatSize.mockImplementation((bytes) => `${bytes} B`)
    // Lint fix: removed empty arrow function block
    vi.spyOn(process, 'exit').mockImplementation(() => {
      /* noop */
    })
  })

  it('should warn if not a Launchpd project', async () => {
    findProjectRoot.mockReturnValue(null)
    await status({})
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('Not a Launchpd project')
    )
  })

  it('should handle invalid project configuration (missing subdomain)', async () => {
    findProjectRoot.mockReturnValue('/root')
    getProjectConfig.mockResolvedValue({})
    await status({})
    expect(errorWithSuggestions).toHaveBeenCalledWith(
      'Invalid project configuration.',
      expect.anything()
    )
  })

  it('should fetch and verify deployment status', async () => {
    findProjectRoot.mockReturnValue('/root')
    getProjectConfig.mockResolvedValue({
      subdomain: 'test-site'
    })

    getDeployment.mockResolvedValue({
      activeVersion: 1,
      versions: [
        {
          version: 1,
          created_at: '2023-01-01',
          file_count: 5,
          total_bytes: 1024,
          message: 'init'
        }
      ]
    })

    await status({})

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('test-site.launchpd.cloud')
    )
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Active Version'))
  })

  it('should handle no deployments', async () => {
    findProjectRoot.mockReturnValue('/root')
    getProjectConfig.mockResolvedValue({
      subdomain: 'test-site'
    })
    getDeployment.mockResolvedValue({ versions: [] })

    await status({})

    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('No deployments found')
    )
  })

  it('should handle API errors gracefully', async () => {
    findProjectRoot.mockReturnValue('/root')
    getProjectConfig.mockResolvedValue({
      subdomain: 'test-site'
    })
    getDeployment.mockRejectedValue(new Error('API Error'))

    await status({})

    expect(spinner().fail).toHaveBeenCalled()
    // Should not crash
  })

  it('should display expiration information if set', async () => {
    findProjectRoot.mockReturnValue('/root')
    getProjectConfig.mockResolvedValue({ subdomain: 'test-site' })

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)

    getDeployment.mockResolvedValue({
      activeVersion: 1,
      versions: [
        {
          version: 1,
          created_at: new Date().toISOString(),
          file_count: 5,
          total_bytes: 1024,
          expires_at: futureDate.toISOString()
        }
      ]
    })

    await status({})

    expect(log).toHaveBeenCalledWith(expect.stringContaining('Expires:'))
  })

  it('should display "expired" in red if deployment has expired', async () => {
    findProjectRoot.mockReturnValue('/root')
    getProjectConfig.mockResolvedValue({ subdomain: 'test-site' })

    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 1)

    getDeployment.mockResolvedValue({
      activeVersion: 1,
      versions: [
        {
          version: 1,
          created_at: new Date().toISOString(),
          file_count: 5,
          total_bytes: 1024,
          expires_at: pastDate.toISOString()
        }
      ]
    })

    await status({})

    expect(log).toHaveBeenCalledWith(expect.stringContaining('expired'))
  })

  it('should use first version if activeVersion is not found in versions list', async () => {
    findProjectRoot.mockReturnValue('/root')
    getProjectConfig.mockResolvedValue({ subdomain: 'test-site' })

    getDeployment.mockResolvedValue({
      activeVersion: 99, // Non-existent
      versions: [
        {
          version: 1,
          created_at: new Date().toISOString(),
          file_count: 5,
          total_bytes: 1024
        }
      ]
    })

    await status({})

    expect(log).toHaveBeenCalledWith(expect.stringContaining('v1'))
  })

  it('should handle camelCase property names in deployment info', async () => {
    findProjectRoot.mockReturnValue('/root')
    getProjectConfig.mockResolvedValue({ subdomain: 'test-site' })

    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + 7)

    getDeployment.mockResolvedValue({
      activeVersion: 1,
      versions: [
        {
          version: 1,
          timestamp: new Date().toISOString(), // camelCase
          fileCount: 10, // camelCase
          totalBytes: 2048, // camelCase
          expiresAt: expiryDate.toISOString() // camelCase
        }
      ]
    })

    await status({})

    expect(log).toHaveBeenCalledWith(expect.stringContaining('10'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('2048 B'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Expires:'))
  })
})
