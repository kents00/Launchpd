import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    isRemoteUrl,
    parseRemoteUrl,
    fetchRemoteSource,
    cleanupTempDir,
    validateGistFilename,
    MAX_DOWNLOAD_BYTES,
    MAX_FILE_COUNT,
    MAX_EXTRACT_DEPTH,
    GIST_PARALLEL_LIMIT,
    FETCH_TIMEOUT_MS
} from '../src/utils/remoteSource.js'
import { mkdtemp, writeFile, rm, readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// ============================================================================
// isRemoteUrl Tests
// ============================================================================

describe('isRemoteUrl', () => {
    it('should return true for GitHub repo URLs', () => {
        expect(isRemoteUrl('https://github.com/user/repo')).toBe(true)
    })

    it('should return true for GitHub gist URLs', () => {
        expect(isRemoteUrl('https://gist.github.com/user/abc123')).toBe(true)
    })

    it('should return true for HTTP (non-HTTPS) GitHub URLs', () => {
        expect(isRemoteUrl('http://github.com/user/repo')).toBe(true)
        expect(isRemoteUrl('http://gist.github.com/user/abc123')).toBe(true)
    })

    it('should return false for local paths', () => {
        expect(isRemoteUrl('.')).toBe(false)
        expect(isRemoteUrl('./dist')).toBe(false)
        expect(isRemoteUrl('/home/user/project')).toBe(false)
        expect(isRemoteUrl('C:\\Users\\test\\project')).toBe(false)
    })

    it('should return false for empty or null input', () => {
        expect(isRemoteUrl('')).toBe(false)
        expect(isRemoteUrl(null)).toBe(false)
        expect(isRemoteUrl(undefined)).toBe(false)
    })

    it('should return false for non-GitHub URLs', () => {
        expect(isRemoteUrl('https://gitlab.com/user/repo')).toBe(false)
        expect(isRemoteUrl('https://bitbucket.org/user/repo')).toBe(false)
        expect(isRemoteUrl('https://example.com')).toBe(false)
    })
})

// ============================================================================
// parseRemoteUrl Tests
// ============================================================================

describe('parseRemoteUrl', () => {
    describe('Gist URLs', () => {
        it('should parse a valid gist URL', () => {
            const result = parseRemoteUrl('https://gist.github.com/user/abc123')
            expect(result).toEqual({
                type: 'gist',
                owner: 'user',
                gistId: 'abc123'
            })
        })

        it('should handle trailing slashes', () => {
            const result = parseRemoteUrl('https://gist.github.com/user/abc123/')
            expect(result).toEqual({
                type: 'gist',
                owner: 'user',
                gistId: 'abc123'
            })
        })

        it('should throw on gist URL with missing gist ID', () => {
            expect(() => parseRemoteUrl('https://gist.github.com/user')).toThrow(
                'Invalid Gist URL'
            )
        })
    })

    describe('Repo URLs', () => {
        it('should parse a valid repo URL', () => {
            const result = parseRemoteUrl('https://github.com/user/repo')
            expect(result).toEqual({
                type: 'repo',
                owner: 'user',
                repo: 'repo'
            })
        })

        it('should handle trailing slashes', () => {
            const result = parseRemoteUrl('https://github.com/user/repo/')
            expect(result).toEqual({
                type: 'repo',
                owner: 'user',
                repo: 'repo'
            })
        })

        it('should handle URLs with extra path segments', () => {
            const result = parseRemoteUrl('https://github.com/user/repo/tree/main')
            expect(result).toEqual({
                type: 'repo',
                owner: 'user',
                repo: 'repo'
            })
        })

        it('should throw on repo URL with missing repo name', () => {
            expect(() => parseRemoteUrl('https://github.com/user')).toThrow(
                'Invalid GitHub URL'
            )
        })
    })

    describe('Error cases', () => {
        it('should throw on null input', () => {
            expect(() => parseRemoteUrl(null)).toThrow('URL is required')
        })

        it('should throw on empty string', () => {
            expect(() => parseRemoteUrl('')).toThrow('URL is required')
        })

        it('should throw on non-URL string', () => {
            expect(() => parseRemoteUrl('not-a-url')).toThrow('Invalid URL')
        })

        it('should throw on unsupported host', () => {
            expect(() => parseRemoteUrl('https://gitlab.com/user/repo')).toThrow(
                'Unsupported URL host'
            )
        })
    })
})

// ============================================================================
// validateGistFilename Tests
// ============================================================================

describe('validateGistFilename', () => {
    describe('Valid filenames', () => {
        it('should accept normal filenames', () => {
            expect(() => validateGistFilename('index.html')).not.toThrow()
            expect(() => validateGistFilename('style.css')).not.toThrow()
            expect(() => validateGistFilename('app.js')).not.toThrow()
            expect(() => validateGistFilename('README.md')).not.toThrow()
            expect(() => validateGistFilename('my-file.txt')).not.toThrow()
        })

        it('should accept filenames with leading dots (hidden files)', () => {
            expect(() => validateGistFilename('.gitignore')).not.toThrow()
            expect(() => validateGistFilename('.env.example')).not.toThrow()
        })
    })

    describe('Path traversal', () => {
        it('should reject filenames containing ".."', () => {
            expect(() => validateGistFilename('../../../etc/passwd')).toThrow('Unsafe gist filename')
        })

        it('should reject filenames containing forward slashes', () => {
            expect(() => validateGistFilename('sub/dir/file.html')).toThrow('Unsafe gist filename')
        })

        it('should reject filenames containing null bytes', () => {
            expect(() => validateGistFilename('file\0name.txt')).toThrow('Unsafe gist filename')
        })
    })

    describe('Dot-only filenames', () => {
        it('should reject a single dot filename "."', () => {
            expect(() => validateGistFilename('.')).toThrow('Unsafe gist filename')
        })

        it('should reject triple-dot filenames "..."', () => {
            expect(() => validateGistFilename('...')).toThrow('Unsafe gist filename')
        })

        it('should reject many-dot filenames "....."', () => {
            expect(() => validateGistFilename('.....')).toThrow('Unsafe gist filename')
        })
    })

    describe('Windows reserved names', () => {
        it('should reject Windows reserved name "CON"', () => {
            expect(() => validateGistFilename('CON')).toThrow('Unsafe gist filename')
        })

        it('should reject Windows reserved name "NUL"', () => {
            expect(() => validateGistFilename('NUL')).toThrow('Unsafe gist filename')
        })

        it('should reject Windows reserved name "AUX"', () => {
            expect(() => validateGistFilename('AUX')).toThrow('Unsafe gist filename')
        })

        it('should reject Windows reserved name "PRN"', () => {
            expect(() => validateGistFilename('PRN')).toThrow('Unsafe gist filename')
        })

        it('should reject Windows reserved name "COM1"', () => {
            expect(() => validateGistFilename('COM1')).toThrow('Unsafe gist filename')
        })

        it('should reject Windows reserved name "COM9"', () => {
            expect(() => validateGistFilename('COM9')).toThrow('Unsafe gist filename')
        })

        it('should reject Windows reserved name "LPT1"', () => {
            expect(() => validateGistFilename('LPT1')).toThrow('Unsafe gist filename')
        })

        it('should reject Windows reserved name with extension "CON.txt"', () => {
            expect(() => validateGistFilename('CON.txt')).toThrow('Unsafe gist filename')
        })

        it('should reject Windows reserved name with extension "NUL.html"', () => {
            expect(() => validateGistFilename('NUL.html')).toThrow('Unsafe gist filename')
        })

        it('should reject Windows reserved name case-insensitively "con.txt"', () => {
            expect(() => validateGistFilename('con.txt')).toThrow('Unsafe gist filename')
        })

        it('should reject Windows reserved name "nul"', () => {
            expect(() => validateGistFilename('nul')).toThrow('Unsafe gist filename')
        })
    })
})

// ============================================================================
// Security Tests
// ============================================================================

describe('Security', () => {
    let originalFetch
    let tempDirs = []

    beforeEach(() => {
        originalFetch = globalThis.fetch
        tempDirs = []
    })

    afterEach(async () => {
        globalThis.fetch = originalFetch
        for (const dir of tempDirs) {
            try {
                await rm(dir, { recursive: true, force: true })
            } catch {
                // ignore
            }
        }
    })

    describe('Path traversal prevention', () => {
        it('should reject --dir with parent traversal (../../etc)', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    files: { 'index.html': { content: 'hi', truncated: false } }
                }),
                headers: new Headers()
            })

            const result = await fetchRemoteSource(
                { type: 'gist', gistId: 'abc123' },
                {}
            )
            tempDirs.push(result.tempDir)

            // Now try to escape with a malicious --dir
            await expect(
                fetchRemoteSource(
                    { type: 'gist', gistId: 'abc123' },
                    { dir: '../../etc' }
                )
            ).rejects.toThrow('Unsafe --dir path')
        })

        it('should allow safe --dir paths', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    files: { 'index.html': { content: 'hi', truncated: false } }
                }),
                headers: new Headers()
            })

            const result = await fetchRemoteSource(
                { type: 'gist', gistId: 'abc123' },
                { dir: 'subdir' }
            )
            tempDirs.push(result.tempDir)

            expect(result.folderPath).toBe(join(result.tempDir, 'subdir'))
        })
    })

    describe('Gist filename sanitization', () => {
        it('should reject gist filenames with path traversal', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    files: {
                        '../../../etc/passwd': {
                            content: 'malicious',
                            truncated: false
                        }
                    }
                }),
                headers: new Headers()
            })

            await expect(
                fetchRemoteSource({ type: 'gist', gistId: 'evil' }, {})
            ).rejects.toThrow('Unsafe gist filename')
        })

        it('should reject gist filenames with path separators', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    files: {
                        'sub/dir/file.html': {
                            content: 'malicious',
                            truncated: false
                        }
                    }
                }),
                headers: new Headers()
            })

            await expect(
                fetchRemoteSource({ type: 'gist', gistId: 'evil' }, {})
            ).rejects.toThrow('Unsafe gist filename')
        })

        it('should reject Windows reserved name "CON.txt" from gist file list', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    files: {
                        'CON.txt': { content: 'bad', truncated: false }
                    }
                }),
                headers: new Headers()
            })

            await expect(
                fetchRemoteSource({ type: 'gist', gistId: 'winsafe' }, {})
            ).rejects.toThrow('Unsafe gist filename')
        })

        it('should reject dot-only filenames from gist file list', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    files: {
                        '...': { content: 'bad', truncated: false }
                    }
                }),
                headers: new Headers()
            })

            await expect(
                fetchRemoteSource({ type: 'gist', gistId: 'dotbomb' }, {})
            ).rejects.toThrow('Unsafe gist filename')
        })
    })

    describe('Rate limiting', () => {
        it('should throw descriptive error when rate limited (403 + remaining=0)', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                headers: new Headers({
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600)
                })
            })

            await expect(
                fetchRemoteSource({ type: 'gist', gistId: 'abc123' }, {})
            ).rejects.toThrow('rate limit exceeded')
        })

        it('should include reset time in rate limit error', async () => {
            const resetTime = Math.floor(Date.now() / 1000) + 3600
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                headers: new Headers({
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': String(resetTime)
                })
            })

            await expect(
                fetchRemoteSource({ type: 'gist', gistId: 'abc123' }, {})
            ).rejects.toThrow('Rate limit resets at')
        })
    })

    describe('Download size limits', () => {
        it('should reject gist exceeding size limit', async () => {
            // Create a content string larger than MAX_DOWNLOAD_BYTES
            const hugeContent = 'x'.repeat(MAX_DOWNLOAD_BYTES + 1)

            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    files: {
                        'huge.html': { content: hugeContent, truncated: false }
                    }
                }),
                headers: new Headers()
            })

            await expect(
                fetchRemoteSource({ type: 'gist', gistId: 'huge' }, {})
            ).rejects.toThrow('exceeds maximum size limit')
        })
    })

    describe('SSRF protection on raw_url', () => {
        it('should reject raw_url pointing to an internal IP address', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    files: {
                        'evil.html': {
                            content: null,
                            truncated: true,
                            raw_url: 'http://169.254.169.254/latest/meta-data/'
                        }
                    }
                }),
                headers: new Headers()
            })

            await expect(
                fetchRemoteSource({ type: 'gist', gistId: 'ssrf' }, {})
            ).rejects.toThrow('Untrusted raw_url host')
        })

        it('should reject raw_url pointing to localhost', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    files: {
                        'evil.html': {
                            content: null,
                            truncated: true,
                            raw_url: 'http://localhost/evil'
                        }
                    }
                }),
                headers: new Headers()
            })

            await expect(
                fetchRemoteSource({ type: 'gist', gistId: 'ssrf-local' }, {})
            ).rejects.toThrow('Untrusted raw_url host')
        })

        it('should reject raw_url pointing to an arbitrary external domain', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    files: {
                        'phishing.html': {
                            content: null,
                            truncated: true,
                            raw_url: 'https://evil.example.com/steal-credentials'
                        }
                    }
                }),
                headers: new Headers()
            })

            await expect(
                fetchRemoteSource({ type: 'gist', gistId: 'ssrf-ext' }, {})
            ).rejects.toThrow('Untrusted raw_url host')
        })

        it('should allow raw_url from gist.githubusercontent.com', async () => {
            globalThis.fetch = vi.fn().mockImplementation((url) => {
                if (url.includes('/gists/')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({
                            files: {
                                'safe.html': {
                                    content: null,
                                    truncated: true,
                                    raw_url: 'https://gist.githubusercontent.com/user/abc/raw/file.html'
                                }
                            }
                        }),
                        headers: new Headers()
                    })
                }
                return Promise.resolve({
                    ok: true,
                    text: async () => '<h1>Hello</h1>',
                    headers: new Headers()
                })
            })

            const result = await fetchRemoteSource(
                { type: 'gist', gistId: 'trusted' },
                {}
            )
            tempDirs.push(result.tempDir)
            expect(result.tempDir).toBeTruthy()
        })

        it('should allow raw_url from raw.githubusercontent.com', async () => {
            globalThis.fetch = vi.fn().mockImplementation((url) => {
                if (url.includes('/gists/')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({
                            files: {
                                'also-safe.html': {
                                    content: null,
                                    truncated: true,
                                    raw_url: 'https://raw.githubusercontent.com/user/repo/main/file.html'
                                }
                            }
                        }),
                        headers: new Headers()
                    })
                }
                return Promise.resolve({
                    ok: true,
                    text: async () => '<h1>Hello from raw</h1>',
                    headers: new Headers()
                })
            })

            const result = await fetchRemoteSource(
                { type: 'gist', gistId: 'raw-trusted' },
                {}
            )
            tempDirs.push(result.tempDir)
            expect(result.tempDir).toBeTruthy()
        })

        it('should throw on malformed raw_url', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    files: {
                        'broken.html': {
                            content: null,
                            truncated: true,
                            raw_url: 'not-a-valid-url'
                        }
                    }
                }),
                headers: new Headers()
            })

            await expect(
                fetchRemoteSource({ type: 'gist', gistId: 'bad-url' }, {})
            ).rejects.toThrow('Invalid raw_url')
        })
    })

    describe('Fetch timeout', () => {
        it('should throw a timeout error if gist API fetch hangs', async () => {
            // Simulate an AbortError as would be thrown by fetch when signal fires
            const abortErr = new Error('The operation was aborted')
            abortErr.name = 'AbortError'

            globalThis.fetch = vi.fn().mockRejectedValue(abortErr)

            await expect(
                fetchRemoteSource({ type: 'gist', gistId: 'slow' }, {})
            ).rejects.toThrow('timed out')
        })

        it('should throw a timeout error if repo tarball fetch hangs', async () => {
            const abortErr = new Error('The operation was aborted')
            abortErr.name = 'AbortError'

            globalThis.fetch = vi.fn().mockRejectedValue(abortErr)

            await expect(
                fetchRemoteSource({ type: 'repo', owner: 'user', repo: 'slow-repo' }, {})
            ).rejects.toThrow('timed out')
        })

        it('should throw a timeout error if truncated gist file download hangs', async () => {
            const abortErr = new Error('The operation was aborted')
            abortErr.name = 'AbortError'

            globalThis.fetch = vi.fn().mockImplementation((url) => {
                if (url.includes('/gists/')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({
                            files: {
                                'large.html': {
                                    content: null,
                                    truncated: true,
                                    raw_url: 'https://gist.githubusercontent.com/raw/large.html'
                                }
                            }
                        }),
                        headers: new Headers()
                    })
                }
                // Simulate timeout on raw file fetch
                return Promise.reject(abortErr)
            })

            await expect(
                fetchRemoteSource({ type: 'gist', gistId: 'timeout-raw' }, {})
            ).rejects.toThrow('timed out')
        })
    })

    describe('Content-Type validation on repo tarball', () => {
        it('should reject repo tarball response with text/html Content-Type', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: new Headers({
                    'Content-Type': 'text/html; charset=utf-8'
                }),
                body: null
            })

            await expect(
                fetchRemoteSource({ type: 'repo', owner: 'user', repo: 'repo' }, {})
            ).rejects.toThrow('Unexpected Content-Type')
        })

        it('should reject repo tarball response with application/json Content-Type', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: new Headers({
                    'Content-Type': 'application/json'
                }),
                body: null
            })

            await expect(
                fetchRemoteSource({ type: 'repo', owner: 'user', repo: 'repo' }, {})
            ).rejects.toThrow('Unexpected Content-Type')
        })
    })

    describe('Content-Length pre-check for truncated gist files', () => {
        it('should reject a truncated gist file whose Content-Length would exceed the total size limit', async () => {
            globalThis.fetch = vi.fn().mockImplementation((url) => {
                if (url.includes('/gists/')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({
                            files: {
                                'big.html': {
                                    content: null,
                                    truncated: true,
                                    raw_url: 'https://gist.githubusercontent.com/raw/big.html'
                                }
                            }
                        }),
                        headers: new Headers()
                    })
                }
                // Report Content-Length > MAX_DOWNLOAD_BYTES on raw file
                return Promise.resolve({
                    ok: true,
                    headers: new Headers({
                        'Content-Length': String(MAX_DOWNLOAD_BYTES + 1)
                    }),
                    text: async () => 'x'.repeat(10) // would not actually be called
                })
            })

            await expect(
                fetchRemoteSource({ type: 'gist', gistId: 'huge-raw' }, {})
            ).rejects.toThrow('exceeds maximum size limit')
        })
    })
})

