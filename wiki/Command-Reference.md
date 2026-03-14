# Command Reference

Complete reference for all Launchpd CLI commands.

---

## Deployment Commands

### `launchpd deploy [source]`

Deploy a local folder or remote URL to a live URL.

| Argument / Flag | Type | Default | Description |
|:----------------|:-----|:--------|:------------|
| `[source]` | string | `.` | Path to folder, GitHub repo URL, or Gist URL |
| `--name <subdomain>` | string | — | Use a custom subdomain |
| `-m, --message <text>` | string | — | Deployment version message |
| `--expires <time>` | string | — | Auto-delete after time (`30m`, `2h`, `1d`, `7d`) |
| `--branch <branch>` | string | — | Git branch for repo URLs |
| `--dir <path>` | string | — | Subdirectory within a repo |
| `-y, --yes` | flag | — | Auto-confirm all prompts |
| `--force` | flag | — | Force deploy even with warnings |
| `-o, --open` | flag | — | Open the site in browser after deploy |
| `--qr` | flag | — | Show QR code for the deployed URL |
| `--verbose` | flag | — | Show detailed error information |

**Examples:**

```bash
# Basic deploy
launchpd deploy .
launchpd deploy ./my-site

# Custom subdomain
launchpd deploy . --name portfolio

# With version message
launchpd deploy . -m "Added contact page"

# Temporary deployment (30 minutes)
launchpd deploy . --expires 30m

# Deploy and open in browser
launchpd deploy . --open

# Deploy with QR code display
launchpd deploy . --qr

# Remote deploy from GitHub
launchpd deploy https://github.com/user/repo
launchpd deploy https://github.com/user/repo --branch dev --dir dist

# Remote deploy from Gist
launchpd deploy https://gist.github.com/user/abc123

# Force deploy (skip validation warnings)
launchpd deploy . --force
```

**Deploy flow:**

1. **Source resolution** — local folder or remote URL (fetch → temp dir)
2. **Validation** — checks for static-only files
3. **Subdomain resolution** — from `--name`, `.launchpd.json`, or randomly generated
4. **Quota check** — ensures deployment is within limits
5. **Upload** — files uploaded sequentially with progress
6. **Finalization** — deployment marked active
7. **Post-deploy** — URL displayed, optional browser open / QR code

---

### `launchpd init`

Initialize a project by linking the current directory to a subdomain.

| Flag | Type | Description |
|:-----|:-----|:------------|
| `--name <subdomain>` | string | Subdomain to link to |

Creates `.launchpd.json` in the current directory. Requires authentication.

```bash
launchpd init
launchpd init --name my-portfolio
```

**Subdomain naming rules:**
- Lowercase alphanumeric and hyphens only (`^[a-z0-9-]+$`)
- Must not start or end with a hyphen

---

## Management Commands

### `launchpd status`

Show current project status for the linked subdomain.

Requires `.launchpd.json` to be present (run `launchpd init` first).

Displays:
- Linked subdomain and URL
- Active version number
- Last deploy date and message
- File count and total size
- Expiration status

```bash
launchpd status
```

---

### `launchpd list`

List all your deployments.

| Flag | Type | Description |
|:-----|:-----|:------------|
| `--json` | flag | Output as JSON |
| `--local` | flag | Only show locally cached deployments |
| `--verbose` | flag | Show detailed error information |

Tries the API first, falls back to local deployment cache.

```bash
launchpd list
launchpd list --json
launchpd list --local
```

**Table columns:** URL, version, folder, files, size, date, status (active/expired/inactive), message.

---

### `launchpd versions <subdomain>`

List all versions for a subdomain.

| Argument / Flag | Type | Description |
|:----------------|:-----|:------------|
| `<subdomain>` | string | The subdomain to list versions for |
| `--json` | flag | Output as JSON |
| `--verbose` | flag | Show detailed error information |

Requires authentication.

```bash
launchpd versions my-site
launchpd versions my-site --json
```

**Table columns:** Version number, date, files, size, status (active/inactive), message.

---

### `launchpd rollback <subdomain>`

Rollback a subdomain to a previous version.

| Argument / Flag | Type | Description |
|:----------------|:-----|:------------|
| `<subdomain>` | string | The subdomain to rollback |
| `--to <n>` | number | Specific version to rollback to |
| `--verbose` | flag | Show detailed error information |

```bash
launchpd rollback my-site          # Previous version
launchpd rollback my-site --to 2   # Specific version
```

Edge cases handled:
- Single version → nothing to rollback to
- Already at oldest version → blocked
- Target version already active → no-op

---

## Identity & Auth Commands

### `launchpd login`

Authenticate with your API key.

Prompts for the API key interactively (masked input). Validates the key format (`lpd_` prefix, 16-64 character suffix) and verifies against the server before saving.

```bash
launchpd login
```

---

### `launchpd logout`

Remove stored credentials from `~/.staticlaunch/credentials.json`.

```bash
launchpd logout
```

---

### `launchpd register`

Open the browser to create a new account at `https://launchpd.cloud/`.

```bash
launchpd register
```

---

### `launchpd whoami`

Show current account status and usage summary.

Displays:
- Email and account tier
- 2FA status
- Site usage vs. limit
- Storage usage vs. limit
- Anonymous limits (if not logged in)

```bash
launchpd whoami
```

---

### `launchpd quota`

View detailed storage and site usage with progress bars.

Displays:
- Account tier
- Sites used / limit (visual progress bar)
- Storage used / limit (visual progress bar)
- Retention policy
- Max versions per site

```bash
launchpd quota
```

---

### `launchpd verify`

Resend email verification.

```bash
launchpd verify
```

---

## Global Behavior

### Version Check

The CLI uses `update-notifier` to display a notice when a newer version is available on npm.

### Exit Codes

| Code | Meaning |
|:-----|:--------|
| `0` | Success |
| `1` | Error (validation failure, auth error, network error, etc.) |

### Verbose Mode

Add `--verbose` to deployment and management commands for detailed error output including cause chains and stack traces.
