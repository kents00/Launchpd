# Getting Started

## Installation

```bash
npm install -g launchpd
```

Requires **Node.js 20** or higher.

After installation, a setup summary is displayed automatically:

```
═══════════════════════════════════════
  Launchpd CLI
═══════════════════════════════════════

ℹ Launchpd is ready to use!

Configuration:
──────────────────────────────────────────
  Domain:         launchpd.cloud
  API:            https://api.launchpd.cloud
  Version:        1.0.6
──────────────────────────────────────────

Quick Start:
  Deploy your first site:
     launchpd deploy ./your-folder

  Login for more quota:
     launchpd login

  List your deployments:
     launchpd list

✓ No configuration needed - just deploy!
```

---

## Your First Deploy

```bash
# Deploy the current directory
launchpd deploy .

# Deploy a specific folder
launchpd deploy ./my-site

# Deploy with a custom subdomain name
launchpd deploy ./my-site --name cool-project
```

The CLI will:
1. Scan the folder for static files
2. Validate that only allowed file types are present
3. Upload files to the API
4. Return a live URL like `https://abc123xyz789.launchpd.cloud`

---

## Anonymous vs. Authenticated Usage

You can deploy immediately without an account. Anonymous deploys use a machine-bound client token for tracking.

| Feature          | Anonymous  | Registered (Free) |
|:-----------------|:-----------|:-------------------|
| **Max Sites**    | 3          | 10+                |
| **Storage**      | 50 MB      | 100 MB+            |
| **Custom Names** | No         | **Yes**            |
| **Retention**    | 7 Days     | **Permanent**      |
| **Versions**     | 1 per site | 10 per site        |

### Create an Account

```bash
launchpd register    # Opens browser to the dashboard
```

### Log In

```bash
launchpd login       # Prompts for your API key (starts with lpd_)
```

API keys are stored locally at `~/.staticlaunch/credentials.json` with `0600` permissions.

---

## Project Linking

For repeat deployments, link a directory to a subdomain:

```bash
cd my-project
launchpd init --name my-site
```

This creates `.launchpd.json` in the project root:

```json
{
  "subdomain": "my-site",
  "createdAt": "2026-01-15T10:30:00.000Z",
  "updatedAt": "2026-01-15T10:30:00.000Z"
}
```

Future deploys from that directory will automatically target the linked subdomain:

```bash
launchpd deploy .               # → deploys to my-site.launchpd.cloud
launchpd deploy . -m "v2 fix"   # → with a deployment message
```

---

## Versioning & Rollback

Every deployment creates a new version:

```bash
launchpd versions my-site       # See version history
launchpd rollback my-site       # Rollback to previous version
launchpd rollback my-site --to 2  # Rollback to version 2
```

---

## Temporary Deployments

Set an auto-expiration on deployment:

```bash
launchpd deploy . --expires 30m    # Delete after 30 minutes
launchpd deploy . --expires 2h     # Delete after 2 hours
launchpd deploy . --expires 7d     # Delete after 7 days
```

Minimum expiration time is **30 minutes**. Supported units: `m` (minutes), `h` (hours), `d` (days).

---

## Check Your Quota

```bash
launchpd quota     # Detailed usage with progress bars
launchpd whoami    # Account info + usage summary
```

---

## Remote Deployments

Deploy directly from GitHub without cloning:

```bash
# From a public repo
launchpd deploy https://github.com/user/repo

# From a specific branch and subdirectory
launchpd deploy https://github.com/user/repo --branch main --dir dist

# From a GitHub Gist
launchpd deploy https://gist.github.com/user/abc123
```

See [Remote Deployments](Remote-Deployments.md) for full details.

---

## Updating

The CLI uses `update-notifier` to alert you when a new version is available. Update with:

```bash
npm update -g launchpd
```
