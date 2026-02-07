import { validateStaticOnly } from '../src/utils/validator.js'
import { readdir } from 'node:fs/promises'

vi.mock('node:fs/promises')

describe('validateStaticOnly', () => {
  it('should pass for a clean static site', async () => {
    vi.mocked(readdir).mockResolvedValue([
      { isFile: () => true, isDirectory: () => false, name: 'index.html' },
      { isFile: () => true, isDirectory: () => false, name: 'styles.css' },
      { isFile: () => true, isDirectory: () => false, name: 'script.js' },
      { isFile: () => false, isDirectory: () => true, name: 'assets' }
    ])

    const result = await validateStaticOnly('/fake/path')
    expect(result.success).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('should fail for forbidden files like package.json', async () => {
    vi.mocked(readdir).mockResolvedValue([
      { isFile: () => true, isDirectory: () => false, name: 'index.html' },
      { isFile: () => true, isDirectory: () => false, name: 'package.json' }
    ])

    const result = await validateStaticOnly('/fake/path')
    expect(result.success).toBe(false)
    expect(result.violations).toContain('package.json')
  })

  it('should fail for forbidden extensions like .py or .php', async () => {
    vi.mocked(readdir).mockResolvedValue([
      { isFile: () => true, isDirectory: () => false, name: 'index.html' },
      { isFile: () => true, isDirectory: () => false, name: 'api.py' },
      { isFile: () => true, isDirectory: () => false, name: 'server.php' }
    ])

    const result = await validateStaticOnly('/fake/path')
    expect(result.success).toBe(false)
    expect(result.violations).toContain('api.py')
    expect(result.violations).toContain('server.php')
  })

  it('should fail for hidden folders like .git', async () => {
    vi.mocked(readdir).mockResolvedValue([
      { isFile: () => true, isDirectory: () => false, name: 'index.html' },
      { isFile: () => false, isDirectory: () => true, name: '.git' }
    ])

    const result = await validateStaticOnly('/fake/path')
    expect(result.success).toBe(false)
    expect(result.violations).toContain('.git')
  })

  it('should fail for non-static files like .jsx or .ts', async () => {
    vi.mocked(readdir).mockResolvedValue([
      { isFile: () => true, isDirectory: () => false, name: 'App.jsx' },
      { isFile: () => true, isDirectory: () => false, name: 'index.html' }
    ])

    const result = await validateStaticOnly('/fake/path')
    expect(result.success).toBe(false)
    expect(result.violations).toContain('App.jsx')
  })

  it('should handle nested violations correctly', async () => {
    vi.mocked(readdir).mockResolvedValue([
      { isFile: () => true, isDirectory: () => false, name: 'index.html' },
      {
        isFile: () => true,
        isDirectory: () => false,
        name: 'node_modules/lodash/index.js'
      },
      { isFile: () => false, isDirectory: () => true, name: 'node_modules' }
    ])

    const result = await validateStaticOnly('/fake/path')
    expect(result.success).toBe(false)
    expect(result.violations).toContain('node_modules')
  })

  it('should skip ignored files and directories', async () => {
    vi.mocked(readdir).mockResolvedValue([
      { isFile: () => true, isDirectory: () => false, name: 'index.html' },
      { isFile: () => true, isDirectory: () => false, name: '.DS_Store' },
      { isFile: () => false, isDirectory: () => true, name: 'dist' }
    ])

    const result = await validateStaticOnly('/fake/path')
    expect(result.success).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('should fail for files with non-allowed extensions', async () => {
    vi.mocked(readdir).mockResolvedValue([
      { isFile: () => true, isDirectory: () => false, name: 'setup.exe' },
      { isFile: () => true, isDirectory: () => false, name: 'document.pdf' }
    ])

    const result = await validateStaticOnly('/fake/path')
    expect(result.success).toBe(false)
    expect(result.violations).toContain('setup.exe')
    expect(result.violations).not.toContain('document.pdf')
  })

  it('should throw an error if readdir fails', async () => {
    vi.mocked(readdir).mockRejectedValue(new Error('Permission denied'))

    await expect(validateStaticOnly('/fake/path')).rejects.toThrow(
      'Failed to validate folder: Permission denied'
    )
  })
})
