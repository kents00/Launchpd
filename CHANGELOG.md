# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
