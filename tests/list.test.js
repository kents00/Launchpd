import { list } from '../src/commands/list.js'
import * as localConfig from '../src/utils/localConfig.js'
import * as api from '../src/utils/api.js'
import * as logger from '../src/utils/logger.js'

vi.mock('../src/utils/localConfig.js')
vi.mock('../src/utils/api.js')
vi.mock('../src/utils/logger.js')

describe('list command', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    logger.spinner.mockReturnValue({
      succeed: vi.fn(),
      warn: vi.fn(),
      fail: vi.fn()
    })
    logger.formatSize.mockImplementation((bytes) => `${bytes} B`)

    vi.spyOn(process, 'exit').mockImplementation(() => { })
  })

  const mockDeployments = [
    {
      subdomain: 'test-site',
      folder_name: 'dist',
      file_count: 5,
      total_bytes: 1024,
      version: 2,
      created_at: new Date().toISOString(),
      active_version: 2,
      message: 'update'
    },
    {
      subdomain: 'test-site',
      folder_name: 'dist',
      file_count: 5,
      total_bytes: 1024,
      version: 1,
      created_at: new Date().toISOString(),
      active_version: 2,
      message: 'init'
    }
  ]

  it('should list deployments from API', async () => {
    api.listDeployments.mockResolvedValue({ deployments: mockDeployments })

    await list({})

    expect(api.listDeployments).toHaveBeenCalled()
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('v2'))
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('active'))
  })

  it('should fallback to local deployments if API unavailable (or empty)', async () => {
    api.listDeployments.mockResolvedValue(null)
    localConfig.getLocalDeployments.mockResolvedValue([
      {
        subdomain: 'local-test',
        version: 1,
        timestamp: new Date().toISOString(),
        isActive: true
      }
    ])

    await list({})

    expect(localConfig.getLocalDeployments).toHaveBeenCalled()
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('local-test')
    )
  })

  it('should use local deployments if --local flag is set', async () => {
    localConfig.getLocalDeployments.mockResolvedValue([])

    await list({ local: true })

    expect(localConfig.getLocalDeployments).toHaveBeenCalled()
  })

  it('should handle no deployments found', async () => {
    api.listDeployments.mockResolvedValue({ deployments: [] })
    localConfig.getLocalDeployments.mockResolvedValue([])

    await list({})

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('launchpd deploy')
    )
  })

  it('should output JSON if requested', async () => {
    api.listDeployments.mockResolvedValue({ deployments: mockDeployments })

    await list({ json: true })

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('"version": 2')
    )
  })
})
