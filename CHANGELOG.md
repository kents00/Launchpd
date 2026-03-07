# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-03-08

### Added

- **Deploy from GitHub URL**: Deploy directly from GitHub repos and Gists without cloning first.
  ```bash
  launchpd deploy https://gist.github.com/user/abc123 -m "From gist"
  launchpd deploy https://github.com/user/repo --branch main --dir dist -m "From repo"
  ```
- **`--branch` option**: Specify a Git branch to deploy from for repo URLs.
- **`--dir` option**: Deploy a specific subdirectory within a repo.
- **Parallel Gist Downloads**: Truncated gist files download in batches of 5 concurrently for faster fetches.
- **Skip Ignored During Extraction**: Files like `node_modules` and `.git` are skipped during tarball extraction, reducing disk I/O.
- **New dependency**: Added `tar` (^7.4.0) for tarball extraction.
- **Exported constants**: `GIST_PARALLEL_LIMIT` and `FETCH_TIMEOUT_MS` are now part of the public API.

### Security

- **Path Traversal Prevention**: `--dir` values are validated to prevent directory escape (e.g., `../../etc`).
- **Download Size Limit**: Remote downloads are capped at 100MB via streaming byte counter and `Content-Length` pre-check.
- **Symlink Stripping**: Symbolic links and hard links in tarballs are rejected during extraction.
- **Tarball Bomb Protection**: Extraction enforces a maximum of 10,000 files and 50 levels of directory nesting.
- **Rate Limit Handling**: GitHub API 403 responses with `X-RateLimit-Remaining: 0` produce clear error messages with reset time.
- **Gist Filename Sanitization**: Filenames containing `..`, path separators, or null bytes are rejected.
- **Fetch Timeout**: All remote `fetch()` calls are protected by a 30-second `AbortController` timeout, preventing CLI hangs on slow or unresponsive servers.
- **SSRF Protection on `raw_url`**: Truncated gist file download URLs are validated against a trusted-domain allowlist (`gist.githubusercontent.com`, `raw.githubusercontent.com`) before fetching. Internal IPs, `localhost`, and arbitrary external domains are rejected.
- **Content-Type Validation on Tarballs**: Repo tarball responses with `text/html` or `application/json` Content-Type (e.g. GitHub login redirects) are rejected before extraction begins.
- **Enhanced Gist Filename Sanitization**: Expanded to also reject Windows reserved device names (`CON`, `NUL`, `AUX`, `PRN`, `COM1`–`COM9`, `LPT1`–`LPT9`) and filenames consisting only of dots (`.`, `...`).
- **Content-Length Pre-check for Raw Gist Files**: Truncated gist file downloads are aborted immediately if the reported `Content-Length` would push the total over the 100MB limit.

### Tests

- Added `remoteSource.test.js` (78 tests) covering URL parsing, gist/repo fetching, all security protections, SSRF, fetch timeouts, Content-Type validation, and Windows reserved filename checks — up from 37 tests.
- Added 8 remote URL deploy integration tests to `deploy.test.js`.
- Total test count: **420 tests across 26 files** (all passing).

## [1.0.5] - 2026-02-07

### Added

- **Test Coverage**: Achieved 100% logic coverage for `auth.js` to ensure login and registration reliability.

### Fixed

- **Static Analysis**: Resolved multiple linting issues and removed unnecessary code blocks as reported by Codacy and DeepSource.
- **Auth stability**: Fixed failing tests in `auth.test.js` related to process exit handling and mock assertions.

### Security

- **Credential Validation**: Strengthened internal checks for API key and token presence during CLI commands.

## [1.0.4] - 2026-02-04

### Added

- **Release Publishing**: Automated npm publishing via GitHub Releases.

### Fixed

- **Test Fixtures**: Updated mock API keys and client tokens to match strict validation formats.

### Security

- **Input Validation**: Added strict API key and client token format checks before network requests.

## [1.0.3] - 2026-02-03

### Added

- **2FA Support**: Added support for email-based Two-Factor Authentication status reporting.
- **Quota Visibility**: Included "site(s) remaining" information in deployment warnings to help users track usage.

### Fixed

- **Password Management**: Resolved integration issues with the password change API and route mismatches.
- **Config Robustness**: Improved configuration loading to handle missing files and test environment edge cases.
- **Quota Accuracy**: Fixed inaccurate site count reporting and improved data flow from the backend.
- **Test Stability**: Refactored test mocks to eliminate redundant async wrappers and improve reliability across environments.

### Security

- Enhanced validation for 2FA status checks.

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
