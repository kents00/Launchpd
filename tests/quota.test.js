
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkQuota } from '../src/utils/quota.js';

// Hoist mocks to ensure they are available before vi.mock() execution
const mocks = vi.hoisted(() => ({
    getCredentials: vi.fn(),
    getClientToken: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    raw: vi.fn(),
}));

// Mock dependencies using hoisted functions
vi.mock('../src/utils/credentials.js', () => ({
    getCredentials: mocks.getCredentials,
    getClientToken: mocks.getClientToken
}));

vi.mock('../src/utils/logger.js', () => ({
    warning: mocks.warning,
    error: mocks.error,
    info: mocks.info,
    log: mocks.log,
    raw: mocks.raw,
}));

// Mock Fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('checkQuota', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default anonymous user
        mocks.getCredentials.mockResolvedValue({ apiKey: null });
        mocks.getClientToken.mockResolvedValue('test-token');
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should allow deployment if API is unavailable (fail-open)', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 500 });

        const result = await checkQuota('test-site', 100);

        expect(result.allowed).toBe(true);
        expect(result.warnings[0]).toContain('API unavailable');
    });

    it('should block anonymous deployment if limit reached', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                blocked: true,
                upgradeMessage: 'Limit reached',
                limits: { maxSites: 3 },
                usage: { siteCount: 3 }
            })
        });

        const result = await checkQuota(null, 100);

        expect(result.allowed).toBe(false);
        expect(result.quota.blocked).toBe(true);
    });

    it('should warn if storage is close to limit (80%)', async () => {
        // Mock anonymous quota response
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                blocked: false,
                canCreateNewSite: true,
                limits: { maxStorageBytes: 1000 },
                usage: { storageUsed: 800 } // 800/1000 = 80%
            })
        });

        const result = await checkQuota('existing-site', 50); // +50 = 850 (85%)

        expect(result.allowed).toBe(true);
        expect(result.warnings.some(w => w.includes('Storage 85% used'))).toBe(true);
    });

    it('should block if storage limit exceeded', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                blocked: false,
                canCreateNewSite: true,
                limits: { maxStorageBytes: 1000, maxSites: 10 },
                usage: { storageUsed: 900 }
            })
        });

        const result = await checkQuota('existing-site', 200); // 900 + 200 = 1100 > 1000

        expect(result.allowed).toBe(false);
        expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('Storage limit exceeded'));
    });

    it('should calculate new site limit correctly', async () => {
        // Mock checking site ownership (false = new site)
        mockFetch
            .mockResolvedValueOnce({ // checkQuota (anonymous)
                ok: true,
                json: () => Promise.resolve({
                    blocked: false,
                    canCreateNewSite: false, // Cannot create new
                    limits: { maxSites: 3 },
                    usage: { siteCount: 3 }
                })
            })
            .mockResolvedValueOnce({ // userOwnsSite (check fails or returns false)
                ok: true,
                json: () => Promise.resolve({ subdomains: [] })
            });

        // We need userOwnsSite to be called if subdomain provided,
        // OR if subdomain is null it implies new site.
        // Let's test providing a new subdomain name
        const result = await checkQuota('new-site', 100);

        expect(result.allowed).toBe(false);
        expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('Site limit reached'));
    });
});
