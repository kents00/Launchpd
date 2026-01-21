import { createHash } from 'node:crypto';
import { hostname, platform, arch, userInfo } from 'node:os';

/**
 * Generate a unique machine identifier based on system traits.
 * Uses SHA-256 to hash a combination of hostname, platform, architecture, and username.
 * This provides a persistent ID even if the IP address changes.
 *
 * @returns {string} Hex string of the machine ID hash
 */
export function getMachineId() {
    try {
        const parts = [
            hostname(),
            platform(),
            arch(),
            userInfo().username
        ];

        const rawId = parts.join('|');
        return createHash('sha256').update(rawId).digest('hex');
    } catch (err) {
        // Fallback if userInfo() fails (e.g. restricted environments)
        // Use a random ID for this session, better than crashing
        console.warn('Could not generate stable machine ID:', err.message);
        return 'unknown-device-' + Math.random().toString(36).substring(2);
    }
}
