# NEXORA Security Documentation

## Threat Model

NEXORA is a commercial browser extension with a license enforcement backend.
The primary threats considered are:

1. **License key theft / sharing** — keys HMAC-hashed, never stored in plaintext.
2. **Brute-force login to admin panel** — rate-limited (10 req/15 min), all failures logged.
3. **Session hijacking** — session tokens are random 32-byte values stored only as SHA-256 hashes; cookies are HttpOnly + Secure + SameSite=Lax.
4. **CSRF on admin writes** — double-submit CSRF token validated on every cookie-auth write.
5. **SQL injection** — 100% parameterized queries, no string concatenation of user input.
6. **Secret exposure** — secrets never logged, never returned in responses, loaded only from environment variables.
7. **Concurrent license activation race** — activation runs in SERIALIZABLE transactions with SELECT FOR UPDATE.
8. **XSS in admin dashboard** — strict CSP (script-src 'self'), no innerHTML with user data, Content-Type enforcement.

## Secret Management

| Secret | Length | Storage | Notes |
|--------|--------|---------|-------|
| `SESSION_SECRET` | ≥ 48 bytes base64url | Env var only | Used to sign session cookies. Rotate if compromised. |
| `LICENSE_HMAC_SECRET` | ≥ 48 bytes base64url | Env var only | HMAC-SHA256 key for license key hashes. Rotating invalidates all keys. |
| Admin passwords | min 12 chars | `scrypt$N$r$p$salt$hash` in DB | N=32768, r=8, p=1, keylen=64, 16-byte random salt. |
| Session tokens | 32 bytes random | SHA-256 hash in DB | Raw token only in cookie, never in DB. |
| License keys | 12 random chars | HMAC-SHA256 in DB | Plaintext shown once at generation, never persisted. |

## Authentication Flow

### Admin Login
1. Client POSTs `{email, password}` to `/api/admin/auth/login`.
2. Server rate-limits by IP (10 req/15 min). Trip logs to `security_events`.
3. Server looks up admin by email (citext comparison — case-insensitive).
4. Server always runs `verifyPassword()` — even for unknown emails — to prevent timing attacks.
5. On success, creates a session: 32-byte random token → SHA-256 stored in DB; raw token set as HttpOnly cookie.
6. CSRF token (24 bytes random, base64url) returned in JSON body and stored in DB session row.
7. All subsequent write requests must include `X-CSRF-Token` header matching the DB value.

### Session Lifecycle
- Sessions expire after 8 hours.
- Logout revokes the session row (sets `revoked_at`).
- Admin suspension immediately blocks all future requests (checked on every request, not cached).
- Developer session revocation is available to OWNER.
- Expired sessions are pruned hourly from the DB.

## License Security

- Keys are generated with `crypto.randomBytes` — never `Math.random()`.
- Key alphabet excludes confusable characters (0, 1, I, O, L).
- Only HMAC-SHA256(LICENSE_HMAC_SECRET, normalized_key) is stored — plaintext is discarded.
- Activation is serializable-isolated to prevent race conditions on device-limit enforcement.
- Concurrent activations for the same key on different servers require a shared DB — the DB is the source of truth.

## HTTP Security Headers

| Header | Value |
|--------|-------|
| Content-Security-Policy | `script-src 'self'; frame-ancestors 'none'; object-src 'none'` |
| Strict-Transport-Security | `max-age=63072000; includeSubDomains; preload` (production) |
| X-Frame-Options | `DENY` |
| Referrer-Policy | `no-referrer` |
| Cross-Origin-Opener-Policy | `same-origin` |
| Cross-Origin-Resource-Policy | `same-origin` |

## Incident Response

**Compromised SESSION_SECRET:**
1. Rotate the environment variable immediately.
2. All existing sessions become invalid (tokens can no longer be verified). Users must log in again.
3. Deploy and verify.

**Compromised LICENSE_HMAC_SECRET:**
1. This invalidates all existing license lookups — all keys become unusable.
2. Rotate the secret.
3. Re-generate and re-issue all affected licenses.
4. Treat this as a critical incident.

**Admin account compromise:**
1. Use the OWNER account to suspend the compromised DEVELOPER.
2. Call POST `/api/admin/developers/:id/revoke-sessions` to invalidate all sessions.
3. Reset the password via the bootstrap procedure (or direct DB update with a freshly scrypt-hashed password).
4. Review `audit_events` for actions taken during the compromise window.

**Mass activation of invalid keys:**
1. Review `security_events` for `rate_limit_exceeded` and `suspicious_activation` events.
2. Identify the IP range and block at the infrastructure/CDN level.
3. Revoke affected licenses if necessary.
