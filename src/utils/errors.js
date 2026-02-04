/**
 * Custom error classes for LaunchPd CLI
 * Provides standardized error handling across all commands
 */

/**
 * Base API Error class
 */
export class APIError extends Error {
    constructor(message, statusCode = 500, data = {}) {
        super(message);
        this.name = 'APIError';
        this.statusCode = statusCode;
        this.data = data;
        this.isAPIError = true;
    }
}

/**
 * Maintenance mode error - thrown when backend is under maintenance
 */
export class MaintenanceError extends APIError {
    constructor(message = 'LaunchPd is under maintenance') {
        super(message, 503);
        this.name = 'MaintenanceError';
        this.isMaintenanceError = true;
    }
}

/**
 * Authentication error - thrown for 401 responses
 */
export class AuthError extends APIError {
    constructor(message = 'Authentication failed', data = {}) {
        super(message, 401, data);
        this.name = 'AuthError';
        this.isAuthError = true;
        this.requires2FA = data.requires_2fa || false;
        this.twoFactorType = data.two_factor_type || null;
    }
}

/**
 * Quota error - thrown when user exceeds limits
 */
export class QuotaError extends APIError {
    constructor(message = 'Quota exceeded', data = {}) {
        super(message, 429, data);
        this.name = 'QuotaError';
        this.isQuotaError = true;
    }
}

/**
 * Network error - thrown for connection failures
 */
export class NetworkError extends Error {
    constructor(message = 'Unable to connect to LaunchPd servers') {
        super(message);
        this.name = 'NetworkError';
        this.isNetworkError = true;
    }
}

/**
 * Two-factor authentication required error
 */
export class TwoFactorRequiredError extends APIError {
    constructor(twoFactorType = 'totp', message = 'Two-factor authentication required') {
        super(message, 200);
        this.name = 'TwoFactorRequiredError';
        this.isTwoFactorRequired = true;
        this.twoFactorType = twoFactorType;
    }
}

/**
 * Handle common errors with user-friendly messages
 * @param {Error} err - The error to handle
 * @param {object} logger - Logger with error, info, warning functions
 * @returns {boolean} - True if error was handled, false otherwise
 */
export function handleCommonError(err, logger) {
    const { error, info } = logger;

    if (err instanceof MaintenanceError || err.isMaintenanceError) {
        error('⚠️  LaunchPd is under maintenance');
        info('Please try again in a few minutes');
        info('Check status at: https://status.launchpd.cloud');
        return true;
    }

    if (err instanceof AuthError || err.isAuthError) {
        error('Authentication failed');
        info('Run "launchpd login" to authenticate');
        return true;
    }

    if (err instanceof NetworkError || err.isNetworkError) {
        error('Unable to connect to LaunchPd');
        info('Check your internet connection');
        info('If the problem persists, check https://status.launchpd.cloud');
        return true;
    }

    if (err instanceof QuotaError || err.isQuotaError) {
        error('Quota limit reached');
        info('Upgrade your plan or delete old deployments');
        info('Run "launchpd quota" to check your usage');
        return true;
    }

    return false;
}

export default {
    APIError: APIError,
    MaintenanceError: MaintenanceError,
    AuthError: AuthError,
    QuotaError: QuotaError,
    NetworkError: NetworkError,
    TwoFactorRequiredError: TwoFactorRequiredError,
    handleCommonError,
};
