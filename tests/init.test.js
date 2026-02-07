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

  it('should handle re-link if already in project root (confirmed with "y")', async () => {
    projectConfig.findProjectRoot.mockReturnValue('/root')
    projectConfig.getProjectConfig.mockResolvedValue({ subdomain: 'old' })
    prompt.prompt.mockResolvedValueOnce('y')
    prompt.prompt.mockResolvedValueOnce('new-site')

    await init({})

    expect(projectConfig.saveProjectConfig).toHaveBeenCalledWith(
      expect.objectContaining({ subdomain: 'new-site' }),
      '/root'
    )
  })

  it('should handle re-link if already in project root (confirmed with "yes")', async () => {
    projectConfig.findProjectRoot.mockReturnValue('/root')
    projectConfig.getProjectConfig.mockResolvedValue({ subdomain: 'old' })
    prompt.prompt.mockResolvedValueOnce('yes')
    prompt.prompt.mockResolvedValueOnce('new-site')

    await init({})

    expect(projectConfig.saveProjectConfig).toHaveBeenCalled()
  })

  it('should cancel init if user rejects re-link prompt', async () => {
    projectConfig.findProjectRoot.mockReturnValue('/root')
    projectConfig.getProjectConfig.mockResolvedValue({ subdomain: 'old' })
    prompt.prompt.mockResolvedValue('n')

    await init({})

    expect(credentials.isLoggedIn).not.toHaveBeenCalled()
  })

  it('should handle re-link for already owned subdomain', async () => {
    projectConfig.findProjectRoot.mockReturnValue('/root')
    projectConfig.getProjectConfig.mockResolvedValue({ subdomain: 'old' })
    prompt.prompt.mockResolvedValueOnce('y')
    prompt.prompt.mockResolvedValueOnce('match')

    api.checkSubdomainAvailable.mockResolvedValue(false)
    api.listSubdomains.mockResolvedValue({
      subdomains: [{ subdomain: 'match' }]
    })

    await init({})

    expect(projectConfig.saveProjectConfig).toHaveBeenCalled()
  })

  it('should handle reservation failure (returns false)', async () => {
    api.reserveSubdomain.mockResolvedValue(false)
    await init({ name: 'fail-site' })
    expect(projectConfig.initProjectConfig).not.toHaveBeenCalled()
  })

  it('should handle reservation failure (returns null)', async () => {
    api.reserveSubdomain.mockResolvedValue(null)
    await init({ name: 'null-site' })
    expect(projectConfig.initProjectConfig).not.toHaveBeenCalled()
  })

  it('should handle reservation success (returns truthy object)', async () => {
    api.reserveSubdomain.mockResolvedValue({ success: true })
    await init({ name: 'object-site' })
    expect(projectConfig.initProjectConfig).toHaveBeenCalled()
  })

  it('should handle listSubdomains variations (fallback to empty)', async () => {
    api.checkSubdomainAvailable.mockResolvedValue(false)
    api.listSubdomains.mockResolvedValue(null)
    await init({ name: 'taken' })
    expect(logger.spinner().fail).toHaveBeenCalled()

    api.listSubdomains.mockResolvedValue({})
    await init({ name: 'taken' })
    expect(logger.spinner().fail).toHaveBeenCalled()
  })

  it('should handle general errors', async () => {
    api.checkSubdomainAvailable.mockRejectedValue(new Error('API Fail'))
    await init({ name: 'error-site' })
    expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
      'API Fail',
      expect.any(Array)
    )
  })

  it('should handle reservation failure when re-linking an existing project', async () => {
    projectConfig.findProjectRoot.mockReturnValue('/root')
    projectConfig.getProjectConfig.mockResolvedValue({ subdomain: 'old' })
    prompt.prompt.mockResolvedValueOnce('y')
    prompt.prompt.mockResolvedValueOnce('new-site')

    api.reserveSubdomain.mockResolvedValue(false)

    await init({})

    expect(projectConfig.saveProjectConfig).not.toHaveBeenCalled()
  })
})
