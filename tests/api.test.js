import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from '../src/utils/api.js';
import { getApiKey } from '../src/utils/credentials.js';

// Mock credentials
vi.mock('../src/utils/credentials.js', () => ({
    getApiKey: vi.fn().mockResolvedValue('test-api-key'),
    getApiSecret: vi.fn().mockResolvedValue('test-api-secret')
}));

// Mock global fetch
global.fetch = vi.fn();

describe('API Utility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('apiRequest', () => {
        it('should make an authenticated POST request', async () => {
            fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ success: true })
            });

            const result = await api.recordDeployment({
                subdomain: 'test',
                version: 1,
                fileCount: 5,
                totalBytes: 100
            });

            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/deployments'),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'X-API-Key': 'test-api-key',
                        'Content-Type': 'application/json'
                    }),
                    body: expect.stringContaining('"subdomain":"test"')
                })
            );
            expect(result.success).toBe(true);
        });

        it('should throw error on non-ok response', async () => {
            fetch.mockResolvedValue({
                ok: false,
                status: 403,
                json: () => Promise.resolve({ error: 'Unauthorized' })
            });

            await expect(api.getDeployment('test'))
                .rejects.toThrow('Unauthorized');
        });

        it('should return null if fetch fails (network error)', async () => {
            fetch.mockRejectedValue(new Error('fetch failed'));

            const result = await api.healthCheck();
            expect(result).toBeNull();
        });
    });

    describe('getNextVersionFromAPI', () => {
        it('should return 1 if no previous versions exist', async () => {
            fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ versions: [] })
            });

            const version = await api.getNextVersionFromAPI('test');
            expect(version).toBe(1);
        });

        it('should return max version + 1', async () => {
            fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    versions: [{ version: 1 }, { version: 5 }]
                })
            });

            const version = await api.getNextVersionFromAPI('test');
            expect(version).toBe(6);
        });
    });
});
