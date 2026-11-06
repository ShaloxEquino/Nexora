# NEXORA Deployment Guide

## Prerequisites

- A [Render](https://render.com) account
- Node.js 22 LTS locally (for local dev)
- PostgreSQL 15+ (Render Postgres, Supabase, or any managed PG)

---

## Step 1: Prepare Environment Variables

Generate secure secrets. Each must be a cryptographically random base64url string of at least 48 bytes:

```bash
# Generate SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# Generate LICENSE_HMAC_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Required environment variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (provided by Render Postgres) |
| `SESSION_SECRET` | Min 48-byte base64url string |
| `LICENSE_HMAC_SECRET` | Min 48-byte base64url string. **Rotating this invalidates all license keys.** |
| `ADMIN_ORIGIN` | URL of the admin dashboard (e.g., `https://nexora.onrender.com`) |
| `EXTENSION_ORIGIN` | Chrome extension origin (e.g., `chrome-extension://your-extension-id`) |
| `NODE_ENV` | Set to `production` |

---

## Step 2: Deploy on Render

### Using render.yaml (Infrastructure-as-Code)

1. Push the NEXORA monorepo to a GitHub/GitLab repository.
2. In Render Dashboard → New → Blueprint → connect your repository.
3. Render will detect `render.yaml` and create:
   - The Node.js web service
   - The PostgreSQL addon

4. Set the secret environment variables in the Render Dashboard (they are marked `sync: false` in `render.yaml` so you set them manually).

### Manual Setup

1. Create a **PostgreSQL** database in Render (plan: Starter or above).
2. Create a **Web Service**:
   - **Environment:** Node
   - **Build Command:** `npm ci && npm run build -w shared && npm run build -w backend`
   - **Start Command:** `node backend/dist/index.js`
   - **Pre-Deploy Command:** `npm run migrate -w backend`
   - **Health Check Path:** `/api/health`
3. Add all required environment variables.

---

## Step 3: Run Database Migrations

Migrations run automatically on each Render deploy via the pre-deploy command. To run them manually:

```bash
# Locally against production DB (use with care)
DATABASE_URL="postgres://..." npm run migrate -w backend

# Or directly
DATABASE_URL="postgres://..." npx tsx backend/src/db/migrate.ts
```

Migrations are idempotent — re-running is safe.

---

## Step 4: Bootstrap the Owner Account

**This must be done exactly once, before any other admin login.**

The `bootstrap-owner` script refuses to run if any OWNER already exists.

```bash
# On Render: use the Shell tab of your web service
# Or locally with the production DATABASE_URL:

DATABASE_URL="postgres://..." BOOTSTRAP_EMAIL="owner@example.com" BOOTSTRAP_PASSWORD="YourSecurePassword123" npm run bootstrap-owner -w backend
```

Alternatively, run interactively (prompts for email and password):
```bash
DATABASE_URL="postgres://..." npx tsx backend/src/scripts/bootstrap-owner.ts
```

**Password requirements:** Minimum 12 characters.

---

## Step 5: Verification Smoke Test

After deployment, verify the following:

```bash
# 1. Health check
curl https://your-app.onrender.com/api/health
# Expected: {"status":"ok","db":true,...}

# 2. Admin login
curl -c cookies.txt -X POST https://your-app.onrender.com/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"YourSecurePassword123"}'
# Expected: {"user":{...},"csrfToken":"..."}

# 3. Admin dashboard
# Open https://your-app.onrender.com in a browser
# Should show the NEXORA login page

# 4. License generation (requires CSRF token from step 2)
# Use the dashboard UI or the API directly with the cookie + CSRF token
```

---

## Local Development

```bash
# 1. Clone the repo
git clone https://github.com/your-org/nexora.git
cd nexora

# 2. Install dependencies
npm install

# 3. Copy and edit env
cp .env.example .env
# Edit .env with your local Postgres URL and generated secrets

# 4. Run migrations
npm run migrate

# 5. Bootstrap owner (first time only)
npm run bootstrap-owner

# 6. Start dev servers
npm run dev
# Backend: http://localhost:3000
# Extension: load extension/dist as an unpacked extension in Chrome

# 7. Run tests
DATABASE_URL_TEST="postgres://..." npm test
```

---

## Extension Distribution

1. Build the extension:
```bash
npm run build -w extension
```

2. Package for the Chrome Web Store:
```bash
bash scripts/package-zip.sh
```

3. Upload `nexora-extension-v1.0.0.zip` to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

4. After approval, configure `EXTENSION_ORIGIN` in your backend environment to match the assigned extension ID.

---

## Render Free Tier Notes

- The Render free tier sleeps after 15 minutes of inactivity.
- Cold starts take 20–60 seconds.
- Upgrade to a paid plan for always-on behavior in production.

---

## Backup and Recovery

- Render Postgres includes daily backups on paid plans.
- `LICENSE_HMAC_SECRET` rotation requires re-generating all license keys — treat it as a critical operation.
- `SESSION_SECRET` rotation invalidates all active admin sessions (users must log in again).
