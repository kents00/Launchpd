<<<<<<< HEAD

import { deploy } from '../src/commands/deploy.js';
import * as validator from '../src/utils/validator.js';
import * as upload from '../src/utils/upload.js';
import * as metadata from '../src/utils/metadata.js';
import * as api from '../src/utils/api.js';
import * as logger from '../src/utils/logger.js';
import * as quota from '../src/utils/quota.js';
import { getProjectConfig, findProjectRoot } from '../src/utils/projectConfig.js';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import * as credentials from '../src/utils/credentials.js';
=======
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { deploy } from '../src/commands/deploy.js'
import * as validator from '../src/utils/validator.js'
import * as upload from '../src/utils/upload.js'
import * as metadata from '../src/utils/metadata.js'
import * as api from '../src/utils/api.js'
import * as logger from '../src/utils/logger.js'
import * as quota from '../src/utils/quota.js'
import {
  getProjectConfig,
  findProjectRoot
} from '../src/utils/projectConfig.js'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
>>>>>>> e997300adc10b3ecfa47a3ff5cd0df3addff2d35

// Mock everything
// Mock node:fs with actual fallbacks to prevent breaking top-level reads like package.json
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    statSync: vi.fn()
  }
})
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual('node:fs/promises')
  return {
    ...actual,
    readdir: vi.fn()
  }
})
vi.mock('../src/utils/upload.js')
vi.mock('../src/utils/metadata.js')
vi.mock('../src/utils/api.js')
vi.mock('../src/utils/logger.js')
vi.mock('../src/utils/quota.js')
vi.mock('../src/utils/validator.js')
vi.mock('../src/utils/prompt.js', () => ({
  prompt: vi.fn().mockResolvedValue(''),
  confirm: vi.fn().mockResolvedValue(true)
}))
vi.mock('../src/utils/projectConfig.js', () => ({
  getProjectConfig: vi.fn().mockResolvedValue(null),
  findProjectRoot: vi.fn().mockReturnValue(null),
  updateProjectConfig: vi.fn().mockResolvedValue({}),
  initProjectConfig: vi.fn().mockResolvedValue({})
}))
vi.mock('../src/utils/localConfig.js', () => ({
  saveLocalDeployment: vi.fn().mockResolvedValue({})
}))
vi.mock('../src/utils/expiration.js', () => ({
  calculateExpiresAt: vi.fn().mockReturnValue(new Date()),
  formatTimeRemaining: vi.fn().mockReturnValue('1h')
}))
vi.mock('../src/utils/credentials.js', () => ({
  getCredentials: vi.fn().mockResolvedValue({ email: 'test@example.com' })
}))

