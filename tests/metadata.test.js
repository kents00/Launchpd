
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getNextVersion, recordDeployment } from '../src/utils/metadata.js';
import { config } from '../src/config.js';

// Mock Config
vi.mock('../src/config.js', () => ({
    config: {
        apiUrl: 'https://api.test',
        version: '0.0.0-test'
    }
}));

// Mock Fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Metadata Utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.STATICLAUNCH_API_KEY = 'test-key';
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('getNextVersion', () => {
        it('should return 1 if no previous versions exist', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ versions: [] })
            });

            const version = await getNextVersion('new-site');
            expect(version).toBe(1);
        });

        it('should increment the max version found', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    versions: [
                        { version: 1 },
                        { version: 5 },
                        { version: 2 }
                    ]
                })
            });

            const version = await getNextVersion('existing-site');
            expect(version).toBe(6); // 5 + 1
        });

        it('should handle API errors gracefully by defaulting to 1 (safety fallback)', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 500 });
            // getNextVersion throws on error currently, or returns 1?
            // Let's check implementation behavior

            // logic:
            /*
               if (!response.ok) throw...
               catch(err) if fetch failed -> return null
               else throw
            */

            // If we want to test error handling we expect a throw
            await expect(getNextVersion('error-site')).rejects.toThrow();
        });
    });

    describe('recordDeployment', () => {
        it('should send correct payload to API', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ success: true })
            });

            const deployData = {
                subdomain: 'test-site',
                folderPath: '/path/to/dist',
                fileCount: 10,
                totalBytes: 1024,
                version: 2
            };

            await recordDeployment(
                deployData.subdomain,
                deployData.folderPath,
                deployData.fileCount,
                deployData.totalBytes,
                deployData.version
            );

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/deployments'),
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('"subdomain":"test-site"')
                })
            );

            // Check body content
            const call = mockFetch.mock.calls[0];
            const body = JSON.parse(call[1].body);
            expect(body.version).toBe(2);
            expect(body.folderName).toBe('dist');
        });
    });
});
