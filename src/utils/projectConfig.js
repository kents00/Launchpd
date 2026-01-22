import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const PROJECT_CONFIG_FILE = '.launchpd.json';

/**
 * Find project root by looking for .launchpd.json upwards
 */
export function findProjectRoot(startDir = process.cwd()) {
    let current = resolve(startDir);
    while (true) {
        if (existsSync(join(current, PROJECT_CONFIG_FILE))) {
            return current;
        }
        const parent = resolve(current, '..');
        if (parent === current) return null;
        current = parent;
    }
}

/**
 * Get project configuration
 */
export async function getProjectConfig(projectDir = findProjectRoot()) {
    if (!projectDir) return null;

    const configPath = join(projectDir, PROJECT_CONFIG_FILE);
    try {
        if (existsSync(configPath)) {
            const content = await readFile(configPath, 'utf8');
            return JSON.parse(content);
        }
    } catch (err) {
        // Silently fail or handle corrupted config
    }
    return null;
}

/**
 * Save project configuration
 */
export async function saveProjectConfig(config, projectDir = process.cwd()) {
    const configPath = join(projectDir, PROJECT_CONFIG_FILE);
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    return configPath;
}

/**
 * Initialize a new project config
 */
export async function initProjectConfig(subdomain, projectDir = process.cwd()) {
    const config = {
        subdomain,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    return await saveProjectConfig(config, projectDir);
}
