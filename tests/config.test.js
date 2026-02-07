import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn()
}))

describe('config', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('should fallback to default version if package.json is missing', async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      const err = new Error('File not found')
      err.code = 'ENOENT'
      throw err
    })

    const { config } = await import('../src/config.js')
    expect(config.version).toBe('1.0.0')
  })

  it('should log warning if package.json fails to read with non-ENOENT error', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })
    vi.mocked(readFileSync).mockImplementation(() => {
      const err = new Error('Permission denied')
      err.code = 'EACCES'
      throw err
    })

    const { config } = await import('../src/config.js')
    expect(config.version).toBe('1.0.0')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Could not read package.json'),
      'Permission denied'
    )
    warnSpy.mockRestore()
  })
})
