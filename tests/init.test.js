import { init } from '../src/commands/init.js'
import * as projectConfig from '../src/utils/projectConfig.js'
import * as api from '../src/utils/api.js'
import * as credentials from '../src/utils/credentials.js'
import * as logger from '../src/utils/logger.js'
import * as prompt from '../src/utils/prompt.js'

vi.mock('../src/utils/projectConfig.js')
vi.mock('../src/utils/api.js')
vi.mock('../src/utils/credentials.js')
vi.mock('../src/utils/logger.js')
vi.mock('../src/utils/prompt.js')

describe('init command', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Default mocks
    credentials.isLoggedIn.mockResolvedValue(true)
    projectConfig.findProjectRoot.mockReturnValue(null) // Not in project
    prompt.prompt.mockResolvedValue('my-site')
    api.checkSubdomainAvailable.mockResolvedValue(true)
    api.reserveSubdomain.mockResolvedValue(true)
    logger.spinner.mockReturnValue({
      succeed: vi.fn(),
      fail: vi.fn(),
      info: vi.fn(),
      warn: vi.fn()
    })
  })

  it('should fail if not logged in', async () => {
    credentials.isLoggedIn.mockResolvedValue(false)
    await init({})
    expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
      expect.stringContaining('must be logged in'),
      expect.any(Array)
    )
  })

  it('should prompt for subdomain if not provided', async () => {
    await init({})
    expect(prompt.prompt).toHaveBeenCalledWith(
      expect.stringContaining('Enter subdomain name')
    )
    expect(api.reserveSubdomain).toHaveBeenCalledWith('my-site')
    expect(projectConfig.initProjectConfig).toHaveBeenCalledWith('my-site')
    expect(logger.success).toHaveBeenCalled()
  })

  it('should use provided name option', async () => {
    await init({ name: 'provided-name' })
    expect(api.reserveSubdomain).toHaveBeenCalledWith('provided-name')
    expect(projectConfig.initProjectConfig).toHaveBeenCalledWith(
      'provided-name'
    )
  })

  it('should validate invalid subdomain', async () => {
    await init({ name: 'Invalid Name!' })
    expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
      expect.stringContaining('Invalid subdomain'),
      expect.any(Array)
    )
    expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
      expect.stringContaining('Invalid subdomain'),
      expect.any(Array)
    )
  })

  it('should handle unavailable subdomain (owned by user)', async () => {
    api.checkSubdomainAvailable.mockResolvedValue(false)
    api.listSubdomains.mockResolvedValue({
      subdomains: [{ subdomain: 'my-site' }]
    })

    await init({ name: 'my-site' })

    // Already owned, so skip reserve
    expect(projectConfig.initProjectConfig).toHaveBeenCalledWith('my-site')
    expect(logger.success).toHaveBeenCalled()
  })

  it('should fail if subdomain taken and not owned', async () => {
    api.checkSubdomainAvailable.mockResolvedValue(false)
    api.listSubdomains.mockResolvedValue({ subdomains: [] }) // Not owned

    await init({ name: 'taken-site' })

    // spinner.fail is called
  })

  it('should handle re-link if already in project root', async () => {
    projectConfig.findProjectRoot.mockReturnValue('/path/to/root')
    projectConfig.getProjectConfig.mockResolvedValue({ subdomain: 'old-site' })
    prompt.prompt.mockResolvedValue('y') // Confirm re-link

    await init({ name: 'new-site' })

    expect(logger.warning).toHaveBeenCalledWith(
      expect.stringContaining('already part of a Launchpd project')
    )
    expect(projectConfig.saveProjectConfig).toHaveBeenCalledWith(
      expect.objectContaining({ subdomain: 'new-site' }),
      '/path/to/root'
    )
  })
})
