# NEXORA API Reference

Base URL: `https://your-backend.onrender.com/api`

All requests and responses use `application/json`.

Error format (4xx/5xx):
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "requestId": "abc123def456"
  }
}
```

---

## Public

### GET /health

Returns backend health status. Used by load balancers and monitoring.

**Auth:** None

**Response 200:**
```json
{
  "status": "ok",
  "db": true,
  "ts": "2024-01-01T00:00:00.000Z",
  "uptime": 3600
}
```

**Response 503:** (DB is down)
```json
{ "status": "degraded", "db": false, "ts": "...", "uptime": 3600 }
```

---

## Admin Authentication

All admin routes use HttpOnly cookie sessions (`nexora_session`).
Write operations additionally require `X-CSRF-Token` header matching the CSRF token returned at login.

### POST /admin/auth/login

**Auth:** None  
**Rate limit:** 10 requests per 15 minutes per IP

**Request:**
```json
{ "email": "admin@example.com", "password": "SecurePassword123!" }
```

**Response 200:**
```json
{
  "user": { "id": "uuid", "email": "admin@example.com", "role": "OWNER", "permissions": [] },
  "csrfToken": "base64url-string"
}
```
Sets `nexora_session` cookie (HttpOnly, Secure, SameSite=Lax).

**Response 401:** Invalid credentials  
**Response 429:** Rate limit exceeded

---

### GET /admin/auth/me

**Auth:** Session cookie

**Response 200:**
```json
{
  "user": { "id": "uuid", "email": "...", "role": "OWNER", "permissions": [], "isSuspended": false },
  "csrfToken": "base64url-string"
}
```

---

### POST /admin/auth/logout

**Auth:** Session cookie + `X-CSRF-Token` header

**Response 200:** `{ "ok": true }`

---

## Admin — Overview

### GET /admin/overview

**Auth:** Session cookie  
**Permission:** Any valid admin

**Response 200:**
```json
{
  "licenses": { "total": 100, "active": 60, "expired": 20, "revoked": 5, "unused": 15, "suspended": 0 },
  "customers": { "total": 50, "banned": 2 },
  "developers": { "total": 3, "suspended": 0 },
  "recentAudit": [{ "id": "1", "action": "license.bulk_generate", "actorKind": "admin", "actorId": "uuid", "createdAt": "..." }],
  "health": { "db": true, "uptime": 3600 }
}
```

---

## Admin — Licenses

### GET /admin/licenses

**Auth:** Session cookie  
**Query params:** `q` (search), `status`, `plan`, `limit` (max 200), `offset`

**Response 200:**
```json
{
  "licenses": [{ "id": "uuid", "plan": "WEEK", "status": "active", "deviceLimit": 2, "expiresAt": "...", "createdAt": "..." }],
  "total": 42
}
```

---

### POST /admin/licenses/bulk

**Auth:** Session cookie + CSRF  
**Permission:** `licenses.write` (or OWNER)

**Request:**
```json
{
  "plan": "WEEK",
  "count": 10,
  "deviceLimit": 2,
  "activationPolicy": "on_first_use",
  "notes": "Batch for campaign X"
}
```

**Response 200:**
```json
{
  "keys": ["NEXORA-WEEK-XXXX-XXXX-XXXX", "..."],
  "licenseIds": ["uuid", "..."],
  "warning": "These license keys are shown exactly once and are not stored in plaintext. Copy them now."
}
```

---

### POST /admin/licenses/:id/revoke

**Auth:** Session cookie + CSRF  
**Permission:** `licenses.write` (or OWNER)

**Request:** `{ "reason": "Optional reason" }`  
**Response 200:** `{ "ok": true }`  
**Response 404:** License not found

---

### POST /admin/licenses/:id/restore

**Auth:** Session cookie + CSRF  
**Permission:** `licenses.write` (or OWNER)

**Response 200:** `{ "ok": true }`

---

### GET /admin/licenses/:id/activations

**Auth:** Session cookie

**Response 200:**
```json
{
  "activations": [{
    "id": "uuid", "deviceId": "...", "ip": "1.2.3.4",
    "userAgent": "...", "activatedAt": "...", "lastSeenAt": "...", "deactivatedAt": null
  }]
}
```

---

## Admin — Customers

### GET /admin/customers

**Auth:** Session cookie  
**Query params:** `q`, `limit`, `offset`

**Response 200:** `{ "customers": [...], "total": 10 }`

---

### POST /admin/customers/:id/ban

**Auth:** Session cookie + CSRF  
**Permission:** `customers.write` (or OWNER)

**Response 200:** `{ "customer": { ... } }`

---

### POST /admin/customers/:id/unban

**Auth:** Session cookie + CSRF  
**Permission:** `customers.write` (or OWNER)

---

## Admin — Developers (OWNER only)

### GET /admin/developers

**Auth:** Session cookie (OWNER role)

**Response 200:** `{ "developers": [...] }`

---

### POST /admin/developers

**Auth:** Session cookie + CSRF (OWNER role)

**Request:** `{ "email": "dev@example.com", "password": "SecurePassword123!", "permissions": ["licenses.write"] }`  
**Response 201:** `{ "developer": { ... } }`

---

### POST /admin/developers/:id/suspend

**Auth:** Session cookie + CSRF (OWNER role)

**Response 200:** `{ "ok": true }`

---

### POST /admin/developers/:id/revoke-sessions

**Auth:** Session cookie + CSRF (OWNER role)

**Response 200:** `{ "ok": true, "sessionsRevoked": 3 }`

---

## Admin — Audit

### GET /admin/audit

**Auth:** Session cookie  
**Permission:** `audit.read` (or OWNER)  
**Query params:** `limit`, `offset`

**Response 200:**
```json
{
  "audit": [{ "id": "1", "actorKind": "admin", "action": "license.revoke", "createdAt": "..." }],
  "security": [{ "id": "1", "kind": "rate_limit_exceeded", "ip": "...", "createdAt": "..." }],
  "total": 10
}
```

---

## License / Extension API

These endpoints are called by the browser extension.

**Rate limit:** 60 requests per minute per IP (license), 30 per minute (extension feature-check).

### POST /license/activate

**Auth:** None (key-based)

**Request:**
```json
{ "key": "NEXORA-WEEK-XXXX-XXXX-XXXX", "deviceId": "stable-device-uuid", "deviceFingerprint": "optional" }
```

**Response 200:**
```json
{
  "licenseId": "uuid", "plan": "WEEK", "status": "active",
  "expiresAt": "2024-02-01T00:00:00.000Z", "deviceLimit": 2,
  "activationId": "uuid", "reactivated": false
}
```

**Response 404:** Key not found  
**Response 409:** Expired / revoked / suspended / device limit reached

---

### GET /license/status

**Auth:** None  
**Query params:** `key`, `deviceId`

**Response 200:**
```json
{
  "valid": true, "plan": "WEEK", "status": "active",
  "expiresAt": "2024-02-01T00:00:00.000Z", "deviceLimit": 2
}
```

---

### POST /license/deactivate

**Request:** `{ "key": "NEXORA-...", "deviceId": "..." }`  
**Response 200:** `{ "ok": true }`  
**Response 404:** Device not found

---

### POST /extension/feature-check

**Request:** `{ "key": "NEXORA-...", "deviceId": "...", "feature": "ai" }`

**Response 200:** `{ "allowed": true, "plan": "WEEK", "expiresAt": "..." }`  
**Response 403:** Feature not allowed on plan
