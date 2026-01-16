# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-16

### Added
- Initial release
- `launchpd deploy` - Deploy a folder to a live URL
- `launchpd list` - List your past deployments
- `launchpd versions` - List all versions for a subdomain
- `launchpd rollback` - Rollback to a previous version
- `launchpd login` - Authenticate with API key
- `launchpd logout` - Clear stored credentials
- `launchpd register` - Open browser to create account
- `launchpd whoami` - Show current user info
- `launchpd quota` - Check quota and usage
- Expiration support with `--expires` flag
- Custom subdomain support with `--name` flag
- Dry run mode with `--dry-run` flag
- Anonymous and authenticated deployment tiers
- Version history and rollback capability
