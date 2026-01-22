import { describe, it, expect, vi } from 'vitest';
import { validateStaticOnly } from '../src/utils/validator.js';
import { readdir } from 'node:fs/promises';

vi.mock('node:fs/promises');

describe('validateStaticOnly', () => {
    it('should pass for a clean static site', async () => {
        vi.mocked(readdir).mockResolvedValue([
            { isFile: () => true, name: 'index.html' },
            { isFile: () => true, name: 'styles.css' },
            { isFile: () => true, name: 'script.js' },
            { isFile: () => false, name: 'assets' }
        ]);

        const result = await validateStaticOnly('/fake/path');
        expect(result.success).toBe(true);
        expect(result.violations).toHaveLength(0);
    });

    it('should fail for forbidden files like package.json', async () => {
        vi.mocked(readdir).mockResolvedValue([
            { isFile: () => true, name: 'index.html' },
            { isFile: () => true, name: 'package.json' }
        ]);

        const result = await validateStaticOnly('/fake/path');
        expect(result.success).toBe(false);
        expect(result.violations).toContain('package.json');
    });

    it('should fail for forbidden extensions like .py or .php', async () => {
        vi.mocked(readdir).mockResolvedValue([
            { isFile: () => true, name: 'index.html' },
            { isFile: () => true, name: 'api.py' },
            { isFile: () => true, name: 'server.php' }
        ]);

        const result = await validateStaticOnly('/fake/path');
        expect(result.success).toBe(false);
        expect(result.violations).toContain('api.py');
        expect(result.violations).toContain('server.php');
    });

    it('should fail for hidden folders like .git', async () => {
        vi.mocked(readdir).mockResolvedValue([
            { isFile: () => true, name: 'index.html' },
            { isFile: () => false, name: '.git' }
        ]);

        const result = await validateStaticOnly('/fake/path');
        expect(result.success).toBe(false);
        expect(result.violations).toContain('.git');
    });

    it('should fail for non-static files like .jsx or .ts', async () => {
        vi.mocked(readdir).mockResolvedValue([
            { isFile: () => true, name: 'App.jsx' },
            { isFile: () => true, name: 'index.html' }
        ]);

        const result = await validateStaticOnly('/fake/path');
        expect(result.success).toBe(false);
        expect(result.violations).toContain('App.jsx');
    });

    it('should handle nested violations correctly', async () => {
        vi.mocked(readdir).mockResolvedValue([
            { isFile: () => true, name: 'index.html' },
            { isFile: () => true, name: 'node_modules/lodash/index.js' },
            { isFile: () => false, name: 'node_modules' }
        ]);

        const result = await validateStaticOnly('/fake/path');
        expect(result.success).toBe(false);
        expect(result.violations).toContain('node_modules');
    });
});
