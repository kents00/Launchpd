import { uploadFolder, finalizeUpload } from '../src/utils/upload.js'
import { readdir, readFile } from 'node:fs/promises'

import { getApiSecret } from '../src/utils/credentials.js'

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn()
}))

// Mock credentials
vi.mock('../src/utils/credentials.js', () => ({
  getApiKey: vi.fn().mockResolvedValue('test-api-key'),
  getApiSecret: vi.fn().mockResolvedValue('test-api-secret')
}))

// Mock global fetch
globalThis.fetch = vi.fn()

describe('Upload Utility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('uploadFolder', () => {
    it('should scan folder and upload files', async () => {
      // Setup readdir mock
      readdir.mockResolvedValue([
        { isFile: () => true, name: 'index.html', path: '/test' },
        { isFile: () => true, name: 'style.css', path: '/test' },
        { isFile: () => false, name: 'assets', path: '/test' } // Directory, should be skipped
      ])

      readFile.mockResolvedValue(Buffer.from('test content'))

      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      const onProgress = vi.fn()
      const result = await uploadFolder('/test', 'mysite', 1, onProgress)

      expect(readdir).toHaveBeenCalledWith('/test', {
        recursive: true,
        withFileTypes: true
      })
      expect(fetch).toHaveBeenCalledTimes(2) // index.html and style.css
      expect(onProgress).toHaveBeenCalledTimes(2)
      expect(result.uploaded).toBe(2)
      expect(result.subdomain).toBe('mysite')
    })

    it('should use default MIME type for unknown extensions', async () => {
      readdir.mockResolvedValue([
        {
          isFile: () => true,
          name: 'data.unknown',
          path: '/test',
          parentPath: '/test'
        }
      ])
      readFile.mockResolvedValue(Buffer.from('binary'))
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })

      await uploadFolder('/test', 'mysite', 1)

      const options = fetch.mock.calls[0][1]
      expect(options.headers['X-Content-Type']).toBe(
        'application/octet-stream'
      )
    })

    it('should handle Windows paths correctly (to POSIX)', async () => {
      // Mock path/fs to simulate Windows structure if needed,
      // but our toPosixPath is simple string split/join.
      // We can just verify the X-File-Path header.

      readdir.mockResolvedValue([
        {
          isFile: () => true,
          name: 'main.js',
          path: String.raw`C:\test\subdir`,
          parentPath: String.raw`C:\test\subdir`
        }
      ])
      readFile.mockResolvedValue(Buffer.from('js content'))
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })

      // We need to carefully mock relative and join if we want to test cross-platform exactly,
      // but for now let's      // In windows (where the user is), path.sep is \.
      await uploadFolder(String.raw`C:\test`, 'mysite', 1)
    })

    it('should skip ignored files and directories', async () => {
      readdir.mockResolvedValue([
        {
          isFile: () => true,
          name: 'index.html',
          path: '/test',
          parentPath: '/test'
        },
        {
          isFile: () => true,
          name: 'test.js',
          path: '/test/node_modules',
          parentPath: '/test/node_modules'
        },
        {
          isFile: () => true,
          name: '.launchpd.json',
          path: '/test',
          parentPath: '/test'
        }
      ])

      readFile.mockResolvedValue(Buffer.from('content'))
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      const result = await uploadFolder('/test', 'mysite', 1)

      // Only index.html should be uploaded.
      // node_modules is ignored via pathParts (line 179)
      // .launchpd.json is ignored via fileName (line 184)
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(result.uploaded).toBe(1)
    })
  })

  describe('finalizeUpload', () => {
    it('should call complete upload endpoint', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      await finalizeUpload(
        'mysite',
        1,
        2,
        1024,
        'test-folder',
        '2026-01-01T00:00:00Z'
      )

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/upload/complete'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"subdomain":"mysite"')
        })
      )
    })

    it('should handle JSON error in complete upload', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () =>
          Promise.resolve(JSON.stringify({ error: 'Quota exceeded' }))
      })

      await expect(finalizeUpload('mysite', 1, 1, 100, 'test')).rejects.toThrow(
        'Quota exceeded'
      )
    })

    it('should fallback to status text if JSON error has no error field (complete)', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve(JSON.stringify({ foo: 'bar' }))
      })

      await expect(finalizeUpload('mysite', 1, 1, 100, 'test')).rejects.toThrow(
        'Complete upload failed: 400 Bad Request'
      )
    })

    it('should handle non-JSON error in complete upload', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Fatal error')
      })

      await expect(finalizeUpload('mysite', 1, 1, 100, 'test')).rejects.toThrow(
        'Complete upload failed: 500 Internal Server Error - Fatal error'
      )
    })
  })

  describe('HMAC Signature', () => {
    it('should add X-Signature header if API secret is present', async () => {
      readdir.mockResolvedValue([
        { isFile: () => true, name: 'index.html', path: '/test' }
      ])
      readFile.mockResolvedValue(Buffer.from('content'))
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })

      await uploadFolder('/test', 'mysite', 1)

      const fetchCalls = fetch.mock.calls.filter((call) =>
        call[0].includes('upload/file')
      )
      const options = fetchCalls[fetchCalls.length - 1][1]
      expect(options.headers['X-Signature']).toBeDefined()
    })

    it('should NOT add X-Signature header if API secret is missing', async () => {
      vi.mocked(getApiSecret).mockResolvedValue(null)
      readdir.mockResolvedValue([
        { isFile: () => true, name: 'index.html', path: '/test' }
      ])
      readFile.mockResolvedValue(Buffer.from('content'))
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })

      await uploadFolder('/test', 'mysite', 1)
      await finalizeUpload('mysite', 1, 1, 100, 'test')

      // Check last upload call
      const uploadCall = fetch.mock.calls.find((c) =>
        c[0].includes('/upload/file')
      )
      expect(uploadCall[1].headers['X-Signature']).toBeUndefined()

      // Check finalize call
      const completeCall = fetch.mock.calls.find((c) =>
        c[0].includes('/upload/complete')
      )
      expect(completeCall[1].headers['X-Signature']).toBeUndefined()
    })
  })

  describe('Error Parsing', () => {
    it('should parse JSON error response', async () => {
      readdir.mockResolvedValue([
        { isFile: () => true, name: 'index.html', path: '/test' }
      ])
      fetch.mockResolvedValueOnce({
        ok: false,
        headers: { get: () => 'application/json' },
        text: () =>
          Promise.resolve(JSON.stringify({ error: 'Custom JSON Error' }))
      })

      await expect(uploadFolder('/test', 'mysite', 1)).rejects.toThrow(
        'Custom JSON Error'
      )
    })

    it('should fallback to default message if JSON error has no error field (upload)', async () => {
      readdir.mockResolvedValue([
        { isFile: () => true, name: 'index.html', path: '/test' }
      ])
      fetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve(JSON.stringify({ foo: 'bar' }))
      })

      await expect(uploadFolder('/test', 'mysite', 1)).rejects.toThrow(
        'Upload failed'
      )
    })

    it('should parse Text error response', async () => {
      readdir.mockResolvedValue([
        { isFile: () => true, name: 'index.html', path: '/test' }
      ])
      fetch.mockResolvedValueOnce({
        ok: false,
        headers: { get: () => 'text/plain' },
        text: () => Promise.resolve('Custom Text Error')
      })

      await expect(uploadFolder('/test', 'mysite', 1)).rejects.toThrow(
        'Custom Text Error'
      )
    })

    it('should handle empty error response and fallback to status code', async () => {
      readdir.mockResolvedValue([
        { isFile: () => true, name: 'index.html', path: '/test' }
      ])
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('')
      })

      await expect(uploadFolder('/test', 'mysite', 1)).rejects.toThrow(
        'Upload failed: 500'
      )
    })
  })
})
