# Launchpd

**Deploy static sites instantly to a live URL. No config, no complexity.**

[![npm version](https://img.shields.io/npm/v/launchpd.svg)](https://www.npmjs.com/package/launchpd)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/kents00/launchpd.svg?style=social)](https://github.com/kents00/launchpd)

---

## Features

* **Blazing Fast**: Deploy folders in seconds with a single command.
* **Project-Based**: Link local folders to subdomains once and deploy without re-typing names.
* **Zero Config**: No complex setup; optionally use `.launchpd.json` for project persistence.
* **Version Control**: Every deployment is versioned with messages. Roll back instantly.
* **Static-Only Security**: Strict validation ensures only high-performance static assets are deployed.
* **Secure**: Private uploads with API key authentication or safe anonymous testing.
* **Auto-Expiration**: Set temporary deployments that delete themselves automatically.

## Quick Start

```bash
# Install globally
npm install -g launchpd

# Deploy your current folder
launchpd deploy .
```

---

## Installation

```bash
npm install -g launchpd
```
*Requires **Node.js 20** or higher.*

---

## Command Reference

### Deployment
| Command | Description |
| :--- | :--- |
| `launchpd init` | Link current folder to a subdomain (persisted in `.launchpd.json`) |
| `launchpd deploy <folder>` | Deploy a local folder (uses linked subdomain if available) |
| `launchpd deploy . -m "Fix layout"` | Deploy with a message (like a git commit) |
| `launchpd deploy . --name site` | Deploy with a custom subdomain explicitly |
| `launchpd deploy . --expires 2h` | Set auto-deletion (e.g., `30m`, `1d`, `7d`) |
| `launchpd deploy . --open` | Deploy and immediately open the site in your browser |

### Management
| Command | Description |
| :--- | :--- |
| `launchpd status` | Show linked subdomain and latest deployment info |
| `launchpd list` | View your active deployments |
| `launchpd versions <subdomain>` | See version history with messages |
| `launchpd rollback <subdomain>` | Rollback to the previous version |
| `launchpd rollback <subdomain> --to <v>` | Rollback to a specific version number |

### Identity & Auth
| Command | Description |
| :--- | :--- |
| `launchpd register` | Open the dashboard to create an account |
| `launchpd login` | Authenticate with your API key |
| `launchpd whoami` | Show current account status |
| `launchpd quota` | View storage and site limits |
| `launchpd logout` | Remove stored credentials |

**API Key format**: keys start with `lpd_` and are validated before network requests.

---

## Why Register?

While anonymous deployments are great for testing, registered users get more power:

| Feature | Anonymous | Registered (Free) |
| :--- | :--- | :--- |
| **Max Sites** | 3 | 10+ |
| **Storage** | 50MB | 100MB+ |
| **Custom Names** | No | **Yes** |
| **Retention** | 7 Days | **Permanent** |
| **Versions** | 1 per site | 10 per site |

Run `launchpd register` to unlock these benefits!

---

## Support

*   **Bugs & Feedback**: [GitHub Issues](https://github.com/kents00/launchpd/issues)
*   **Website**: [launchpd.cloud](https://launchpd.cloud)
*   **Docs**: [launchpd.cloud/docs](https://launchpd.cloud/docs)

---

## License

[MIT](LICENSE) © [Kent Edoloverio](https://github.com/kents00)

---

## Publishing (Maintainers)

Publishing is automated from GitHub Releases. Create a release tag like `v1.0.4` and the workflow will:

1. Extract the version from the tag
2. Update `package.json`
3. Run tests
4. Publish to npm

Ensure `NPM_TOKEN` is set in GitHub Actions secrets.
