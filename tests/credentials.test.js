import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Mock the fs modules
vi.mock('node:fs');
vi.mock('node:fs/promises');
vi.mock('node:os');
vi.mock('node:crypto', () => ({
    randomBytes: vi.fn(() => ({ toString: () => 'abc123def456' }))
}));

// Import after mocking
import { getCredentials, saveCredentials, clearCredentials, isLoggedIn, getApiKey, getClientToken } from '../src/utils/credentials.js';

describe('credentials utils', () => {
    const mockHomedir = '/home/testuser';
    const mockConfigDir = '/home/testuser/.staticlaunch';
    const mockCredentialsPath = '/home/testuser/.staticlaunch/credentials.json';

    beforeEach(() => {
        vi.clearAllMocks();
        homedir.mockReturnValue(mockHomedir);
    });

    describe('getCredentials', () => {
        it('returns null when credentials file does not exist', async () => {
            existsSync.mockReturnValue(false);
            const result = await getCredentials();
            expect(result).toBeNull();
        });

        it('returns credentials when file exists and is valid', async () => {
            existsSync.mockReturnValue(true);
            readFile.mockResolvedValue(JSON.stringify({
                apiKey: 'test-key',
                userId: 'user-123',
                email: 'test@example.com',
                tier: 'pro'
            }));

            const result = await getCredentials();
            expect(result).toEqual({
                apiKey: 'test-key',
                userId: 'user-123',
                email: 'test@example.com',
                tier: 'pro',
                savedAt: null
            });
        });

        it('returns null when JSON is invalid', async () => {
            existsSync.mockReturnValue(true);
            readFile.mockResolvedValue('invalid json');

            const result = await getCredentials();
            expect(result).toBeNull();
        });
    });

    describe('saveCredentials', () => {
        it('creates config directory and saves credentials', async () => {
            existsSync.mockReturnValue(false);
            mkdir.mockResolvedValue(undefined);
            writeFile.mockResolvedValue(undefined);

            await saveCredentials({
                apiKey: 'new-key',
                userId: 'user-456',
                email: 'new@example.com',
                tier: 'free'
            });

            expect(mkdir).toHaveBeenCalledWith(mockConfigDir, { recursive: true });
            expect(writeFile).toHaveBeenCalled();
        });
    });

    describe('clearCredentials', () => {
        it('deletes credentials file when it exists', async () => {
            existsSync.mockReturnValue(true);
            unlink.mockResolvedValue(undefined);

            await clearCredentials();
            expect(unlink).toHaveBeenCalledWith(mockCredentialsPath);
        });

        it('does nothing when file does not exist', async () => {
            existsSync.mockReturnValue(false);
            await clearCredentials();
            expect(unlink).not.toHaveBeenCalled();
        });
    });

    describe('isLoggedIn', () => {
        it('returns true when credentials exist', async () => {
            existsSync.mockReturnValue(true);
            readFile.mockResolvedValue(JSON.stringify({ apiKey: 'test-key' }));

            const result = await isLoggedIn();
            expect(result).toBe(true);
        });

        it('returns false when no credentials', async () => {
            existsSync.mockReturnValue(false);

            const result = await isLoggedIn();
            expect(result).toBe(false);
        });
    });

    describe('getApiKey', () => {
        it('returns stored API key when available', async () => {
            existsSync.mockReturnValue(true);
            readFile.mockResolvedValue(JSON.stringify({ apiKey: 'stored-key' }));

            const result = await getApiKey();
            expect(result).toBe('stored-key');
        });

        it('falls back to public beta key when no credentials', async () => {
            existsSync.mockReturnValue(false);

            const result = await getApiKey();
            expect(result).toBe('public-beta-key');
        });
    });
});
