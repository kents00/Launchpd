import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    resolveSubdomain,
    handleSubdomainMismatch,
    checkSubdomainOwnership,
    autoInitProject
} from '../src/commands/deploy-subdomain.js'

// Mock dependencies
vi.mock('../src/utils/api.js', () => ({
    checkSubdomainAvailable: vi.fn(),
    listSubdomains: vi.fn()
}))

vi.mock('../src/utils/projectConfig.js', () => ({
    getProjectConfig: vi.fn(),
    findProjectRoot: vi.fn(),
    updateProjectConfig: vi.fn(),
    initProjectConfig: vi.fn()
}))

vi.mock('../src/utils/id.js', () => ({
    generateSubdomain: vi.fn()
}))

vi.mock('../src/utils/logger.js', () => ({
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    spinner: vi.fn()
}))

vi.mock('../src/utils/prompt.js', () => ({
    prompt: vi.fn()
}))

describe('deploy-subdomain', () => {
    let exitMock

    beforeEach(() => {
        vi.clearAllMocks()
        exitMock = vi.spyOn(process, 'exit').mockImplementation(() => { })
    })

    afterEach(() => {
        exitMock.mockRestore()
    })

    describe('resolveSubdomain', () => {
        it('should warn when anonymous user tries to use custom subdomain', async () => {
            const { warning, info } = await import('../src/utils/logger.js')
            const { getProjectConfig, findProjectRoot } = await import('../src/utils/projectConfig.js')
            const { generateSubdomain } = await import('../src/utils/id.js')

            vi.mocked(findProjectRoot).mockReturnValue('/test')
            vi.mocked(getProjectConfig).mockResolvedValue(null)
            vi.mocked(generateSubdomain).mockReturnValue('random-abc123')

            const result = await resolveSubdomain({
                folderPath: '/test',
                optionName: 'my-site',
                creds: null // Anonymous
            })

            expect(warning).toHaveBeenCalledWith('Custom subdomains require registration!')
            expect(info).toHaveBeenCalledWith('Anonymous deployments use random subdomains.')
            expect(result.subdomain).toBe('random-abc123')
        })

        it('should use custom subdomain when user is authenticated', async () => {
            const { getProjectConfig, findProjectRoot } = await import('../src/utils/projectConfig.js')

            vi.mocked(findProjectRoot).mockReturnValue('/test')
            vi.mocked(getProjectConfig).mockResolvedValue(null)

            const result = await resolveSubdomain({
                folderPath: '/test',
                optionName: 'my-site',
                creds: { email: 'user@example.com' }
            })

            expect(result.subdomain).toBe('my-site')
        })

        it('should use config subdomain when no option provided', async () => {
            const { getProjectConfig, findProjectRoot } = await import('../src/utils/projectConfig.js')
            const { info } = await import('../src/utils/logger.js')

            vi.mocked(findProjectRoot).mockReturnValue('/test')
            vi.mocked(getProjectConfig).mockResolvedValue({ subdomain: 'config-site' })

            const result = await resolveSubdomain({
                folderPath: '/test',
                optionName: null,
                creds: { email: 'user@example.com' }
            })

            expect(result.subdomain).toBe('config-site')
            expect(result.configSubdomain).toBe('config-site')
            expect(info).toHaveBeenCalledWith(expect.stringContaining('Using project subdomain'))
        })

        it('should generate random subdomain when no option and no config', async () => {
            const { getProjectConfig, findProjectRoot } = await import('../src/utils/projectConfig.js')
            const { generateSubdomain } = await import('../src/utils/id.js')

            vi.mocked(findProjectRoot).mockReturnValue('/test')
            vi.mocked(getProjectConfig).mockResolvedValue(null)
            vi.mocked(generateSubdomain).mockReturnValue('random-xyz789')

            const result = await resolveSubdomain({
                folderPath: '/test',
                optionName: null,
                creds: { email: 'user@example.com' }
            })

            expect(result.subdomain).toBe('random-xyz789')
        })

        it('should return project root', async () => {
            const { getProjectConfig, findProjectRoot } = await import('../src/utils/projectConfig.js')

            vi.mocked(findProjectRoot).mockReturnValue('/project/root')
            vi.mocked(getProjectConfig).mockResolvedValue(null)

            const result = await resolveSubdomain({
                folderPath: '/test',
                optionName: 'test-site',
                creds: { email: 'user@example.com' }
            })

            expect(result.projectRoot).toBe('/project/root')
        })

        it('should lowercase the subdomain option', async () => {
            const { getProjectConfig, findProjectRoot } = await import('../src/utils/projectConfig.js')

            vi.mocked(findProjectRoot).mockReturnValue('/test')
            vi.mocked(getProjectConfig).mockResolvedValue(null)

            const result = await resolveSubdomain({
                folderPath: '/test',
                optionName: 'MY-SITE',
                creds: { email: 'user@example.com' }
            })

            expect(result.subdomain).toBe('my-site')
        })
    })

    describe('handleSubdomainMismatch', () => {
        it('should do nothing if subdomain matches config', async () => {
            const { warning } = await import('../src/utils/logger.js')
            const { updateProjectConfig } = await import('../src/utils/projectConfig.js')

            await handleSubdomainMismatch({
                subdomain: 'same-site',
                configSubdomain: 'same-site',
                projectRoot: '/test',
                autoYes: false
            })

            expect(warning).not.toHaveBeenCalled()
            expect(updateProjectConfig).not.toHaveBeenCalled()
        })

        it('should do nothing if no config subdomain', async () => {
            const { warning } = await import('../src/utils/logger.js')
            const { updateProjectConfig } = await import('../src/utils/projectConfig.js')

            await handleSubdomainMismatch({
                subdomain: 'new-site',
                configSubdomain: null,
                projectRoot: '/test',
                autoYes: false
            })

            expect(warning).not.toHaveBeenCalled()
            expect(updateProjectConfig).not.toHaveBeenCalled()
        })

        it('should show warning when subdomain mismatches', async () => {
            const { warning } = await import('../src/utils/logger.js')
            const { prompt } = await import('../src/utils/prompt.js')

            vi.mocked(prompt).mockResolvedValue('n')

            await handleSubdomainMismatch({
                subdomain: 'new-site',
                configSubdomain: 'old-site',
                projectRoot: '/test',
                autoYes: false
            })

            expect(warning).toHaveBeenCalledWith(expect.stringContaining('Mismatch'))
        })

        it('should update config if user confirms (yes)', async () => {
            const { prompt } = await import('../src/utils/prompt.js')
            const { updateProjectConfig } = await import('../src/utils/projectConfig.js')
            const { success } = await import('../src/utils/logger.js')

            vi.mocked(prompt).mockResolvedValue('yes')

            await handleSubdomainMismatch({
                subdomain: 'new-site',
                configSubdomain: 'old-site',
                projectRoot: '/test',
                autoYes: false
            })

            expect(updateProjectConfig).toHaveBeenCalledWith({ subdomain: 'new-site' }, '/test')
            expect(success).toHaveBeenCalledWith(expect.stringContaining('updated'))
        })

        it('should update config if user confirms (y)', async () => {
            const { prompt } = await import('../src/utils/prompt.js')
            const { updateProjectConfig } = await import('../src/utils/projectConfig.js')

            vi.mocked(prompt).mockResolvedValue('y')

            await handleSubdomainMismatch({
                subdomain: 'new-site',
                configSubdomain: 'old-site',
                projectRoot: '/test',
                autoYes: false
            })

            expect(updateProjectConfig).toHaveBeenCalledWith({ subdomain: 'new-site' }, '/test')
        })

        it('should NOT update config if user rejects', async () => {
            const { prompt } = await import('../src/utils/prompt.js')
            const { updateProjectConfig } = await import('../src/utils/projectConfig.js')

            vi.mocked(prompt).mockResolvedValue('n')

            await handleSubdomainMismatch({
                subdomain: 'new-site',
                configSubdomain: 'old-site',
                projectRoot: '/test',
                autoYes: false
            })

            expect(updateProjectConfig).not.toHaveBeenCalled()
        })

        it('should auto-update if autoYes is true', async () => {
            const { prompt } = await import('../src/utils/prompt.js')
            const { updateProjectConfig } = await import('../src/utils/projectConfig.js')

            await handleSubdomainMismatch({
                subdomain: 'new-site',
                configSubdomain: 'old-site',
                projectRoot: '/test',
                autoYes: true
            })

            expect(prompt).not.toHaveBeenCalled()
            expect(updateProjectConfig).toHaveBeenCalledWith({ subdomain: 'new-site' }, '/test')
        })
    })

    describe('checkSubdomainOwnership', () => {
        it('should succeed if subdomain is available', async () => {
            const { checkSubdomainAvailable } = await import('../src/utils/api.js')
            const { spinner } = await import('../src/utils/logger.js')

            const mockSpinner = {
                succeed: vi.fn(),
                fail: vi.fn(),
                warn: vi.fn()
            }
            vi.mocked(spinner).mockReturnValue(mockSpinner)
            vi.mocked(checkSubdomainAvailable).mockResolvedValue(true)

            await checkSubdomainOwnership('new-site')

            expect(mockSpinner.succeed).toHaveBeenCalledWith(expect.stringContaining('is available'))
        })

        it('should succeed if subdomain is owned by user', async () => {
            const { checkSubdomainAvailable, listSubdomains } = await import('../src/utils/api.js')
            const { spinner } = await import('../src/utils/logger.js')

            const mockSpinner = {
                succeed: vi.fn(),
                fail: vi.fn(),
                warn: vi.fn()
            }
            vi.mocked(spinner).mockReturnValue(mockSpinner)
            vi.mocked(checkSubdomainAvailable).mockResolvedValue(false)
            vi.mocked(listSubdomains).mockResolvedValue({
                subdomains: [{ subdomain: 'my-site' }]
            })

            await checkSubdomainOwnership('my-site')

            expect(mockSpinner.succeed).toHaveBeenCalledWith(expect.stringContaining('Deploying new version'))
        })

        it('should exit if subdomain is taken by another user', async () => {
            const { checkSubdomainAvailable, listSubdomains } = await import('../src/utils/api.js')
            const { spinner, warning } = await import('../src/utils/logger.js')

            const mockSpinner = {
                succeed: vi.fn(),
                fail: vi.fn(),
                warn: vi.fn()
            }
            vi.mocked(spinner).mockReturnValue(mockSpinner)
            vi.mocked(checkSubdomainAvailable).mockResolvedValue(false)
            vi.mocked(listSubdomains).mockResolvedValue({
                subdomains: [{ subdomain: 'other-site' }]
            })

            await checkSubdomainOwnership('my-site')

            expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining('already taken'))
            expect(warning).toHaveBeenCalledWith(expect.stringContaining('do not own'))
            expect(exitMock).toHaveBeenCalledWith(1)
        })

        it('should warn on error but not crash', async () => {
            const { checkSubdomainAvailable } = await import('../src/utils/api.js')
            const { spinner } = await import('../src/utils/logger.js')

            const mockSpinner = {
                succeed: vi.fn(),
                fail: vi.fn(),
                warn: vi.fn()
            }
            vi.mocked(spinner).mockReturnValue(mockSpinner)
            vi.mocked(checkSubdomainAvailable).mockRejectedValue(new Error('Network error'))

            await checkSubdomainOwnership('my-site')

            expect(mockSpinner.warn).toHaveBeenCalledWith(expect.stringContaining('Could not verify'))
            expect(exitMock).not.toHaveBeenCalled()
        })
    })

    describe('autoInitProject', () => {
        it('should do nothing if no option name', async () => {
            const { prompt } = await import('../src/utils/prompt.js')
            const { initProjectConfig } = await import('../src/utils/projectConfig.js')

            await autoInitProject({
                optionName: null,
                configSubdomain: null,
                folderPath: '/test',
                subdomain: 'random-abc'
            })

            expect(prompt).not.toHaveBeenCalled()
            expect(initProjectConfig).not.toHaveBeenCalled()
        })

        it('should do nothing if config subdomain already exists', async () => {
            const { prompt } = await import('../src/utils/prompt.js')
            const { initProjectConfig } = await import('../src/utils/projectConfig.js')

            await autoInitProject({
                optionName: 'my-site',
                configSubdomain: 'my-site',
                folderPath: '/test',
                subdomain: 'my-site'
            })

            expect(prompt).not.toHaveBeenCalled()
            expect(initProjectConfig).not.toHaveBeenCalled()
        })

        it('should prompt and init if user confirms with "y"', async () => {
            const { prompt } = await import('../src/utils/prompt.js')
            const { initProjectConfig } = await import('../src/utils/projectConfig.js')
            const { success } = await import('../src/utils/logger.js')

            vi.mocked(prompt).mockResolvedValue('y')

            await autoInitProject({
                optionName: 'my-site',
                configSubdomain: null,
                folderPath: '/test',
                subdomain: 'my-site'
            })

            expect(prompt).toHaveBeenCalledWith(expect.stringContaining('launchpd init'))
            expect(initProjectConfig).toHaveBeenCalledWith('my-site', '/test')
            expect(success).toHaveBeenCalledWith(expect.stringContaining('initialized'))
        })

        it('should prompt and init if user confirms with "yes"', async () => {
            const { prompt } = await import('../src/utils/prompt.js')
            const { initProjectConfig } = await import('../src/utils/projectConfig.js')

            vi.mocked(prompt).mockResolvedValue('yes')

            await autoInitProject({
                optionName: 'my-site',
                configSubdomain: null,
                folderPath: '/test',
                subdomain: 'my-site'
            })

            expect(initProjectConfig).toHaveBeenCalledWith('my-site', '/test')
        })

        it('should prompt and init if user presses enter (empty)', async () => {
            const { prompt } = await import('../src/utils/prompt.js')
            const { initProjectConfig } = await import('../src/utils/projectConfig.js')

            vi.mocked(prompt).mockResolvedValue('')

            await autoInitProject({
                optionName: 'my-site',
                configSubdomain: null,
                folderPath: '/test',
                subdomain: 'my-site'
            })

            expect(initProjectConfig).toHaveBeenCalledWith('my-site', '/test')
        })

        it('should NOT init if user rejects', async () => {
            const { prompt } = await import('../src/utils/prompt.js')
            const { initProjectConfig } = await import('../src/utils/projectConfig.js')

            vi.mocked(prompt).mockResolvedValue('n')

            await autoInitProject({
                optionName: 'my-site',
                configSubdomain: null,
                folderPath: '/test',
                subdomain: 'my-site'
            })

            expect(initProjectConfig).not.toHaveBeenCalled()
        })
    })
})
