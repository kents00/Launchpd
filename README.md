# Launchpd

**Deploy static sites instantly to a live URL. No config, no complexity.**

[![npm version](https://img.shields.io/npm/v/launchpd.svg)](https://www.npmjs.com/package/launchpd)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/kents00/launchpd.svg?style=social)](https://github.com/kents00/launchpd)

---

## Features

*   **Blazing Fast**: Deploy folders in seconds with a single command.
*   **Zero Config**: No YAML files or server setup required.
*   **Version Control**: Every deployment is versioned. Roll back instantly if something goes wrong.
*   **Secure**: Private uploads with API key authentication or safe anonymous testing.
*   **Auto-Expiration**: Set temporary deployments that delete themselves automatically.

---

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
| `launchpd deploy <folder>` | Deploy a local folder to a live URL |
| `launchpd deploy . --name site` | Deploy with a custom subdomain |
| `launchpd deploy . --expires 2h` | Set auto-deletion (e.g., `30m`, `1d`, `7d`) |

### Management
| Command | Description |
| :--- | :--- |
| `launchpd list` | View your active deployments |
| `launchpd versions <subdomain>` | See version history for a specific site |
| `launchpd rollback <subdomain>` | Rollback to the previous version |
| `launchpd rollback <id> --to <v>` | Rollback to a specific version number |

### Identity & Auth
| Command | Description |
| :--- | :--- |
| `launchpd register` | Open the dashboard to create an account |
| `launchpd login` | Authenticate with your API key |
| `launchpd whoami` | Show current account status |
| `launchpd quota` | View storage and site limits |
| `launchpd logout` | Remove stored credentials |

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

[MIT](LICENSE) © [Kent John Edoloverio](https://github.com/kents00)