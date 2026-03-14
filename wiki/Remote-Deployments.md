# Remote Deployments

Deploy directly from GitHub repositories and Gists without cloning locally.

---

## Supported Sources

| Source | URL Pattern | Example |
|:-------|:------------|:--------|
| GitHub Repository | `https://github.com/<owner>/<repo>` | `https://github.com/user/my-site` |
| GitHub Gist | `https://gist.github.com/<owner>/<gistId>` | `https://gist.github.com/user/abc123` |

Only `https://` URLs are accepted. HTTP URLs are rejected.

---

## Usage

### Deploy from a Repository

```bash
# Deploy the root of a repo (default branch)
launchpd deploy https://github.com/user/repo

# Deploy a specific branch
launchpd deploy https://github.com/user/repo --branch dev

# Deploy a specific subdirectory
launchpd deploy https://github.com/user/repo --dir dist

# Combine branch + directory
launchpd deploy https://github.com/user/repo --branch main --dir build

# With deployment message
launchpd deploy https://github.com/user/repo -m "Deploy from main"
```

### Deploy from a Gist

```bash
# Deploy all files from a gist
launchpd deploy https://gist.github.com/user/abc123

# With custom subdomain
launchpd deploy https://gist.github.com/user/abc123 --name my-gist
```

---

## How It Works

### Repository Flow

```
GitHub Repo URL
    │
    ▼
Parse URL → owner, repo, branch
    │
    ▼
Fetch tarball from GitHub API
(GET /repos/:owner/:repo/tarball/:branch)
    │
    ├── Validate Content-Type (must not be text/html)
    ├── Check Content-Length (≤ 100 MB)
    │
    ▼
Stream: Size Limit → Gunzip → Tar Extract
    │
    ├── strip: 1 (removes root directory prefix)
    ├── Skip symlinks and hard links
    ├── Skip ignored files (node_modules, .git, etc.)
    ├── Enforce max 10,000 files
    ├── Enforce max 50 levels depth
    │
    ▼
Apply --dir filter (if specified)
    │
    ▼
Deploy extracted folder → standard upload flow
    │
    ▼
Cleanup temp directory
```

### Gist Flow

```
Gist URL
    │
    ▼
Parse URL → owner, gistId
    │
    ▼
Fetch Gist metadata from GitHub API
(GET /gists/:id)
    │
    ▼
For each file in gist:
    ├── Validate filename (sanitization)
    ├── If truncated: download raw content
    │   ├── Validate raw_url against trusted hosts
    │   ├── Check Content-Length (cumulative ≤ 100 MB)
    │   └── Download with 30s timeout
    └── If inline: write content directly
    │
    ├── Truncated files download in parallel (5 at a time)
    │
    ▼
Deploy temp directory → standard upload flow
    │
    ▼
Cleanup temp directory
```

---

## Options

| Flag | Applies To | Default | Description |
|:-----|:-----------|:--------|:------------|
| `--branch <branch>` | Repos only | default branch | Git branch to fetch |
| `--dir <path>` | Repos only | repo root | Subdirectory within the repo |
| `--name <subdomain>` | Both | random | Custom subdomain |
| `-m, --message <text>` | Both | — | Deployment message |
| `--expires <time>` | Both | — | Auto-expiration |
| `--force` | Both | — | Bypass validation warnings |
| `--open` | Both | — | Open in browser after deploy |
| `--qr` | Both | — | Show QR code |

---

## Security Protections

### SSRF Prevention

Raw file download URLs (for truncated Gist files) are validated against a trusted-host allowlist:

- `gist.githubusercontent.com`
- `raw.githubusercontent.com`

All other domains, including `localhost`, internal IPs, and arbitrary external hosts, are rejected.

### Path Traversal Prevention

The `--dir` option is validated using `path.resolve()` + `startsWith()` to ensure the resolved path stays within the extraction directory.

```bash
# These are rejected:
launchpd deploy https://github.com/user/repo --dir ../../etc
launchpd deploy https://github.com/user/repo --dir /absolute/path
```

### Download Size Limits

- **Pre-check:** `Content-Length` header verified before streaming (≤ 100 MB)
- **Streaming:** Byte counter enforces the limit during download, catching servers that lie about content length

### Tarball Safety

| Threat | Protection |
|:-------|:-----------|
| Tar bomb (file count) | Max 10,000 files |
| Tar bomb (depth) | Max 50 directory levels |
| Symlink escape | All symbolic links rejected |
| Hard link attack | All hard links rejected |
| Fake tarball (HTML login page) | Content-Type validation |

### Gist Filename Sanitization

| Threat | Check |
|:-------|:------|
| Path traversal | Rejects `..` |
| Path separator injection | Rejects `/` and `\` |
| Null byte injection | Rejects `\0` |
| Dot-only names | Rejects `.`, `...` |
| Windows reserved names | Rejects `CON`, `NUL`, `AUX`, `PRN`, `COM1`–`COM9`, `LPT1`–`LPT9` |

### Fetch Timeouts

All remote fetch calls use a 30-second `AbortController` timeout.

### Rate Limiting

GitHub API `403` responses with `X-RateLimit-Remaining: 0` produce a clear error message with the rate limit reset time.

---

## Constants

| Name | Value | Purpose |
|:-----|:------|:--------|
| `MAX_DOWNLOAD_BYTES` | 104,857,600 (100 MB) | Total download size limit |
| `MAX_FILE_COUNT` | 10,000 | Max files in a tarball |
| `MAX_EXTRACT_DEPTH` | 50 | Max directory nesting |
| `GIST_PARALLEL_LIMIT` | 5 | Concurrent truncated file downloads |
| `FETCH_TIMEOUT_MS` | 30,000 | Fetch timeout per request |

---

## Cleanup

Temporary directories are created via `os.tmpdir()` + `mkdtemp()` and cleaned up:

- **On success:** after upload completes
- **On error:** in `finally` block
- **Best-effort:** `cleanupTempDir()` uses `rm -rf` and does not throw on failure
