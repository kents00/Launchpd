# Error Handling

Launchpd uses a typed error hierarchy with user-friendly messages and actionable suggestions.

---

## Error Class Hierarchy

```
Error
├── APIError (base for all API errors)
│   ├── MaintenanceError (HTTP 503)
│   ├── AuthError (HTTP 401)
│   ├── QuotaError (HTTP 429)
│   └── TwoFactorRequiredError (HTTP 200 with 2FA flag)
└── NetworkError (timeout, DNS failure, connection refused)
```

### APIError

Base class for all server-returned errors.

| Property | Type | Description |
|:---------|:-----|:------------|
| `statusCode` | number | HTTP status code (default: 500) |
| `data` | object | Raw server response data |
| `isAPIError` | boolean | Always `true` |

### MaintenanceError

Thrown when the server returns HTTP 503 (Service Unavailable).

| Property | Type | Description |
|:---------|:-----|:------------|
| `isMaintenanceError` | boolean | Always `true` |

**User message:** "Server is under maintenance. Please try again later."

### AuthError

Thrown when the server returns HTTP 401 (Unauthorized).

| Property | Type | Description |
|:---------|:-----|:------------|
| `isAuthError` | boolean | Always `true` |
| `requires2FA` | boolean | Whether 2FA is needed |
| `twoFactorType` | string | Type of 2FA (`email`, etc.) |

**User message:** "Authentication failed. Run `launchpd login` to authenticate."

### QuotaError

Thrown when the server returns HTTP 429 (Too Many Requests / quota exceeded).

| Property | Type | Description |
|:---------|:-----|:------------|
| `isQuotaError` | boolean | Always `true` |

**User message:** "Quota exceeded. Run `launchpd quota` to check your usage."

### TwoFactorRequiredError

Thrown when a login response indicates 2FA verification is pending.

| Property | Type | Description |
|:---------|:-----|:------------|
| `isTwoFactorRequired` | boolean | Always `true` |
| `twoFactorType` | string | Type of 2FA (`email`, etc.) |

### NetworkError

Thrown for connection-level failures (DNS, timeout, connection refused).

| Property | Type | Description |
|:---------|:-----|:------------|
| `isNetworkError` | boolean | Always `true` |

**User message:** "Network error. Check your internet connection and try again."

---

## Common Error Handler

The `handleCommonError(err, logger)` function routes typed errors to user-friendly output:

```js
import { handleCommonError } from '../utils/errors.js';

try {
  await apiRequest('/api/some-endpoint');
} catch (err) {
  if (handleCommonError(err, logger)) return; // handled
  // Fallback for unknown errors
  logger.error(`Unexpected error: ${err.message}`);
}
```

Returns `true` if the error was recognized and handled (message printed). Returns `false` for unknown error types.

---

## errorWithSuggestions

The primary user-facing error display function:

```js
errorWithSuggestions(
  'Deployment failed: folder is empty',
  [
    'Add some files to the folder first',
    'Check if your build completed successfully',
    'Run "launchpd deploy --verbose" for more details'
  ],
  { verbose: true, cause: originalError }
);
```

Output:
```
✗ Deployment failed: folder is empty

  • Add some files to the folder first
  • Check if your build completed successfully
  • Run "launchpd deploy --verbose" for more details
```

With `--verbose`, the cause chain and stack trace are also printed.

---

## Error Patterns by Command

### deploy

| Scenario | Error Type | Suggestions |
|:---------|:-----------|:------------|
| Folder doesn't exist | Generic | Check path, use `--verbose` |
| No files found | Generic | Add files, check build |
| Non-static files detected | Generic | Remove server files, use `--force` |
| Subdomain taken by another user | Generic | Choose different name |
| Quota exceeded | QuotaError | Check usage, delete old sites |
| Network failure mid-upload | NetworkError | Check connection, retry |
| Server maintenance | MaintenanceError | Try again later |
| Auth failure | AuthError | Run `launchpd login` |

### auth (login)

| Scenario | Error Type | Suggestions |
|:---------|:-----------|:------------|
| Invalid API key format | Generic | Format: `lpd_xxxx` |
| Wrong API key | AuthError | Check dashboard for correct key |
| 2FA pending | TwoFactorRequired | Check email for verification |
| Server timeout | NetworkError | Check connection |

### list / versions / rollback

| Scenario | Error Type | Suggestions |
|:---------|:-----------|:------------|
| Not logged in | AuthError | Run `launchpd login` |
| Subdomain not found | APIError | Check subdomain name |
| No versions to rollback | Generic | Nothing to rollback to |
| API unreachable | NetworkError | Falls back to local data |

---

## Verbose Mode

All commands that accept `--verbose` pass the flag through to error handlers. In verbose mode:

1. The `cause` chain is printed (each nested error message)
2. Stack traces may be shown for unexpected errors
3. Additional diagnostic information is logged

```bash
launchpd deploy . --verbose
```

---

## Exit Codes

| Code | Meaning |
|:-----|:--------|
| `0` | Success |
| `1` | Any error (all commands use `process.exit(1)` on failure) |

Exceptions: `status` command degrades gracefully without exiting on API failures.
