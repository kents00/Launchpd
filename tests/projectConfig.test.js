import {
  findProjectRoot,
  getProjectConfig,
  saveProjectConfig,
  initProjectConfig,
  updateProjectConfig
} from '../src/utils/projectConfig.js'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

vi.mock('node:fs')
vi.mock('node:fs/promises')
vi.mock('node:path')

describe('projectConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    join.mockImplementation((...args) => args.join('/'))
    // Use replaceAll as requested by user
    resolve.mockImplementation((...args) =>
      args.join('/').replaceAll('..', 'PARENT')
    )
  })

  describe('findProjectRoot', () => {
    it('should return current dir if config exists', () => {
      resolve.mockReturnValue('/app')
      existsSync.mockReturnValue(true)

      const root = findProjectRoot('/app')
      expect(root).toBe('/app')
    })

    it('should search upwards', () => {
      resolve
        .mockReturnValueOnce('/app/child')
        .mockReturnValueOnce('/app')
        .mockReturnValueOnce('/app')

      existsSync.mockReturnValueOnce(false).mockReturnValueOnce(true)

      const root = findProjectRoot('/app/child')
      expect(root).toBe('/app')
    })

    it('should return null if not found', () => {
      resolve
        .mockReturnValueOnce('/app')
        .mockReturnValueOnce('/')
        .mockReturnValueOnce('/')

      existsSync.mockReturnValue(false)

      const root = findProjectRoot('/app')
      expect(root).toBeNull()
    })
  })

  describe('getProjectConfig', () => {
    it('should return project config', async () => {
      existsSync.mockReturnValue(true)
      readFile.mockResolvedValue('{"subdomain": "test"}')

      const config = await getProjectConfig('/app')
      expect(config).toEqual({ subdomain: 'test' })
    })

    it('should return null if no project dir', async () => {
      const config = await getProjectConfig(null)
      expect(config).toBeNull()
    })

    it('should return null if config file does not exist', async () => {
      existsSync.mockReturnValue(false)
      const config = await getProjectConfig('/app')
      expect(config).toBeNull()
    })

    it('should return null if file read fails', async () => {
      existsSync.mockReturnValue(true)
      readFile.mockRejectedValue(new Error('Fail'))
      const config = await getProjectConfig('/app')
      expect(config).toBeNull()
    })
  })

  describe('saveProjectConfig', () => {
    it('should write config to file', async () => {
      await saveProjectConfig({ subdomain: 'test' }, '/app')
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.launchpd.json'),
        expect.stringContaining('"subdomain": "test"'),
        'utf8'
      )
    })
  })

  describe('initProjectConfig', () => {
    it('should initialize new config', async () => {
      await initProjectConfig('new-site', '/app')
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.launchpd.json'),
        expect.stringContaining('"subdomain": "new-site"'),
        'utf8'
      )
    })
  })

  describe('updateProjectConfig', () => {
    it('should update existing config', async () => {
      existsSync.mockReturnValue(true)
      readFile.mockResolvedValue('{"subdomain": "old", "createdAt": "date"}')

      await updateProjectConfig({ subdomain: 'new' }, '/app')

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.launchpd.json'),
        expect.stringContaining('"subdomain": "new"'),
        'utf8'
      )
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.launchpd.json'),
        expect.stringContaining('"createdAt": "date"'),
        'utf8'
      )
    })

    it('should return null if no project root found', async () => {
      const result = await updateProjectConfig({ subdomain: 'new' }, null)
      expect(result).toBeNull()
    })
  })
})
