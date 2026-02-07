import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleDeploymentError } from '../src/commands/deploy-errors.js'

// Mock dependencies
vi.mock('../src/utils/api.js', () => ({
    MaintenanceError: class MaintenanceError extends Error {
        constructor(message) {
            super(message)
            this.name = 'MaintenanceError'
            this.isMaintenanceError = true
        }
    },
    NetworkError: class NetworkError extends Error {
        constructor(message) {
            super(message)
            this.name = 'NetworkError'
            this.isNetworkError = true
        }
    },
    AuthError: class AuthError extends Error {
        constructor(message) {
            super(message)
            this.name = 'AuthError'
            this.isAuthError = true
        }
    }
}))

vi.mock('../src/utils/logger.js', () => ({
    errorWithSuggestions: vi.fn()
}))

vi.mock('../src/commands/deploy-helpers.js', () => ({
    getDeploymentErrorSuggestions: vi.fn()
}))

describe('deploy-errors', () => {
    let exitMock

    beforeEach(() => {
        vi.clearAllMocks()
        exitMock = vi.spyOn(process, 'exit').mockImplementation(() => { })
    })

    afterEach(() => {
        exitMock.mockRestore()
    })

    describe('handleDeploymentError', () => {
        it('should handle errors through handleCommonError first', async () => {
            const { errorWithSuggestions } = await import('../src/utils/logger.js')
            const mockError = new Error('Common error')
            const mockHandleCommonError = vi.fn().mockReturnValue(true)
            const mockInfo = vi.fn()
            const mockWarning = vi.fn()

            handleDeploymentError(mockError, false, mockHandleCommonError, mockInfo, mockWarning)

            expect(mockHandleCommonError).toHaveBeenCalledWith(mockError, {
                error: expect.any(Function),
                info: mockInfo,
                warning: mockWarning
            })
            expect(exitMock).toHaveBeenCalledWith(1)
        })

        it('should handle MaintenanceError', async () => {
            const { MaintenanceError } = await import('../src/utils/api.js')
            const { errorWithSuggestions } = await import('../src/utils/logger.js')
            const error = new MaintenanceError('Service down')
            const mockHandleCommonError = vi.fn().mockReturnValue(false)

            handleDeploymentError(error, false, mockHandleCommonError, vi.fn(), vi.fn())

            expect(errorWithSuggestions).toHaveBeenCalledWith(
                expect.stringContaining('under maintenance'),
                expect.arrayContaining([
                    expect.stringContaining('try again in a few minutes'),
                    expect.stringContaining('status.launchpd.cloud')
                ]),
                expect.any(Object)
            )
            expect(exitMock).toHaveBeenCalledWith(1)
        })

        it('should handle errors with isMaintenanceError flag', async () => {
            const { errorWithSuggestions } = await import('../src/utils/logger.js')
            const error = new Error('Maintenance')
            error.isMaintenanceError = true
            const mockHandleCommonError = vi.fn().mockReturnValue(false)

            handleDeploymentError(error, false, mockHandleCommonError, vi.fn(), vi.fn())

            expect(errorWithSuggestions).toHaveBeenCalledWith(
                expect.stringContaining('under maintenance'),
                expect.anything(),
                expect.any(Object)
            )
            expect(exitMock).toHaveBeenCalledWith(1)
        })

        it('should handle NetworkError', async () => {
            const { NetworkError } = await import('../src/utils/api.js')
            const { errorWithSuggestions } = await import('../src/utils/logger.js')
            const error = new NetworkError('Connection failed')
            const mockHandleCommonError = vi.fn().mockReturnValue(false)

            handleDeploymentError(error, false, mockHandleCommonError, vi.fn(), vi.fn())

            expect(errorWithSuggestions).toHaveBeenCalledWith(
                expect.stringContaining('Unable to connect'),
                expect.arrayContaining([
                    expect.stringContaining('internet connection'),
                    expect.stringContaining('temporarily unavailable'),
                    expect.stringContaining('status.launchpd.cloud')
                ]),
                expect.objectContaining({ verbose: false, cause: error })
            )
            expect(exitMock).toHaveBeenCalledWith(1)
        })

        it('should handle errors with isNetworkError flag', async () => {
            const { errorWithSuggestions } = await import('../src/utils/logger.js')
            const error = new Error('Network failure')
            error.isNetworkError = true
            const mockHandleCommonError = vi.fn().mockReturnValue(false)

            handleDeploymentError(error, false, mockHandleCommonError, vi.fn(), vi.fn())

            expect(errorWithSuggestions).toHaveBeenCalledWith(
                expect.stringContaining('Unable to connect'),
                expect.anything(),
                expect.any(Object)
            )
            expect(exitMock).toHaveBeenCalledWith(1)
        })

        it('should handle AuthError', async () => {
            const { AuthError } = await import('../src/utils/api.js')
            const { errorWithSuggestions } = await import('../src/utils/logger.js')
            const error = new AuthError('Unauthorized')
            const mockHandleCommonError = vi.fn().mockReturnValue(false)

            handleDeploymentError(error, false, mockHandleCommonError, vi.fn(), vi.fn())

            expect(errorWithSuggestions).toHaveBeenCalledWith(
                expect.stringContaining('Authentication failed'),
                expect.arrayContaining([
                    expect.stringContaining('launchpd login'),
                    expect.stringContaining('API key may have expired')
                ]),
                expect.objectContaining({ verbose: false, cause: error })
            )
            expect(exitMock).toHaveBeenCalledWith(1)
        })

        it('should handle errors with isAuthError flag', async () => {
            const { errorWithSuggestions } = await import('../src/utils/logger.js')
            const error = new Error('Auth failure')
            error.isAuthError = true
            const mockHandleCommonError = vi.fn().mockReturnValue(false)

            handleDeploymentError(error, false, mockHandleCommonError, vi.fn(), vi.fn())

            expect(errorWithSuggestions).toHaveBeenCalledWith(
                expect.stringContaining('Authentication failed'),
                expect.anything(),
                expect.any(Object)
            )
            expect(exitMock).toHaveBeenCalledWith(1)
        })

        it('should handle generic errors with suggestions', async () => {
            const { errorWithSuggestions } = await import('../src/utils/logger.js')
            const { getDeploymentErrorSuggestions } = await import('../src/commands/deploy-helpers.js')
            const error = new Error('Unknown error')
            const mockHandleCommonError = vi.fn().mockReturnValue(false)
            const mockSuggestions = ['Suggestion 1', 'Suggestion 2']

            vi.mocked(getDeploymentErrorSuggestions).mockReturnValue(mockSuggestions)

            handleDeploymentError(error, false, mockHandleCommonError, vi.fn(), vi.fn())

            expect(getDeploymentErrorSuggestions).toHaveBeenCalledWith(error)
            expect(errorWithSuggestions).toHaveBeenCalledWith(
                'Upload failed: Unknown error',
                mockSuggestions,
                expect.objectContaining({ verbose: false, cause: error })
            )
            expect(exitMock).toHaveBeenCalledWith(1)
        })

        it('should pass verbose flag to error handlers', async () => {
            const { errorWithSuggestions } = await import('../src/utils/logger.js')
            const { getDeploymentErrorSuggestions } = await import('../src/commands/deploy-helpers.js')
            const error = new Error('Test error')
            const mockHandleCommonError = vi.fn().mockReturnValue(false)

            vi.mocked(getDeploymentErrorSuggestions).mockReturnValue(['Suggestion'])

            handleDeploymentError(error, true, mockHandleCommonError, vi.fn(), vi.fn())

            expect(errorWithSuggestions).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Array),
                expect.objectContaining({ verbose: true })
            )
        })

        it('should call errorWithSuggestions through handleCommonError callback', async () => {
            const { errorWithSuggestions } = await import('../src/utils/logger.js')
            const error = new Error('Common error')
            const mockHandleCommonError = vi.fn((err, callbacks) => {
                callbacks.error('Handled error message')
                return true
            })

            handleDeploymentError(error, false, mockHandleCommonError, vi.fn(), vi.fn())

            expect(errorWithSuggestions).toHaveBeenCalledWith(
                'Handled error message',
                [],
                expect.objectContaining({ verbose: false })
            )
            expect(exitMock).toHaveBeenCalledWith(1)
        })

        it('should handle all error types in order', async () => {
            const { MaintenanceError, NetworkError, AuthError } = await import('../src/utils/api.js')
            const { errorWithSuggestions } = await import('../src/utils/logger.js')
            const mockHandleCommonError = vi.fn().mockReturnValue(false)

            // Test maintenance error takes precedence
            const maintenanceError = new MaintenanceError('Down')
            maintenanceError.isNetworkError = true // Also has network flag

            handleDeploymentError(maintenanceError, false, mockHandleCommonError, vi.fn(), vi.fn())

            expect(errorWithSuggestions).toHaveBeenCalledWith(
                expect.stringContaining('maintenance'),
                expect.anything(),
                expect.anything()
            )
        })
    })
})
