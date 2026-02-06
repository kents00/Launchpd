import { status } from '../src/commands/status.js'
import {
  findProjectRoot,
  getProjectConfig
} from '../src/utils/projectConfig.js'
import { getDeployment } from '../src/utils/api.js'
import { spinner, log, warning, formatSize } from '../src/utils/logger.js'

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
})
