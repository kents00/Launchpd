# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-01-24

### Added

- **Project Persistence**: Support for `.launchpd.json` to store project configurations, allowing for simpler deployments without repeating subdomains.
- **HMAC Security**: Implemented HMAC-based request signing for enhanced API security.
- **Deployment Messages**: Added `-m` or `--message` flag to the `deploy` command for version-specific descriptions.
- **Subdomain Status**: New `status` command to view linked project information and latest deployment details.
- **Project Initialization**: Added `launchpd init` to link folders to subdomains permanently.

### Fixed

- **Validation Refinement**: Fixed `isIgnored is not defined` error in the folder validator.
- **Crash Recovery**: Resolved a critical node crash (`UV_HANDLE_CLOSING` assertion) when initializing with a taken subdomain.
- **Auth Experience**: Masked API key input during the `login` process for better privacy.
- **Error Handling**: Improved error messages when subdomains are unavailable or validation fails.
- **Validation Precedence**: Adjusted the folder validator to prioritize forbidden indicators (like `.git` and `node_modules`) over ignore rules, ensuring security policies are strictly enforced.
- **Test Infrastructure**: Resolved multiple `TypeError` and argument mismatch issues in the test suite to ensure 100% test coverage and stability.
- **Expiration Stability**: Fixed flaky timing issues in the expiration utility tests.

### Security

- Mandatory static-only validation for all deployments.
- HMAC signature verification for all API requests.
- Secure masking of sensitive terminal inputs.

## [1.0.0] - 2026-01-22

### Added

- **Initial Release**
- `launchpd deploy`: Deploy static sites instantly to a global CDN
- `launchpd login`/`logout`: Manage your account
- `launchpd list`: View your deployments
- `launchpd versions`: Manage deployment history
- `launchpd rollback`: Instant rollback to previous versions
- `launchpd quota`: Check your usage limits
- IP-based anonymous limits (3 sites, 50MB storage, 7-day retention)
- Custom subdomains support (`--name`) with availability check
- Interactive deployment spinner and progress bar
- Automatic subdomain generation for anonymous users
- Secure API-based upload handling
- Production-ready email verification and registration flow

### Security

- Secure credentials storage
- API Key based authentication
- Hashed IP tracking for anonymous users
- Proxied file uploads via Worker API

### Tests

- Added `quota.test.js` (Anonymous limits & validation)
- Added `metadata.test.js` (Versioning & API mocks)
