import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deploy } from '../src/commands/deploy.js';
import * as validator from '../src/utils/validator.js';
import * as upload from '../src/utils/upload.js';
import * as metadata from '../src/utils/metadata.js';
import * as api from '../src/utils/api.js';
import * as logger from '../src/utils/logger.js';
import * as quota from '../src/utils/quota.js';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';

// Mock everything
// Mock node:fs with actual fallbacks to prevent breaking top-level reads like package.json
vi.mock('node:fs', async () => {
    const actual = await vi.importActual('node:fs');
    return {
        ...actual,
        existsSync: vi.fn(),
        statSync: vi.fn(),
    };
});
vi.mock('node:fs/promises', async () => {
    const actual = await vi.importActual('node:fs/promises');
    return {
        ...actual,
        readdir: vi.fn(),
    };
});
vi.mock('../src/utils/upload.js');
vi.mock('../src/utils/metadata.js');
vi.mock('../src/utils/api.js');
vi.mock('../src/utils/logger.js');
vi.mock('../src/utils/quota.js');
vi.mock('../src/utils/validator.js');
vi.mock('../src/utils/prompt.js', () => ({
    prompt: vi.fn().mockResolvedValue(''),
    confirm: vi.fn().mockResolvedValue(true)
}));
vi.mock('../src/utils/projectConfig.js', () => ({
    getProjectConfig: vi.fn().mockResolvedValue(null),
    findProjectRoot: vi.fn().mockReturnValue(null),
    updateProjectConfig: vi.fn().mockResolvedValue({}),
    initProjectConfig: vi.fn().mockResolvedValue({})
}));
vi.mock('../src/utils/localConfig.js', () => ({
    saveLocalDeployment: vi.fn().mockResolvedValue({})
}));
vi.mock('../src/utils/expiration.js', () => ({
    calculateExpiresAt: vi.fn().mockReturnValue(new Date()),
    formatTimeRemaining: vi.fn().mockReturnValue('1h')
}));
vi.mock('../src/utils/credentials.js', () => ({
    getCredentials: vi.fn().mockResolvedValue({ email: 'test@example.com' })
}));

describe('deploy command', () => {
    let exitMock;

    beforeEach(() => {
        vi.clearAllMocks();
        exitMock = vi.spyOn(process, 'exit').mockImplementation(() => { });

        // Default mocks
        vi.mocked(logger.spinner).mockReturnValue({
            succeed: vi.fn(),
            fail: vi.fn(),
            update: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            stop: vi.fn(),
        });
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readdir).mockResolvedValue([
            { isFile: () => true, isDirectory: () => false, name: 'index.html', path: '/test' }
        ]);
        vi.mocked(validator.validateStaticOnly).mockResolvedValue({ success: true, violations: [] });
        vi.mocked(quota.checkQuota).mockResolvedValue({ allowed: true, warnings: [] });
        vi.mocked(api.getNextVersionFromAPI).mockResolvedValue(1);
        vi.mocked(upload.uploadFolder).mockResolvedValue({ uploaded: 1, totalBytes: 100 });
        vi.mocked(upload.finalizeUpload).mockResolvedValue({ success: true });
    });

    afterEach(() => {
        exitMock.mockRestore();
    });

    it('should perform a full successful deployment', async () => {
        await deploy('./test-folder', { name: 'my-site', message: 'test deployment' });

        expect(upload.uploadFolder).toHaveBeenCalled();
        expect(upload.finalizeUpload).toHaveBeenCalledWith(
            'my-site',
            1,
            expect.any(Number),
            expect.any(Number),
            expect.any(String),
            null,
            'test deployment'
        );
        expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('Deployed successfully'));
    });

    it('should exit if folder does not exist', async () => {
        vi.mocked(existsSync).mockReturnValue(false);

        await deploy('./non-existent', {});

        expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
            expect.stringContaining('Folder not found'),
            expect.anything(),
            expect.anything()
        );
        expect(exitMock).toHaveBeenCalledWith(1);
    });

    it('should exit if folder is empty', async () => {
        vi.mocked(readdir).mockResolvedValue([]);

        await deploy('./empty', {});

        expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
            expect.stringContaining('Nothing to deploy'),
            expect.anything(),
            expect.anything()
        );
        expect(exitMock).toHaveBeenCalledWith(1);
    });

    it('should exit if quota check fails', async () => {
        vi.mocked(quota.checkQuota).mockResolvedValue({ allowed: false, warnings: ['Out of space'] });

        await deploy('./test', {});

        expect(exitMock).toHaveBeenCalledWith(1);
    });

    it('should exit if static-only validation fails', async () => {
        vi.mocked(validator.validateStaticOnly).mockResolvedValue({
            success: false,
            violations: ['package.json', 'src/api.py']
        });

        await deploy('./test', {});

        expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
            expect.stringContaining('contains files that are not allowed'),
            expect.arrayContaining([
                expect.stringContaining('package.json'),
                expect.stringContaining('src/api.py')
            ]),
            expect.anything()
        );
        expect(exitMock).toHaveBeenCalledWith(1);
    });

    it('should generate a QR code when --qr option is provided', async () => {
        const QRCode = await import('qrcode');
        const toStringSpy = vi.spyOn(QRCode.default, 'toString').mockResolvedValue('MOCK_QR_CODE');

        await deploy('./test-folder', { name: 'my-site', message: 'test qr', qr: true });

        expect(toStringSpy).toHaveBeenCalledWith(
            expect.stringContaining('my-site.launchpd.cloud'),
            expect.objectContaining({ type: 'terminal', small: true })
        );
        toStringSpy.mockRestore();
    });
});
