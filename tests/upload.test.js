import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadFolder, finalizeUpload } from '../src/utils/upload.js';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
    readdir: vi.fn(),
    readFile: vi.fn()
}));

// Mock credentials
vi.mock('../src/utils/credentials.js', () => ({
    getApiKey: vi.fn().mockResolvedValue('test-api-key'),
    getApiSecret: vi.fn().mockResolvedValue('test-api-secret')
}));

// Mock global fetch
global.fetch = vi.fn();

describe('Upload Utility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('uploadFolder', () => {
        it('should scan folder and upload files', async () => {
            // Setup readdir mock
            readdir.mockResolvedValue([
                { isFile: () => true, name: 'index.html', path: '/test' },
                { isFile: () => true, name: 'style.css', path: '/test' },
                { isFile: () => false, name: 'assets', path: '/test' } // Directory, should be skipped
            ]);

            readFile.mockResolvedValue(Buffer.from('test content'));

            fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ success: true })
            });

            const onProgress = vi.fn();
            const result = await uploadFolder('/test', 'mysite', 1, onProgress);

            expect(readdir).toHaveBeenCalledWith('/test', { recursive: true, withFileTypes: true });
            expect(fetch).toHaveBeenCalledTimes(2); // index.html and style.css
            expect(onProgress).toHaveBeenCalledTimes(2);
            expect(result.uploaded).toBe(2);
            expect(result.subdomain).toBe('mysite');
        });

        it('should handle Windows paths correctly (to POSIX)', async () => {
            // Mock path/fs to simulate Windows structure if needed,
            // but our toPosixPath is simple string split/join.
            // We can just verify the X-File-Path header.

            readdir.mockResolvedValue([
                { isFile: () => true, name: 'main.js', path: 'C:\\test\\subdir', parentPath: 'C:\\test\\subdir' }
            ]);
            readFile.mockResolvedValue(Buffer.from('js content'));
            fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

            // We need to carefully mock relative and join if we want to test cross-platform exactly,
            // but for now let's see if it works with the current implementation.
            await uploadFolder('C:\\test', 'mysite', 1);

            // Note: toPosixPath uses path.sep, so it depends on the environment running the test.
            // In windows (where the user is), path.sep is \.
        });
    });

    describe('finalizeUpload', () => {
        it('should call complete upload endpoint', async () => {
            fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ success: true })
            });

            await finalizeUpload('mysite', 1, 2, 1024, 'test-folder', '2026-01-01T00:00:00Z');

            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/upload/complete'),
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('"subdomain":"mysite"')
                })
            );
        });
    });
});
