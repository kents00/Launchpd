import { customAlphabet } from 'nanoid';

/**
 * Generate a subdomain-safe unique ID
 * Uses lowercase alphanumeric characters only (valid for DNS)
 * 12 characters provides ~62 bits of entropy
 */
const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
const nanoid = customAlphabet(alphabet, 12);

/**
 * Generate a unique subdomain ID
 * @returns {string} A 12-character lowercase alphanumeric string
 */
export function generateSubdomain() {
    return nanoid();
}
