# Launchpd

Deploy static sites instantly to a live URL. No config, no complexity.

## Quick Start

```bash
npm install -g launchpd
launchpd deploy ./my-site
```

## Installation

```bash
npm install -g launchpd
```

Requires Node.js 20 or higher.

## Usage

### Deploy a folder

```bash
launchpd deploy ./my-folder
```

### Use a custom subdomain

```bash
launchpd deploy ./my-folder --name my-project
```

### Set expiration time

```bash
launchpd deploy ./my-folder --expires 2h
# Auto-deletes after 2 hours
```

### Dry run (preview without uploading)

```bash
launchpd deploy ./my-folder --dry-run
```

### List your deployments

```bash
launchpd list
```

### View version history

```bash
launchpd versions my-subdomain
```

### Rollback to previous version

```bash
launchpd rollback my-subdomain
launchpd rollback my-subdomain --to 2
```

## Authentication

### Register for a free account

```bash
launchpd register
```

### Login with your API key

```bash
launchpd login
```

### Check current user and quota

```bash
launchpd whoami
launchpd quota
```

### Logout

```bash
launchpd logout
```

## Tier Limits

| Feature | Anonymous | Free (Registered) |
|---------|-----------|-------------------|
| Sites | 3 | 10 |
| Storage | 50MB | 100MB |
| Retention | 7 days | 30 days |
| Versions | 1 | 10 |


## Support

- [Report issues](https://github.com/kents00/launchpd/issues)
- [Documentation](https://launchpd.cloud/docs)

## License

MIT

# Launchpd
public urls for localhost
