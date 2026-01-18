
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { login } from '../src/commands/auth.js';
import * as credentials from '../src/utils/credentials.js';
import * as logger from '../src/utils/logger.js';
import { createInterface } from 'node:readline';

// Mocks
vi.mock('node:readline');
vi.mock('../src/utils/credentials.js');
vi.mock('../src/utils/logger.js');

// Mock config to avoid loading real config which might depend on files
vi.mock('../src/config.js', () => ({
    config: {
        domain: 'example.com'
    }
}));

describe('login command', () => {
    let mockConsoleLog;
    let mockConsoleError;
    let mockExit;

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock console
        mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => { });
        mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => { });
        mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });

        // Helper for prompting
        const mockQuestion = vi.fn();
        createInterface.mockReturnValue({
            question: mockQuestion,
            close: vi.fn(),
        });

        // Default mock implementations
        credentials.isLoggedIn.mockResolvedValue(false);
        logger.spinner.mockReturnValue({
            start: vi.fn(),
            fail: vi.fn(),
            succeed: vi.fn(),
            stop: vi.fn()
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should handle invalid API key', async () => {
        // Mock prompt to return invalid key
        const mockRl = {
            question: vi.fn((q, cb) => cb('invalid-key')),
            close: vi.fn()
        };
        createInterface.mockReturnValue(mockRl);

        // Mock fetch failure (simulating invalid key result from server)
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            json: async () => ({ error: 'Invalid key' })
        });

        // Expect process.exit(1) to be called
        await expect(login()).rejects.toThrow('process.exit');

        // Verify spinner failure message
        const spinnerMock = logger.spinner();
        expect(spinnerMock.fail).toHaveBeenCalledWith('Invalid API key');

        // Verify error suggestions were shown
        expect(logger.errorWithSuggestions).toHaveBeenCalled();
    });

    it('should handle network errors gracefully', async () => {
        // Mock prompt
        const mockRl = {
            question: vi.fn((q, cb) => cb('some-key')),
            close: vi.fn()
        };
        createInterface.mockReturnValue(mockRl);

        // Mock network error
        global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

        await expect(login()).rejects.toThrow('process.exit');

        const spinnerMock = logger.spinner();
        expect(spinnerMock.fail).toHaveBeenCalledWith('Invalid API key');
    });
});
