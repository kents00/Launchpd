import * as localConfig from '../src/utils/localConfig.js'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

vi.mock('node:fs')
vi.mock('node:fs/promises')
vi.mock('node:os')
vi.mock('node:path')

describe('localConfig', () => {
  const mockHome = '/mock/home'
  const mockConfigDir = '/mock/home/.staticlaunch'
  const mockDeploymentsPath = '/mock/home/.staticlaunch/deployments.json'

  beforeEach(() => {
    vi.clearAllMocks()
    os.homedir.mockReturnValue(mockHome)
    path.join.mockImplementation((...args) => args.join('/'))
  })

  describe('saveLocalDeployment', () => {
    it('should create config dir and save deployment if does not exist', async () => {
      fs.existsSync.mockReturnValue(false) // config dir missing, then file missing
      fsp.readFile.mockRejectedValue(new Error('ENOENT')) // file missing

      const deployment = { subdomain: 'test', version: 1 }
      await localConfig.saveLocalDeployment(deployment)

      expect(fsp.mkdir).toHaveBeenCalledWith(mockConfigDir, {
        recursive: true
      })
      expect(fsp.writeFile).toHaveBeenCalledWith(
        mockDeploymentsPath,
        expect.stringContaining('"subdomain": "test"'),
        'utf-8'
      )
    })

    it('should append to existing deployments', async () => {
      fs.existsSync.mockReturnValue(true)
      fsp.readFile.mockResolvedValue(
        JSON.stringify({
          version: 1,
          deployments: [{ subdomain: 'old' }]
        })
      )

      const deployment = { subdomain: 'new', version: 2 }
      await localConfig.saveLocalDeployment(deployment)

      expect(fsp.writeFile).toHaveBeenCalledWith(
        mockDeploymentsPath,
        expect.stringContaining('"subdomain": "new"'),
        'utf-8'
      )
    })
  })

  describe('getLocalDeployments', () => {
    it('should return empty array if file does not exist', async () => {
      fs.existsSync.mockReturnValue(false)
      const deps = await localConfig.getLocalDeployments()
      expect(deps).toEqual([])
    })

    it('should return empty array if file is corrupt', async () => {
      fs.existsSync.mockReturnValue(true)
      fsp.readFile.mockResolvedValue('invalid json')
      const deps = await localConfig.getLocalDeployments()
      expect(deps).toEqual([])
    })

    it('should return deployments from file', async () => {
      fs.existsSync.mockReturnValue(true)
      const mockData = { version: 1, deployments: [{ id: 1 }] }
      fsp.readFile.mockResolvedValue(JSON.stringify(mockData))
      const deps = await localConfig.getLocalDeployments()
      expect(deps).toEqual(mockData.deployments)
    })
  })

  describe('clearLocalDeployments', () => {
    it('should overwrite file with empty deployments', async () => {
      await localConfig.clearLocalDeployments()
      expect(fsp.writeFile).toHaveBeenCalledWith(
        mockDeploymentsPath,
        JSON.stringify({ version: 1, deployments: [] }, null, 2),
        'utf-8'
      )
    })
  })
})
