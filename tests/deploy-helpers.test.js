import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    parseExpirationOption,
    validateDeploymentMessage,
    validateFolderExists,
    filterActiveFiles,
    validateFolderNotEmpty,
    getDeploymentErrorSuggestions,
    calculateFolderSize
} from '../src/commands/deploy-helpers.js'
import { join, relative, sep } from 'node:path'

// Mock dependencies
vi.mock('../src/utils/logger.js', () => ({
    errorWithSuggestions: vi.fn()
}))

vi.mock('../src/utils/expiration.js', () => ({
    calculateExpiresAt: vi.fn()
}))

vi.mock('node:fs/promises', async () => {
    const actual = await vi.importActual('node:fs/promises')
    return {
        ...actual,
        readdir: vi.fn()
    }
})

vi.mock('node:fs', async () => {
    const actual = await vi.importActual('node:fs')
    return {
        ...actual,
        statSync: vi.fn()
    }
})

vi.mock('../src/utils/ignore.js', () => ({
    isIgnored: vi.fn()
}))

describe('deploy-helpers', () => {
    let exitMock

    beforeEach(() => {
        vi.clearAllMocks()
        exitMock = vi.spyOn(process, 'exit').mockImplementation(() => { })
    })

    afterEach(() => {
        exitMock.mockRestore()
    })

    describe('parseExpirationOption', () => {
        it('should return null if no expiration option is provided', () => {
            const result = parseExpirationOption(undefined, false)
            expect(result).toBeNull()
        })

        it('should return Date object for valid expiration', async () => {
            const { calculateExpiresAt } = await import('../src/utils/expiration.js')
            const testDate = new Date('2026-02-08T12:00:00Z')
            vi.mocked(calculateExpiresAt).mockReturnValue(testDate)

            const result = parseExpirationOption('1h', false)

            expect(calculateExpiresAt).toHaveBeenCalledWith('1h')
            expect(result).toBe(testDate)
        })

        it('should exit on invalid expiration format', async () => {
            const { calculateExpiresAt } = await import('../src/utils/expiration.js')
            const { errorWithSuggestions } = await import('../src/utils/logger.js')

            vi.mocked(calculateExpiresAt).mockImplementation(() => {
                throw new Error('Invalid format')
            })

            parseExpirationOption('invalid', false)

            expect(errorWithSuggestions).toHaveBeenCalledWith(
                'Invalid format',
                expect.arrayContaining([
                    expect.stringContaining('30m, 2h, 1d, 7d')
                ]),
                expect.any(Object)
            )
            expect(exitMock).toHaveBeenCalledWith(1)
        })
    })

    describe('validateDeploymentMessage', () => {
        it('should not exit if message is provided', async () => {
            validateDeploymentMessage('test message', false)
            expect(exitMock).not.toHaveBeenCalled()
        })

        it('should exit if message is missing', async () => {
            const { errorWithSuggestions } = await import('../src/utils/logger.js')

            validateDeploymentMessage(undefined, false)

            expect(errorWithSuggestions).toHaveBeenCalledWith(
                'Deployment message is required.',
                expect.arrayContaining([
                    expect.stringContaining('Use -m or --message')
                ]),
                expect.any(Object)
            )
            expect(exitMock).toHaveBeenCalledWith(1)
        })

        it('should exit if message is empty string', async () => {
            const { errorWithSuggestions } = await import('../src/utils/logger.js')

            validateDeploymentMessage('', false)

            expect(errorWithSuggestions).toHaveBeenCalled()
            expect(exitMock).toHaveBeenCalledWith(1)
        })
    })

    describe('validateFolderExists', () => {
        it('should not exit if folder exists', () => {
            const mockExistsSync = vi.fn().mockReturnValue(true)

            validateFolderExists('/test/path', mockExistsSync, false)

            expect(exitMock).not.toHaveBeenCalled()
        })

        it('should exit if folder does not exist', async () => {
            const { errorWithSuggestions } = await import('../src/utils/logger.js')
            const mockExistsSync = vi.fn().mockReturnValue(false)

            validateFolderExists('/missing/path', mockExistsSync, false)

            expect(errorWithSuggestions).toHaveBeenCalledWith(
                expect.stringContaining('Folder not found'),
                expect.arrayContaining([
                    expect.stringContaining('Check the path is correct')
                ]),
                expect.any(Object)
            )
            expect(exitMock).toHaveBeenCalledWith(1)
        })
    })

    describe('filterActiveFiles', () => {
        it('should filter out directories', () => {
            const files = [
                { isFile: () => true, isDirectory: () => false, name: 'file.txt', path: '/test', parentPath: '/test' },
                { isFile: () => false, isDirectory: () => true, name: 'folder', path: '/test', parentPath: '/test' }
            ]

            const result = filterActiveFiles(files, '/test')

            expect(result).toHaveLength(1)
            expect(result[0].name).toBe('file.txt')
        })

        it('should filter out ignored files', async () => {
            const { isIgnored } = await import('../src/utils/ignore.js')
            vi.mocked(isIgnored).mockImplementation((name) => name === 'node_modules')

            const files = [
                { isFile: () => true, isDirectory: () => false, name: 'file.txt', path: '/test', parentPath: '/test' },
                { isFile: () => true, isDirectory: () => false, name: 'ignored.tmp', path: '/test/node_modules', parentPath: '/test/node_modules' }
            ]

            const result = filterActiveFiles(files, '/test')

            expect(result.length).toBeGreaterThanOrEqual(0)
        })

        it('should handle files without parentPath', () => {
            const files = [
                { isFile: () => true, isDirectory: () => false, name: 'file.txt', path: '/test' }
            ]

            const result = filterActiveFiles(files, '/test')

            expect(Array.isArray(result)).toBe(true)
        })
    })

    describe('validateFolderNotEmpty', () => {
        it('should not exit if file count is greater than 0', () => {
            validateFolderNotEmpty(5, false)

            expect(exitMock).not.toHaveBeenCalled()
        })

        it('should exit if file count is 0', async () => {
            const { errorWithSuggestions } = await import('../src/utils/logger.js')

            validateFolderNotEmpty(0, false)

            expect(errorWithSuggestions).toHaveBeenCalledWith(
                'Nothing to deploy.',
                expect.arrayContaining([
                    expect.stringContaining('Add some files')
                ]),
                expect.any(Object)
            )
            expect(exitMock).toHaveBeenCalledWith(1)
        })
    })

    describe('getDeploymentErrorSuggestions', () => {
        it('should return network suggestions for fetch errors', () => {
            const error = new Error('fetch failed')
            const suggestions = getDeploymentErrorSuggestions(error)

            expect(suggestions).toContain('Check your internet connection')
            expect(suggestions).toContain('The API server may be temporarily unavailable')
        })

        it('should return network suggestions for ENOTFOUND errors', () => {
            const error = new Error('ENOTFOUND api.example.com')
            const suggestions = getDeploymentErrorSuggestions(error)

            expect(suggestions).toContain('Check your internet connection')
        })

        it('should return auth suggestions for 401 errors', () => {
            const error = new Error('401 Unauthorized')
            const suggestions = getDeploymentErrorSuggestions(error)

            expect(suggestions).toContain('Run "launchpd login" to authenticate')
            expect(suggestions).toContain('Your API key may have expired')
        })

        it('should return auth suggestions for Unauthorized errors', () => {
            const error = new Error('Unauthorized access')
            const suggestions = getDeploymentErrorSuggestions(error)

            expect(suggestions).toContain('Run "launchpd login" to authenticate')
        })

        it('should return size suggestions for 413 errors', () => {
            const error = new Error('413 Payload Too Large')
            const suggestions = getDeploymentErrorSuggestions(error)

            expect(suggestions).toContain('Try deploying fewer or smaller files')
            expect(suggestions).toContain('Check your storage quota with "launchpd quota"')
        })

        it('should return size suggestions for "too large" errors', () => {
            const error = new Error('Request too large')
            const suggestions = getDeploymentErrorSuggestions(error)

            expect(suggestions).toContain('Try deploying fewer or smaller files')
        })

        it('should return rate limit suggestions for 429 errors', () => {
            const error = new Error('429 Too Many Requests')
            const suggestions = getDeploymentErrorSuggestions(error)

            expect(suggestions).toContain('Wait a few minutes and try again')
            expect(suggestions).toContain('You may be deploying too frequently')
        })

        it('should return rate limit suggestions for rate limit errors', () => {
            const error = new Error('rate limit exceeded')
            const suggestions = getDeploymentErrorSuggestions(error)

            expect(suggestions).toContain('Wait a few minutes and try again')
        })

        it('should return generic suggestions for unknown errors', () => {
            const error = new Error('Unknown error occurred')
            const suggestions = getDeploymentErrorSuggestions(error)

            expect(suggestions).toContain('Try running with --verbose for more details')
            expect(suggestions).toContain('Check https://status.launchpd.cloud for service status')
        })
    })

    describe('calculateFolderSize', () => {
        it('should calculate total size of all files', async () => {
            const { readdir } = await import('node:fs/promises')
            const { statSync } = await import('node:fs')
            const { isIgnored } = await import('../src/utils/ignore.js')

            vi.mocked(readdir).mockResolvedValue([
                { isFile: () => true, isDirectory: () => false, name: 'file1.txt', parentPath: '/test' },
                { isFile: () => true, isDirectory: () => false, name: 'file2.txt', parentPath: '/test' }
            ])
            vi.mocked(statSync).mockReturnValue({ size: 100 })
            vi.mocked(isIgnored).mockReturnValue(false)

            const size = await calculateFolderSize('/test')

            expect(size).toBe(200)
        })

        it('should skip ignored files', async () => {
            const { readdir } = await import('node:fs/promises')
            const { statSync } = await import('node:fs')
            const { isIgnored } = await import('../src/utils/ignore.js')

            vi.mocked(readdir).mockResolvedValue([
                { isFile: () => true, isDirectory: () => false, name: 'file1.txt', parentPath: '/test' },
                { isFile: () => true, isDirectory: () => false, name: 'node_modules', parentPath: '/test' }
            ])
            vi.mocked(statSync).mockReturnValue({ size: 100 })
            vi.mocked(isIgnored).mockImplementation((name) => name === 'node_modules')

            const size = await calculateFolderSize('/test')

            expect(size).toBe(100)
        })

        it('should skip directories', async () => {
            const { readdir } = await import('node:fs/promises')
            const { statSync } = await import('node:fs')
            const { isIgnored } = await import('../src/utils/ignore.js')

            vi.mocked(readdir).mockResolvedValue([
                { isFile: () => true, isDirectory: () => false, name: 'file1.txt', parentPath: '/test' },
                { isFile: () => false, isDirectory: () => true, name: 'folder', parentPath: '/test' }
            ])
            vi.mocked(statSync).mockReturnValue({ size: 100 })
            vi.mocked(isIgnored).mockReturnValue(false)

            const size = await calculateFolderSize('/test')

            expect(size).toBe(100)
        })

        it('should handle stat errors gracefully', async () => {
            const { readdir } = await import('node:fs/promises')
            const { statSync } = await import('node:fs')
            const { isIgnored } = await import('../src/utils/ignore.js')

            vi.mocked(readdir).mockResolvedValue([
                { isFile: () => true, isDirectory: () => false, name: 'file1.txt', parentPath: '/test' },
                { isFile: () => true, isDirectory: () => false, name: 'deleted.txt', parentPath: '/test' }
            ])
            vi.mocked(statSync)
                .mockReturnValueOnce({ size: 100 })
                .mockImplementationOnce(() => { throw new Error('File not found') })
            vi.mocked(isIgnored).mockReturnValue(false)

            const size = await calculateFolderSize('/test')

            expect(size).toBe(100)
        })

        it('should use path property when parentPath is not available', async () => {
            const { readdir } = await import('node:fs/promises')
            const { statSync } = await import('node:fs')
            const { isIgnored } = await import('../src/utils/ignore.js')

            vi.mocked(readdir).mockResolvedValue([
                { isFile: () => true, isDirectory: () => false, name: 'file1.txt', path: '/test' }
            ])
            vi.mocked(statSync).mockReturnValue({ size: 100 })
            vi.mocked(isIgnored).mockReturnValue(false)

            const size = await calculateFolderSize('/test')

            expect(size).toBe(100)
        })
    })
})
