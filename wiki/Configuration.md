# Configuration

Launchpd uses three levels of configuration: global app config, per-user credentials, and per-project settings.

---

## Global Configuration (`src/config.js`)

Hardcoded application defaults. Not user-configurable.

| Property | Value | Description |
|:---------|:------|:------------|
| `domain` | `launchpd.cloud` | Base domain for deployments |
| `apiUrl` | `https://api.launchpd.cloud` | API endpoint |
| `version` | from `package.json` | CLI version string |

---

## User Credentials (`~/.staticlaunch/`)

Stored in the user's home directory under `.staticlaunch/`.

### `credentials.json`

Created by `launchpd login`. File permissions set to `0600` (Unix).

```json
{
  "apiKey": "lpd_xxxxxxxxxxxxxxxx",
  "apiSecret": "xxxxxxxxxxxxxxxx",
  "userId": "user-uuid",
  "email": "user@example.com",
  "tier": "free",
  "savedAt": "2026-01-15T10:30:00.000Z"
}
```

| Field | Type | Description |
|:------|:-----|:------------|
| `apiKey` | string | API key (format: `lpd_[a-zA-Z0-9_-]{16,64}`) |
| `apiSecret` | string | HMAC signing secret |
| `userId` | string | Server user ID |
| `email` | string | Account email |
| `tier` | string | Account tier (e.g., `free`) |
| `savedAt` | string | ISO timestamp |

### `client-token.json`

Auto-created on first anonymous use. Used for quota tracking.

```json
{
  "token": "cli_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
}
```

Format: `cli_[a-f0-9]{32}`

### `deployments.json`

Local deployment history cache.

```json
{
  "version": 1,
  "deployments": [
    {
      "subdomain": "my-site",
      "folderPath": "/Users/me/projects/site",
      "fileCount": 12,
      "totalBytes": 45678,
      "version": 1,
      "deployedAt": "2026-01-15T10:30:00.000Z",
      "message": "Initial deploy"
    }
  ]
}
```

---

## Project Configuration (`.launchpd.json`)

Created by `launchpd init` in the project root. Links a directory to a subdomain.

```json
{
  "subdomain": "my-portfolio",
  "createdAt": "2026-01-15T10:30:00.000Z",
  "updatedAt": "2026-01-15T10:30:00.000Z"
}
```

| Field | Type | Description |
|:------|:-----|:------------|
| `subdomain` | string | Linked subdomain name |
| `createdAt` | string | ISO timestamp of initialization |
| `updatedAt` | string | ISO timestamp of last update |

### Project Root Detection

The CLI walks up from the current directory (or `--name`'s context) to find the nearest `.launchpd.json`. This allows running `launchpd deploy .` from subdirectories.

### Subdomain Resolution Priority

When deploying, the subdomain is resolved in this order:

1. `--name <subdomain>` flag (explicit)
2. `.launchpd.json` subdomain (project link)
3. Auto-generated random ID (12-char alphanumeric)

If `--name` conflicts with `.launchpd.json`, the user is prompted to choose.

---

## Ignore Rules

### Ignored Directories

These directories are skipped during scan, validation, and upload:

| Directory | Why |
|:----------|:----|
| `node_modules` | Package dependencies |
| `.git` | Version control |
| `.env` | Environment variables |
| `dist` | Build output (may conflict) |
| `build` | Build output |
| `.next` | Next.js internal |
| `.nuxt` | Nuxt internal |
| `.svelte-kit` | SvelteKit internal |
| `coverage` | Test coverage reports |
| `.cache` | Various cache data |
| `__pycache__` | Python cache |
| `.vscode` | Editor settings |
| `.idea` | IDE settings |
| `.DS_Store` | macOS metadata |
| `Thumbs.db` | Windows thumbnails |
| `.turbo` | Turborepo cache |
| `.vercel` | Vercel config |

### Ignored Files

| File | Why |
|:-----|:----|
| `.launchpd.json` | Project config (not a static asset) |
| `package-lock.json` | npm lock file |
| `yarn.lock` | Yarn lock file |
| `pnpm-lock.yaml` | pnpm lock file |
| `bun.lockb` | Bun lock file |
| `.DS_Store` | macOS metadata |
| `Thumbs.db` | Windows thumbnails |
| `desktop.ini` | Windows folder settings |
| `.gitignore` | Git ignore rules |
| `.npmignore` | npm ignore rules |
| `README.md` | Documentation |
| `LICENSE` | License file |

---

## Environment Variables

| Variable | Default | Description |
|:---------|:--------|:------------|
| API key env var | — | Alternative to storing credentials in file (checked by `getApiKey()`) |
| API secret env var | — | Alternative HMAC secret source (checked by `getApiSecret()`) |

When no credentials file or environment variable is found, the CLI falls back to `'public-beta-key'` for anonymous access.