// ============================================================================
// fetchRemoteSource Tests (with mocked fetch)
// ============================================================================

describe('fetchRemoteSource', () => {
    let originalFetch
    let tempDirs = []

    beforeEach(() => {
        originalFetch = globalThis.fetch
        tempDirs = []
    })

    afterEach(async () => {
        globalThis.fetch = originalFetch
        for (const dir of tempDirs) {
            try {
                await rm(dir, { recursive: true, force: true })
            } catch {
                // ignore
            }
        }
    })

    describe('Gist fetching', () => {
        it('should fetch gist files into a temp directory', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    files: {
                        'index.html': {
                            content: '<h1>Hello</h1>',
                            truncated: false
                        },
                        'style.css': {
                            content: 'body { color: red; }',
                            truncated: false
                        }
                    }
                }),
                headers: new Headers()
            })

            const result = await fetchRemoteSource(
                { type: 'gist', gistId: 'abc123' },
                {}
            )

            tempDirs.push(result.tempDir)

            // Verify files were written
            const files = await readdir(result.tempDir)
            expect(files).toContain('index.html')
            expect(files).toContain('style.css')

            const htmlContent = await readFile(
                join(result.tempDir, 'index.html'),
                'utf8'
            )
            expect(htmlContent).toBe('<h1>Hello</h1>')
        })

        it('should handle truncated gist files by fetching raw URL', async () => {
            globalThis.fetch = vi.fn().mockImplementation((url) => {
                if (url.includes('/gists/')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({
                            files: {
                                'large.html': {
                                    content: null,
                                    truncated: true,
                                    raw_url: 'https://gist.githubusercontent.com/raw/large.html'
                                }
                            }
                        }),
                        headers: new Headers()
                    })
                }
                // raw_url fetch
                return Promise.resolve({
                    ok: true,
                    text: async () => '<h1>Large file content</h1>',
                    headers: new Headers()
                })
            })

            const result = await fetchRemoteSource(
                { type: 'gist', gistId: 'abc123' },
                {}
            )
            tempDirs.push(result.tempDir)

            const content = await readFile(
                join(result.tempDir, 'large.html'),
                'utf8'
            )
            expect(content).toBe('<h1>Large file content</h1>')
        })

        it('should download truncated gist files in parallel', async () => {
            const callOrder = []

            globalThis.fetch = vi.fn().mockImplementation((url) => {
                if (url.includes('/gists/')) {
                    // Return 7 truncated files to test batching (5 + 2)
                    const files = {}
                    for (let i = 0; i < 7; i++) {
                        files[`file${i}.html`] = {
                            content: null,
                            truncated: true,
                            raw_url: `https://gist.githubusercontent.com/raw/file${i}.html`
                        }
                    }
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({ files }),
                        headers: new Headers()
                    })
                }
                // raw_url fetch — track call order
                callOrder.push(url)
                return Promise.resolve({
                    ok: true,
                    text: async () => 'content',
                    headers: new Headers()
                })
            })

            const result = await fetchRemoteSource(
                { type: 'gist', gistId: 'parallel' },
                {}
            )
            tempDirs.push(result.tempDir)

            // All 7 files should have been downloaded
            expect(callOrder.length).toBe(7)

            // Verify files written
            const files = await readdir(result.tempDir)
            expect(files.length).toBe(7)
        })

        it('should throw on 404 gist', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                headers: new Headers()
            })

            await expect(
                fetchRemoteSource({ type: 'gist', gistId: 'nonexistent' }, {})
            ).rejects.toThrow('Gist not found')
        })

        it('should throw on gist with no files', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    files: {}
                }),
                headers: new Headers()
            })

            await expect(
                fetchRemoteSource({ type: 'gist', gistId: 'empty' }, {})
            ).rejects.toThrow('has no files')
        })

        it('should throw a descriptive error on gist API 500 error', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                headers: new Headers()
            })

            await expect(
                fetchRemoteSource({ type: 'gist', gistId: 'servererr' }, {})
            ).rejects.toThrow('GitHub API error (500)')
        })

        it('should throw error when raw file download returns non-ok response', async () => {
            globalThis.fetch = vi.fn().mockImplementation((url) => {
                if (url.includes('/gists/')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({
                            files: {
                                'file.html': {
                                    content: null,
                                    truncated: true,
                                    raw_url: 'https://gist.githubusercontent.com/raw/file.html'
                                }
                            }
                        }),
                        headers: new Headers()
                    })
                }
                return Promise.resolve({
                    ok: false,
                    status: 403,
                    headers: new Headers()
                })
            })

            await expect(
                fetchRemoteSource({ type: 'gist', gistId: 'fail-raw' }, {})
            ).rejects.toThrow('Failed to download file')
        })
    })

    describe('Repo fetching', () => {
        it('should throw on 404 repo', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                headers: new Headers()
            })

            await expect(
                fetchRemoteSource(
                    { type: 'repo', owner: 'user', repo: 'nonexistent' },
                    {}
                )
            ).rejects.toThrow('Repository not found')
        })

        it('should throw on 404 repo with branch info', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                headers: new Headers()
            })

            await expect(
                fetchRemoteSource(
                    { type: 'repo', owner: 'user', repo: 'nonexistent' },
                    { branch: 'feature-dev' }
                )
            ).rejects.toThrow('branch: "feature-dev"')
        })

        it('should throw a descriptive error on repo API 500 error', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                headers: new Headers()
            })

            await expect(
                fetchRemoteSource(
                    { type: 'repo', owner: 'user', repo: 'repo' },
                    {}
                )
            ).rejects.toThrow('GitHub API error (500)')
        })

        it('should reject tarball exceeding Content-Length size limit', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                headers: new Headers({
                    'Content-Type': 'application/x-gzip',
                    'Content-Length': String(MAX_DOWNLOAD_BYTES + 1)
                }),
                body: null
            })

            await expect(
                fetchRemoteSource(
                    { type: 'repo', owner: 'user', repo: 'huge' },
                    {}
                )
            ).rejects.toThrow('exceeds maximum size limit')
        })
    })

    describe('Directory resolution', () => {
        it('should resolve --dir subdirectory', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    files: {
                        'index.html': { content: 'hi', truncated: false }
                    }
                }),
                headers: new Headers()
            })

            const result = await fetchRemoteSource(
                { type: 'gist', gistId: 'abc123' },
                { dir: 'subdir' }
            )
            tempDirs.push(result.tempDir)

            expect(result.folderPath).toBe(join(result.tempDir, 'subdir'))
        })
    })

    describe('Unknown type', () => {
        it('should throw on unknown source type', async () => {
            await expect(
                fetchRemoteSource({ type: 'unknown' }, {})
            ).rejects.toThrow('Unknown remote source type')
        })
    })
})