describe('deploy command', () => {
  let exitMock

  beforeEach(() => {
    vi.clearAllMocks()
    exitMock = vi.spyOn(process, 'exit').mockImplementation(() => {})

    // Default mocks
    vi.mocked(logger.spinner).mockReturnValue({
      succeed: vi.fn(),
      fail: vi.fn(),
      update: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      stop: vi.fn()
    })
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readdir).mockResolvedValue([
      {
        isFile: () => true,
        isDirectory: () => false,
        name: 'index.html',
        path: '/test'
      }
    ])
    vi.mocked(validator.validateStaticOnly).mockResolvedValue({
      success: true,
      violations: []
    })
    vi.mocked(quota.checkQuota).mockResolvedValue({
      allowed: true,
      warnings: []
    })
    vi.mocked(api.getNextVersionFromAPI).mockResolvedValue(1)
    vi.mocked(upload.uploadFolder).mockResolvedValue({
      uploaded: 1,
      totalBytes: 100
    })
    vi.mocked(upload.finalizeUpload).mockResolvedValue({ success: true })
  })

  afterEach(() => {
    exitMock.mockRestore()
  })

  // Reset mocks to default state to avoid pollution
  beforeEach(() => {
    vi.mocked(getProjectConfig).mockResolvedValue(null)
    vi.mocked(findProjectRoot).mockReturnValue(null)
  })

  it('should perform a full successful deployment', async () => {
    await deploy('./test-folder', {
      name: 'my-site',
      message: 'test deployment'
    })

    expect(upload.uploadFolder).toHaveBeenCalled()
    expect(upload.finalizeUpload).toHaveBeenCalledWith(
      'my-site',
      1,
      expect.any(Number),
      expect.any(Number),
      expect.any(String),
      null,
      'test deployment'
    )
    expect(logger.success).toHaveBeenCalledWith(
      expect.stringContaining('Deployed successfully')
    )
  })

  it('should exit if folder does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false)

    await deploy('./non-existent', {})

    expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
      expect.stringContaining('Folder not found'),
      expect.anything(),
      expect.anything()
    )
    expect(exitMock).toHaveBeenCalledWith(1)
  })

  it('should exit if folder is empty', async () => {
    vi.mocked(readdir).mockResolvedValue([])

    await deploy('./empty', {})

    expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
      expect.stringContaining('Nothing to deploy'),
      expect.anything(),
      expect.anything()
    )
    expect(exitMock).toHaveBeenCalledWith(1)
  })

  it('should exit if quota check fails', async () => {
    vi.mocked(quota.checkQuota).mockResolvedValue({
      allowed: false,
      warnings: ['Out of space']
    })

    await deploy('./test', {})

    expect(exitMock).toHaveBeenCalledWith(1)
  })

  it('should exit if static-only validation fails', async () => {
    vi.mocked(validator.validateStaticOnly).mockResolvedValue({
      success: false,
      violations: ['package.json', 'src/api.py']
    })

    await deploy('./test', {})

    expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
      expect.stringContaining('contains files that are not allowed'),
      expect.arrayContaining([
        expect.stringContaining('package.json'),
        expect.stringContaining('src/api.py')
      ]),
      expect.anything()
    )
    expect(exitMock).toHaveBeenCalledWith(1)
  })

  it('should generate a QR code when --qr option is provided', async () => {
    const QRCode = await import('qrcode')
    const toStringSpy = vi
      .spyOn(QRCode.default, 'toString')
      .mockResolvedValue('MOCK_QR_CODE')

    await deploy('./test-folder', {
      name: 'my-site',
      message: 'test qr',
      qr: true
    })

    expect(toStringSpy).toHaveBeenCalledWith(
      expect.stringContaining('my-site.launchpd.cloud'),
      expect.objectContaining({ type: 'terminal', small: true })
    )
    toStringSpy.mockRestore()
  })

  describe('Prompts and User Interaction', () => {
    it('should prompt to update project config if subdomain mismatches', async () => {
      const { prompt } = await import('../src/utils/prompt.js')
      const { getProjectConfig, updateProjectConfig, findProjectRoot } =
        await import('../src/utils/projectConfig.js')

      vi.mocked(findProjectRoot).mockReturnValue('/root')
      vi.mocked(getProjectConfig).mockResolvedValue({ subdomain: 'old-site' })
      vi.mocked(prompt).mockResolvedValue('yes')

      await deploy('./test-folder', { name: 'new-site', message: 'test' })

      expect(prompt).toHaveBeenCalledWith(
        expect.stringContaining('Would you like to update')
      )
      expect(updateProjectConfig).toHaveBeenCalledWith(
        { subdomain: 'new-site' },
        '/root'
      )
    })

    it('should NOT prompt update if --yes is passed', async () => {
      const { getProjectConfig, updateProjectConfig, findProjectRoot } =
        await import('../src/utils/projectConfig.js')

      vi.mocked(findProjectRoot).mockReturnValue('/root')
      vi.mocked(getProjectConfig).mockResolvedValue({ subdomain: 'old-site' })

      await deploy('./test-folder', {
        name: 'new-site',
        message: 'test',
        yes: true
      })

      expect(updateProjectConfig).toHaveBeenCalledWith(
        { subdomain: 'new-site' },
        '/root'
      )
    })

    it('should prompt to init if no config exists and name is provided', async () => {
      const { prompt } = await import('../src/utils/prompt.js')
      const { initProjectConfig, findProjectRoot } =
        await import('../src/utils/projectConfig.js')

      vi.mocked(findProjectRoot).mockReturnValue('/root')
      vi.mocked(prompt).mockResolvedValue('yes')

      await deploy('./test-folder', { name: 'new-site', message: 'test' })

      expect(prompt).toHaveBeenCalledWith(
        expect.stringContaining('Run "launchpd init"')
      )
      expect(initProjectConfig).toHaveBeenCalledWith(
        'new-site',
        expect.anything()
      )
    })
  })

  describe('Validation and Quota with Force', () => {
    it('should proceed if validation fails but --force is used', async () => {
      vi.mocked(validator.validateStaticOnly).mockResolvedValue({
        success: false,
        violations: ['bad.php']
      })

      // Should NOT exit
      await deploy('./test-folder', {
        name: 'site',
        message: 'test',
        force: true
      })

      expect(logger.spinner().warn).toHaveBeenCalledWith(
        expect.stringContaining('proceeding due to --force')
      )
      expect(upload.uploadFolder).toHaveBeenCalled()
    })

    it('should proceed if quota check fails but --force is used', async () => {
      vi.mocked(quota.checkQuota).mockResolvedValue({
        allowed: false,
        warnings: ['Full']
      })

      await deploy('./test-folder', {
        name: 'site',
        message: 'test',
        force: true
      })

      expect(logger.spinner().warn).toHaveBeenCalledWith(
        expect.stringContaining('proceeding due to --force')
      )
      expect(upload.uploadFolder).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle MaintenanceError', async () => {
      const { MaintenanceError } = await import('../src/utils/api.js')
      vi.mocked(upload.uploadFolder).mockRejectedValue(
        new MaintenanceError('Down')
      )

      await deploy('./test', { name: 'site', message: 'test' })

      expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
        expect.stringContaining('under maintenance'),
        expect.anything(),
        expect.anything()
      )
      expect(exitMock).toHaveBeenCalledWith(1)
    })

    it('should handle NetworkError', async () => {
      const { NetworkError } = await import('../src/utils/api.js')
      vi.mocked(upload.uploadFolder).mockRejectedValue(new NetworkError('Net'))

      await deploy('./test', { name: 'site', message: 'test' })

      expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
        expect.stringContaining('Unable to connect'),
        expect.anything(),
        expect.anything()
      )
      expect(exitMock).toHaveBeenCalledWith(1)
    })

    it('should handle AuthError', async () => {
      const { AuthError } = await import('../src/utils/api.js')
      vi.mocked(upload.uploadFolder).mockRejectedValue(new AuthError('401'))

      await deploy('./test', { name: 'site', message: 'test' })

      expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
        expect.stringContaining('Authentication failed'),
        expect.anything(),
        expect.anything()
      )
      expect(exitMock).toHaveBeenCalledWith(1)
    })

    it('should handle generic errors', async () => {
      vi.mocked(upload.uploadFolder).mockRejectedValue(new Error('Unknown'))

      await deploy('./test', { name: 'site', message: 'test' })

<<<<<<< HEAD
            expect(logger.errorWithSuggestions).toHaveBeenCalledWith(expect.stringContaining('Upload failed: Unknown'), expect.anything(), expect.anything());
            expect(exitMock).toHaveBeenCalledWith(1);
        });
    });

    describe('CLI Flags and Options', () => {


        it('should show anonymous warnings if not logged in', async () => {
            vi.mocked(credentials.getCredentials).mockResolvedValue({}); // No email
            const { log } = await import('../src/utils/logger.js');

            await deploy('./test-folder', { message: 'test' });

            expect(logger.warning).toHaveBeenCalledWith(expect.stringContaining('Anonymous deployment limits'));
        });
    });

    describe('Detailed Error Suggestions', () => {
        it('should suggest clean up for 413 Payload Too Large', async () => {
            vi.mocked(upload.uploadFolder).mockRejectedValue(new Error('413 Payload Too Large'));

            await deploy('./test', { message: 'test' });

            expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
                expect.any(String),
                expect.arrayContaining([expect.stringContaining('deploying fewer')]),
                expect.anything()
            );
        });

        it('should suggest waiting for 429 Too Many Requests', async () => {
            vi.mocked(upload.uploadFolder).mockRejectedValue(new Error('429 Too Many Requests'));

            await deploy('./test', { message: 'test' });

            expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
                expect.any(String),
                expect.arrayContaining([expect.stringContaining('Wait a few minutes')]),
                expect.anything()
            );
        });

        it('should suggest checking connection for fetch errors', async () => {
            vi.mocked(upload.uploadFolder).mockRejectedValue(new Error('fetch failed'));

            await deploy('./test', { message: 'test' });

            expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
                expect.any(String),
                expect.arrayContaining([expect.stringContaining('internet connection')]),
                expect.anything()
            );
        });
    });
});
=======
      expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
        expect.stringContaining('Upload failed: Unknown'),
        expect.anything(),
        expect.anything()
      )
      expect(exitMock).toHaveBeenCalledWith(1)
    })
  })
})
>>>>>>> e997300adc10b3ecfa47a3ff5cd0df3addff2d35
