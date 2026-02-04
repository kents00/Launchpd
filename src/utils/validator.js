import { readdir } from 'node:fs/promises';
import { extname } from 'node:path';
import { isIgnored } from './ignore.js';

// Allowed static file extensions
const ALLOWED_EXTENSIONS = new Set([
    '.html', '.htm',
    '.css', '.scss', '.sass',
    '.js', '.mjs', '.cjs',
    '.json', '.jsonld',
    '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.avif',
    '.woff', '.woff2', '.ttf', '.otf', '.eot',
    '.mp4', '.webm', '.ogg', '.mp3', '.wav', '.flac',
    '.pdf', '.txt', '.md', '.xml', '.yaml', '.yml'
]);

// Forbidden indicators (frameworks, build tools, backend code)
const FORBIDDEN_INDICATORS = new Set([
    // Build systems & Frameworks
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'node_modules',
    'composer.json',
    'vendor',
    'requirements.txt',
    'Gemfile',
    'Makefile',
    'tsconfig.json',
    'next.config.js',
    'nuxt.config.js',
    'svelte.config.js',
    'vite.config.js',
    'webpack.config.js',
    'rollup.config.js',
    'angular.json',

    // Backend/Source
    '.jsx', '.tsx', '.ts', '.vue', '.svelte', '.php', '.py', '.rb', '.go', '.rs', '.java', '.cs', '.cpp', '.c',
    '.env', '.env.local', '.env.production',
    '.dockerfile', 'docker-compose.yml',

    // Hidden/System
    '.git', '.svn', '.hg'
]);

/**
 * Validates that a folder contains ONLY static files.
 * @param {string} folderPath
 * @returns {Promise<{success: boolean, violations: string[]}>}
 */
export async function validateStaticOnly(folderPath) {
    const violations = [];

    try {
        const files = await readdir(folderPath, { recursive: true, withFileTypes: true });

        for (const file of files) {
            const fileName = file.name.toLowerCase();
            const ext = extname(fileName);

            // 1. Check if the file/dir itself is a forbidden indicator
            if (FORBIDDEN_INDICATORS.has(fileName) || FORBIDDEN_INDICATORS.has(ext)) {
                violations.push(file.name);
                continue;
            }

            // 2. Skip ignored files and directories
            if (isIgnored(fileName, file.isDirectory())) {
                continue;
            }

            // 2. Check extension for non-allowed types (only for files)
            if (file.isFile()) {
                // Ignore files without extensions or if they start with a dot (but handle indicators above)
                if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
                    violations.push(file.name);
                }
            }
        }

        return {
            success: violations.length === 0,
            violations: [...new Set(violations)] // Deduplicate
        };
    } catch (err) {
        throw new Error("Failed to validate folder: " + err.message);
    }
}