// ============================================================================
// Constants Tests
// ============================================================================

describe('Constants', () => {
    it('should export MAX_DOWNLOAD_BYTES as 100MB', () => {
        expect(MAX_DOWNLOAD_BYTES).toBe(100 * 1024 * 1024)
    })

    it('should export MAX_FILE_COUNT as 10000', () => {
        expect(MAX_FILE_COUNT).toBe(10_000)
    })

    it('should export MAX_EXTRACT_DEPTH as 50', () => {
        expect(MAX_EXTRACT_DEPTH).toBe(50)
    })

    it('should export GIST_PARALLEL_LIMIT as 5', () => {
        expect(GIST_PARALLEL_LIMIT).toBe(5)
    })

    it('should export FETCH_TIMEOUT_MS as 30000', () => {
        expect(FETCH_TIMEOUT_MS).toBe(30_000)
    })
})

// ============================================================================
// cleanupTempDir Tests
// ============================================================================

describe('cleanupTempDir', () => {
    it('should remove a temp directory', async () => {
        const tempDir = await mkdtemp(join(tmpdir(), 'launchpd-test-'))
        await writeFile(join(tempDir, 'test.txt'), 'hello')

        expect(existsSync(tempDir)).toBe(true)
        await cleanupTempDir(tempDir)
        expect(existsSync(tempDir)).toBe(false)
    })

    it('should not throw on null input', async () => {
        await expect(cleanupTempDir(null)).resolves.toBeUndefined()
    })

    it('should not throw on non-existent directory', async () => {
        await expect(
            cleanupTempDir('/tmp/nonexistent-dir-abc123')
        ).resolves.toBeUndefined()
    })
})
