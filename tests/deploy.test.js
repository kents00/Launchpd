
import { deploy } from '../src/commands/deploy.js';
import * as validator from '../src/utils/validator.js';
import * as upload from '../src/utils/upload.js';
import * as api from '../src/utils/api.js';
import * as logger from '../src/utils/logger.js';
import * as quota from '../src/utils/quota.js';
import { getProjectConfig, findProjectRoot, updateProjectConfig, initProjectConfig } from '../src/utils/projectConfig.js';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import * as credentials from '../src/utils/credentials.js';
import { execFile } from 'node:child_process';
import * as metadata from '../src/utils/metadata.js';
import * as errors from '../src/utils/errors.js';
import { resolve } from 'node:path';
import * as prompt from '../src/utils/prompt.js';
import * as ignore from '../src/utils/ignore.js';
import * as expiration from '../src/utils/expiration.js';

// Mock everything
vi.mock('node:child_process');
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
vi.mock('../src/utils/ignore.js')
vi.mock('../src/utils/expiration.js')

describe('deploy command', () => {
  let exitMock

  beforeEach(() => {
    vi.clearAllMocks()
    exitMock = vi.spyOn(process, 'exit').mockImplementation(() => { })

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
    vi.mocked(credentials.getCredentials).mockResolvedValue({ email: 'test@example.com' })
    vi.mocked(quota.formatBytes).mockImplementation((b) => `${b} bytes`)
    vi.mocked(prompt.prompt).mockResolvedValue('')
    vi.mocked(prompt.confirm).mockResolvedValue(true)
    vi.mocked(ignore.isIgnored).mockReturnValue(false)
    vi.mocked(expiration.calculateExpiresAt).mockReturnValue(new Date())
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

  it('should show truncated list when there are more than 10 validation violations', async () => {
    vi.mocked(validator.validateStaticOnly).mockResolvedValue({
      success: false,
      violations: new Array(11).fill('bad-file.exe')
    });

    await deploy('./test', { message: 'test' });

    expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([expect.stringContaining('...and 1 more')]),
      expect.anything()
    );
    expect(exitMock).toHaveBeenCalledWith(1);
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

    it('should NOT update project config if user rejects subdomain mismatch prompt', async () => {
      vi.mocked(getProjectConfig).mockResolvedValue({ subdomain: 'old-site' });
      vi.mocked(prompt.prompt).mockResolvedValue('n');

      await deploy('./test-folder', { name: 'new-site', message: 'test' });

      expect(updateProjectConfig).not.toHaveBeenCalled();
    });

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

    it('should NOT initialize project if user rejects auto-init prompt', async () => {
      vi.mocked(getProjectConfig).mockResolvedValue(null);
      vi.mocked(prompt.prompt).mockResolvedValue('n');

      await deploy('./test-folder', { name: 'new-site', message: 'test' });

      expect(initProjectConfig).not.toHaveBeenCalled();
    });
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

      expect(logger.errorWithSuggestions).toHaveBeenCalledWith(expect.stringContaining('Upload failed: Unknown'), expect.anything(), expect.anything());
      expect(exitMock).toHaveBeenCalledWith(1);
    });

    it('should ignore non-file entries during size calculation and scanning', async () => {
      const mockFolderPath = resolve('./test');
      vi.mocked(readdir).mockResolvedValue([
        { isFile: () => true, isDirectory: () => false, name: 'normal.html', parentPath: mockFolderPath },
        { isFile: () => false, isDirectory: () => true, name: 'subdir', parentPath: mockFolderPath }
      ]);

      await deploy('./test', { name: 'site', message: 'test' });

      expect(upload.uploadFolder).toHaveBeenCalled();
    });

    it('should ignore files during size calculation', async () => {
      const mockFolderPath = resolve('./test');
      vi.mocked(readdir).mockResolvedValue([
        { isFile: () => true, isDirectory: () => false, name: 'normal.html', parentPath: mockFolderPath },
        { isFile: () => true, isDirectory: () => false, name: 'ignored.tmp', parentPath: mockFolderPath }
      ]);
      vi.mocked(ignore.isIgnored).mockImplementation((name) => name === 'ignored.tmp');

      await deploy('./test', { name: 'site', message: 'test' });

      // If it didn't crash and called upload, it handled the ignore correctly
      expect(upload.uploadFolder).toHaveBeenCalled();
    });
  });

  describe('CLI Flags and Options', () => {
    it('should exit on invalid expiration format', async () => {
      vi.mocked(expiration.calculateExpiresAt).mockImplementation(() => {
        throw new Error('Invalid format');
      });

      await deploy('./test', { message: 'test', expires: 'invalid' });

      expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
        'Invalid format',
        expect.any(Array),
        expect.anything()
      );
      expect(exitMock).toHaveBeenCalledWith(1);
    });

    it('should warn when anonymous user uses custom subdomain', async () => {
      vi.mocked(credentials.getCredentials).mockResolvedValue({});
      await deploy('./test', { name: 'custom-site', message: 'test' });
      expect(logger.warning).toHaveBeenCalledWith(expect.stringContaining('Custom subdomains require registration'));
    });

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


  describe('Subdomain and Config Logic', () => {
    it('should use subdomain from project config if no name is provided', async () => {
      vi.mocked(findProjectRoot).mockReturnValue('/root');
      vi.mocked(getProjectConfig).mockResolvedValue({ subdomain: 'config-site' });

      await deploy('./test', { message: 'test' });

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Using project subdomain: config-site'));
    });

    it('should succeed if subdomain is available', async () => {
      vi.mocked(api.checkSubdomainAvailable).mockResolvedValue(true);
      await deploy('./test', { name: 'available', message: 'test' });
      expect(logger.spinner().succeed).toHaveBeenCalledWith(expect.stringContaining('is available'));
    });

    it('should proceed if subdomain is taken but owned by user', async () => {
      vi.mocked(api.checkSubdomainAvailable).mockResolvedValue(false);
      vi.mocked(api.listSubdomains).mockResolvedValue({
        subdomains: [{ subdomain: 'my-site' }]
      });

      await deploy('./test', { name: 'my-site', message: 'test' });

      expect(logger.spinner().succeed).toHaveBeenCalledWith(expect.stringContaining('Deploying new version to your subdomain'));
    });

    it('should warn if subdomain availability check fails', async () => {
      vi.mocked(api.checkSubdomainAvailable).mockRejectedValue(new Error('Check Fail'));
      await deploy('./test', { name: 'fail-check', message: 'test' });
      expect(logger.spinner().warn).toHaveBeenCalledWith(expect.stringContaining('Could not verify subdomain availability'));
    });
  });

  describe('Version and Progress Logic', () => {
    it('should fallback to local getNextVersion if API returns null', async () => {
      vi.mocked(api.getNextVersionFromAPI).mockResolvedValue(null);
      vi.mocked(metadata.getNextVersion).mockResolvedValue(5);

      await deploy('./test', { name: 'site', message: 'test' });

      expect(metadata.getNextVersion).toHaveBeenCalledWith('site');
      expect(logger.spinner().succeed).toHaveBeenCalledWith(expect.stringContaining('Deploying as version 5'));
    });

    it('should trigger progress updates during upload', async () => {
      vi.mocked(upload.uploadFolder).mockImplementation(async (path, sub, ver, cb) => {
        cb(1, 2, 'file1.txt');
        return { totalBytes: 100 };
      });

      await deploy('./test', { name: 'site', message: 'test' });

      expect(logger.spinner().update).toHaveBeenCalledWith(expect.stringContaining('1/2 (file1.txt)'));
    });
  });

  describe('CLI Options and Platforms', () => {
    it('should open URL on Windows if --open is provided', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      await deploy('./test', { name: 'site', message: 'test', open: true });

      expect(execFile).toHaveBeenCalledWith('cmd', ['/c', 'start', '', expect.stringContaining('site.launchpd.cloud')]);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should open URL on Mac if --open is provided', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      await deploy('./test', { name: 'site', message: 'test', open: true });

      expect(execFile).toHaveBeenCalledWith('open', [expect.any(String)]);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should open URL on Linux if --open is provided', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });

      await deploy('./test', { name: 'site', message: 'test', open: true });

      expect(execFile).toHaveBeenCalledWith('xdg-open', [expect.stringContaining('site.launchpd.cloud')]);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should show expiration warning if --expires is used', async () => {
      await deploy('./test', { message: 'test', expires: '1h' });
      expect(logger.warning).toHaveBeenCalledWith(expect.stringContaining('Expires:'));
    });
  });

  describe('QR Code Edge Cases', () => {
    it('should warn if terminal is too narrow for QR code', async () => {
      const QRCode = await import('qrcode');
      vi.spyOn(QRCode.default, 'toString').mockResolvedValue('VERY_WIDE_QR_CODE_CONTENT');
      const originalColumns = process.stdout.columns;
      process.stdout.columns = 5; // Very narrow

      await deploy('./test', { message: 'test', qr: true });

      expect(logger.warning).toHaveBeenCalledWith(expect.stringContaining('Terminal is too narrow'));

      process.stdout.columns = originalColumns;
    });

    it('should handle QR code generation error', async () => {
      const QRCode = await import('qrcode');
      vi.spyOn(QRCode.default, 'toString').mockRejectedValue(new Error('QR Fail'));

      await deploy('./test', { message: 'test', qr: true });

      expect(logger.warning).toHaveBeenCalledWith(expect.stringContaining('Could not generate QR code'));
    });

    it('should show verbose error if QR generation fails and --verbose is used', async () => {
      const { raw } = await import('../src/utils/logger.js');
      const QRCode = (await import('qrcode')).default;
      vi.mocked(QRCode.toString).mockRejectedValue(new Error('QR Fail'));

      await deploy('./test', { message: 'test', qr: true, verbose: true });

      expect(raw).toHaveBeenCalledWith(expect.any(Error), 'error');
    });
  });

  describe('Standardized Error Handling', () => {
    it('should handle errors via handleCommonError', async () => {
      vi.mocked(api.getNextVersionFromAPI).mockRejectedValue(new Error('Common Fail'));
      const handleSpy = vi.spyOn(errors, 'handleCommonError').mockReturnValue(true);

      await deploy('./test', { message: 'test' });

      expect(handleSpy).toHaveBeenCalled();
      expect(exitMock).toHaveBeenCalledWith(1);
      handleSpy.mockRestore();
    });

    it('should handle common errors via handleCommonError and call its error callback', async () => {
      vi.mocked(api.getNextVersionFromAPI).mockRejectedValue(new Error('Common Fail'));
      const handleSpy = vi.spyOn(errors, 'handleCommonError').mockImplementation((err, callbacks) => {
        callbacks.error('Mocked Error Message');
        return true;
      });

      await deploy('./test', { message: 'test' });

      expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
        'Mocked Error Message',
        expect.any(Array),
        expect.anything()
      );
      expect(exitMock).toHaveBeenCalledWith(1);
      handleSpy.mockRestore();
    });

    it('should provide suggestions for Unauthorized/401 errors', async () => {
      vi.mocked(api.getNextVersionFromAPI).mockRejectedValue(new Error('401 Unauthorized'));

      await deploy('./test', { message: 'test' });

      expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([expect.stringContaining('launchpd login')]),
        expect.anything()
      );
    });
  });
});
