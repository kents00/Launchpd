import 'dotenv/config';

/**
 * Application configuration loaded from environment variables
 */
export const config = {
    r2: {
        accountId: process.env.R2_ACCOUNT_ID || '',
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        bucketName: process.env.R2_BUCKET_NAME || 'launchpd',
    },

    // Base domain for deployments
    domain: process.env.STATICLAUNCH_DOMAIN || 'launchpd.cloud',
};

/**
 * Validate required configuration
 * @returns {boolean} true if all required config is present
 */
export function validateConfig() {
    const required = [
        'R2_ACCOUNT_ID',
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        return { valid: false, missing };
    }

    return { valid: true, missing: [] };
}
